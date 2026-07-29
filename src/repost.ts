import { botApp, selfUserId, teamId } from "./slack_bot"
import { installationStore } from "./installationStore"
import { deleteMessage } from "./usersManager"
import { handleAuth } from "./permissions"


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
                    text: "hi i need you to authorise me so i can repost ur stuff with <!channel>.",
                },
            },
            {
                type: "actions",
                elements: [
                    {
                        type: "button",
                        text: { type: "plain_text", text: "authorize" },
                        url: oauthUrl,
                        action_id: "oauth_authorize",
                    },
                    {
                        type: "button",
                        text: { type: "plain_text", text: "yeah i alr did that dude" },
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

    
    const authed = await handleAuth(userId, channelId, botApp, messageTs)
    if (!authed) return { ok: false, error: "unauthorized" }



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

    // Re-host attachments on the Hack Club CDN. The CDN pulls the bytes from
    // Slack's url_private using our bot token (via X-Download-Authorization),
    // and returns a public URL we can drop into an image block.
    const cdnKey = process.env.HC_CDN_API_KEY
    type ImageBlock = {
        type: "image"
        image_url: string
        alt_text: string
        title?: { type: "plain_text"; text: string }
    }
    const imageBlocks: ImageBlock[] = []
    if (cdnKey) {
        for (const file of original.files ?? []) {
            if (!file.url_private || !file.id) continue
            try {
                const resp = await fetch("https://cdn.hackclub.com/api/v4/upload_from_url", {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${cdnKey}`,
                        "Content-Type": "application/json",
                        "X-Download-Authorization": `Bearer ${process.env.BSLACK_TOKEN}`,
                    },
                    body: JSON.stringify({ url: file.url_private }),
                })
                if (!resp.ok) {
                    console.error(
                        `cdn upload failed for ${file.id}: ${resp.status} ${await resp.text()}`,
                    )
                    continue
                }
                const { url } = (await resp.json()) as { url?: string }
                if (!url) continue
                imageBlocks.push({
                    type: "image",
                    image_url: url,
                    alt_text: file.name ?? "attachment",
                    title: file.name ? { type: "plain_text", text: file.name } : undefined,
                })
            } catch (e) {
                console.error(`failed to re-host ${file.id}`, e)
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