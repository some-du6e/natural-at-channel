import { botApp, selfUserId, teamId } from "./slack_bot"
import { installationStore } from "./installationStore"
import { deleteMessage } from "./usersManager"

function replaceSelfMention(message: string) {
    return message.replaceAll(`<@${selfUserId}>`, "<!channel>")
}

async function getUserToken(userId: string): Promise<string | null> {
    try {
        const installation = await installationStore.fetchInstallation({
            teamId,
            userId,
            isEnterpriseInstall: false,
        })
        return installation.user?.token ?? null
    } catch {
        return null
    }
}

export async function buildOAuthUrl(): Promise<string> {
    const port = process.env.PORT ?? 3000
    const base = process.env.PUBLIC_URL ?? `http://localhost:${port}`
    return `${base}/slack/install`
}

export async function sendAuthPrompt(channelId: string, userId: string, messageTs: string) {
    const oauthUrl = await buildOAuthUrl()
    const payload = JSON.stringify({ channel: channelId, ts: messageTs })

    await botApp.client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: "Authorize the app to repost as @channel",
        blocks: [
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: "hi i need you to authorise <!channel>.",
                },
            },
            {
                type: "actions",
                elements: [
                    {
                        type: "button",
                        text: { type: "plain_text", text: "Authorize" },
                        url: oauthUrl,
                        action_id: "oauth_authorize",
                    },
                    {
                        type: "button",
                        text: { type: "plain_text", text: "I've authorized — retry" },
                        action_id: "retry_repost",
                        value: payload,
                    },
                ],
            },
        ],
    })
}

export type RepostResult = { ok: true } | { ok: false; error: string }

export async function repostAsChannelAndDelete(
    channelId: string,
    messageTs: string,
    userId: string,
): Promise<RepostResult> {
    const userToken = await getUserToken(userId)
    if (!userToken) {
        return { ok: false, error: "no_token" }
    }

    // Refetch the original message so we have its text + author profile.
    const history = await botApp.client.conversations.history({
        channel: channelId,
        latest: messageTs,
        inclusive: true,
        limit: 1,
    })
    const original = history.messages?.[0]
    const originalText = original?.text
    const originalUser = original?.user
    if (!original || !originalText || !originalUser) {
        return { ok: false, error: "original_message_not_found" }
    }
    if (!originalText.includes(`<@${selfUserId}>`)) {
        return { ok: false, error: "not_a_self_mention" }
    }

    const { user } = await botApp.client.users.info({ user: originalUser })
    const username =
        user?.profile?.display_name || user?.profile?.real_name || user?.name || originalUser
    const iconUrl = user?.profile?.image_192 || user?.profile?.image_72

    const text = replaceSelfMention(originalText)

    // Re-upload attachments to a private staging channel so the resulting
    // file-share message doesn't clutter the main channel. The permalink_public
    // we get back is externally renderable, so the image block on the main
    // message can reference it.
    const stagingChannel = process.env.FILE_STAGING_CHANNEL_ID
    type ImageBlock = {
        type: "image"
        image_url: string
        alt_text: string
        title?: { type: "plain_text"; text: string }
    }
    const imageBlocks: ImageBlock[] = []
    if (stagingChannel) {
        for (const file of original.files ?? []) {
            if (!file.url_private || !file.id) continue
            try {
                const resp = await fetch(file.url_private, {
                    headers: { Authorization: `Bearer ${process.env.BSLACK_TOKEN}` },
                })
                if (!resp.ok) {
                    console.error(`failed to download ${file.id}: ${resp.status}`)
                    continue
                }
                const buffer = await resp.arrayBuffer()
                // Upload as the bot (not the user) so we don't require the
                // user to be in the staging channel.
                const uploaded = await botApp.client.files.uploadV2({
                    file: Buffer.from(buffer),
                    filename: file.name ?? file.id,
                    title: file.title ?? file.name,
                    channel_id: stagingChannel,
                })
                const newFile = (
                    uploaded as {
                        file?: {
                            id?: string
                            name?: string
                            permalink_public?: string
                        }
                    }
                ).file
                if (!newFile?.id || !newFile.permalink_public) continue

                // files.uploadV2 doesn't always return a working public URL —
                // call files.sharedPublicURL to force-generate one, then
                // rewrite it to the files-pri direct-bytes form Slack image
                // blocks can render. See Hack Club CDN docs:
                //   https://slack-files.com/T-F-PUBKEY
                //   → https://files.slack.com/files-pri/T-F/FILENAME?pub_secret=PUBKEY
                const shared = await botApp.client.files.sharedPublicURL({
                    file: newFile.id,
                })
                const sharedFile = (shared as { file?: { permalink_public?: string } })
                    .file
                const pubUrl = sharedFile?.permalink_public ?? newFile.permalink_public
                const m = pubUrl.match(/slack-files\.com\/([A-Z0-9]+)-([A-Z0-9]+)-([a-z0-9]+)/i)
                if (!m) {
                    console.error(`could not parse permalink_public: ${pubUrl}`)
                    continue
                }
                const [, teamId, fileId, pubSecret] = m
                const filename = encodeURIComponent(newFile.name ?? "image.png")
                const directUrl = `https://files.slack.com/files-pri/${teamId}-${fileId}/${filename}?pub_secret=${pubSecret}`

                imageBlocks.push({
                    type: "image",
                    image_url: directUrl,
                    alt_text: newFile.name ?? "attachment",
                    title: newFile.name
                        ? { type: "plain_text", text: newFile.name }
                        : undefined,
                })
            } catch (e) {
                console.error(`failed to re-upload ${file.id}`, e)
            }
        }
    }

    await botApp.client.chat.postMessage({
        channel: channelId,
        text,
        blocks: [
            { type: "section", text: { type: "mrkdwn", text } },
            ...imageBlocks,
        ],
        username,
        icon_url: iconUrl,
    })

    try {
        await deleteMessage(userToken, messageTs, channelId, botApp)
    } catch (e) {
        console.error("chat.delete failed", e)
        return { ok: false, error: `delete_failed: ${(e as Error).message}` }
    }

    return { ok: true }
}
