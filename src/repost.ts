import { botApp, selfUserId, teamId } from "./slack_bot"
import { installationStore } from "./installationStore"
import { deleteMessage, subscribeToThread } from "./usersManager"
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
    const authed = await handleAuth(userId, channelId, botApp, messageTs, teamId!)
    if (!authed) return { ok: false, error: "unauthorized" }

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
    type SectionBlock = {
        type: "section"
        text: { type: "mrkdwn"; text: string }
    }
    type VideoBlock = {
        type: "video"
        video_url: string
        thumbnail_url: string
        alt_text: string
        title: { type: "plain_text"; text: string }
    }
    const attachmentBlocks: (ImageBlock | SectionBlock | VideoBlock)[] = []
    // Re-host a Slack-private URL on the CDN, then follow the CDN's 302 to its
    // final host. cdn.hackclub.com redirects to user-cdn.hackclub-assets.com,
    // and Slack's embed/unfurl check validates the terminal host against the
    // app's claimed unfurl domains, so callers need the resolved URL.
    async function rehost(sourceUrl: string): Promise<string | null> {
        const resp = await fetch("https://cdn.hackclub.com/api/v4/upload_from_url", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${cdnKey}`,
                "Content-Type": "application/json",
                "X-Download-Authorization": `Bearer ${process.env.BSLACK_TOKEN}`,
            },
            body: JSON.stringify({ url: sourceUrl }),
        })
        if (!resp.ok) {
            console.error(`cdn upload failed (${sourceUrl}): ${resp.status} ${await resp.text()}`)
            return null
        }
        const { url } = (await resp.json()) as { url?: string }
        if (!url) return null
        try {
            const head = await fetch(url, { method: "GET", redirect: "follow" })
            if (head.ok && head.url && head.url !== url) return head.url
        } catch {
            // fall back to the cdn.hackclub.com URL
        }
        return url
    }
    if (cdnKey) {
        for (const file of original.files ?? []) {
            if (!file.url_private || !file.id) continue
            try {
                const url = await rehost(file.url_private)
                if (!url) continue
                console.log(`rehosted ${file.id} -> ${url}`)
                if (file.mimetype?.startsWith("image/")) {
                    attachmentBlocks.push({
                        type: "image",
                        image_url: url,
                        alt_text: file.name ?? "attachment",
                        title: file.name ? { type: "plain_text", text: file.name } : undefined,
                    })
                } else if (
                    file.mimetype?.startsWith("audio/") ||
                    file.mimetype?.startsWith("video/")
                ) {
                    // For video, re-host the actual video-frame thumbnail
                    // instead of the author's avatar. For audio (no frame),
                    // use a configurable audio placeholder so previews don't
                    // show the author's pfp. Falls back to the avatar if Slack
                    // didn't generate a video thumb.
                    const audioThumb =
                        process.env.AUDIO_THUMBNAIL_URL ??
                        "https://cdn.hackclub.com/019fbb1e-f1e9-735f-902b-e976fc8b550e/image.png"
                    const thumbUrl = file.thumb_video ? await rehost(file.thumb_video) : null
                    const isAudio = file.mimetype?.startsWith("audio/")
                    attachmentBlocks.push({
                        type: "video",
                        video_url: url,
                        thumbnail_url:
                            thumbUrl ??
                            (isAudio ? audioThumb : iconUrl) ??
                            "https://a.slack-edge.com/production-standard-emoji-assets/14.0/apple-medium/1f3b5.png",
                        alt_text: file.name ?? "media attachment",
                        title: { type: "plain_text", text: file.name ?? "Media attachment" },
                    })
                } else {
                    const name = (file.name ?? "attachment")
                        .replaceAll("&", "&amp;")
                        .replaceAll("<", "&lt;")
                        .replaceAll(">", "&gt;")
                    attachmentBlocks.push({
                        type: "section",
                        text: { type: "mrkdwn", text: `📎 <${url}|${name}>` },
                    })
                }
            } catch (e) {
                console.error(`failed to re-host ${file.id}`, e)
            }
        }
    }

    let channelmsg = await botApp.client.chat.postMessage({
        channel: channelId,
        text,
        blocks: [
            { type: "section", text: { type: "mrkdwn", text } },
            ...attachmentBlocks,
        ],
        username,
        icon_url: iconUrl,
    })
    let channelmsgts = channelmsg.ts
    if (!channelmsgts) {
        return { ok: false, error: "failed_to_post_repost" }
    }

    let auto_sub = true // todo
    
    if (auto_sub) {
        try {
            await subscribeToThread(userToken, channelmsgts, channelId, botApp)
        } catch (e) {
            console.error("subsribing failed", e)
            return { ok: false, error: `subsribing failed: ${(e as Error).message}` }
        }
    }

    try {
        await deleteMessage(userToken, messageTs, channelId, botApp)
    } catch (e) {
        console.error("chat.delete failed", e)
        return { ok: false, error: `delete_failed: ${(e as Error).message}` }
    }

    return { ok: true }
}
