import { App, ExpressReceiver } from "@slack/bolt"
import { SupabaseInstallationStore } from "./installationStore"
import { deleteMessage } from "./usersManager"

export const installationStore = new SupabaseInstallationStore()

// Socket-mode app for events/actions. Static single-workspace token.
export const botApp = new App({
    token: process.env.BSLACK_TOKEN,
    appToken: process.env.BSLACK_APP_TOKEN,
    socketMode: true,
})

// HTTP app for the OAuth flow only. Shares the installation store so tokens
// saved here are readable by botApp.
const oauthReceiver = new ExpressReceiver({
    signingSecret: process.env.BSLACK_SIGNING_SECRET!,
    clientId: process.env.BSLACK_CLIENT_ID,
    clientSecret: process.env.BSLACK_CLIENT_SECRET,
    stateSecret: process.env.BSLACK_STATE_SECRET,
    scopes: ["chat:write"],
    installerOptions: {
        userScopes: ["chat:write"],
        directInstall: true,
    },
    installationStore,
})

export const oauthApp = new App({
    receiver: oauthReceiver,
    // no token here — this app only handles OAuth endpoints
})

const auth = await botApp.client.auth.test()
const selfUserId = auth.user_id
const teamId = auth.team_id

if (!selfUserId) throw new Error("Could not determine the selfbot user ID")
if (!teamId) throw new Error("Could not determine the team ID")

console.log(`Selfbot connected as ${selfUserId} on team ${teamId}`)

function replaceSelfMention(message: string) {
    const mention = `<@${selfUserId}>`
    return message.replaceAll(mention, "<!channel>")
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

async function buildOAuthUrl(): Promise<string> {
    // Bolt exposes this on the receiver; for socket-mode + installerOptions
    // the install path is /slack/install on the same HTTP listener.
    const port = process.env.PORT ?? 3000
    const base = process.env.PUBLIC_URL ?? `http://localhost:${port}`
    return `${base}/slack/install`
}

async function sendAuthPrompt(channelId: string, userId: string, messageTs: string) {
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
                    text: "I need your permission to delete your message and repost it as <!channel>.",
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

async function repostAsChannelAndDelete(
    channelId: string,
    messageTs: string,
    userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
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

    await botApp.client.chat.postMessage({
        channel: channelId,
        text,
        blocks: [{ type: "section", text: { type: "mrkdwn", text } }],
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

botApp.event("app_mention", async ({ event }) => {
    if (!event.text || !event.user) return
    if (event.user === selfUserId) return
    if (!event.text.includes(`<@${selfUserId}>`)) return

    const result = await repostAsChannelAndDelete(event.channel, event.ts, event.user)
    if (!result.ok && result.error === "no_token") {
        await sendAuthPrompt(event.channel, event.user, event.ts)
    } else if (!result.ok) {
        await botApp.client.chat.postEphemeral({
            channel: event.channel,
            user: event.user,
            text: `Couldn't repost as @channel: ${result.error}`,
        })
    }
})

botApp.action("retry_repost", async ({ ack, body, respond }) => {
    await ack()
    if (body.type !== "block_actions") return
    const action = body.actions[0]
    if (!action || !("value" in action) || !action.value) return

    let payload: { channel: string; ts: string }
    try {
        payload = JSON.parse(action.value)
    } catch {
        return
    }

    const userId = body.user.id
    const result = await repostAsChannelAndDelete(payload.channel, payload.ts, userId)

    if (result.ok) {
        await respond({
            response_type: "ephemeral",
            text: "Done linking ✅",
            replace_original: true,
        })
        setTimeout(async () => {
            try {
                await respond({ delete_original: true, response_type: "ephemeral", text: "" })
            } catch (e) {
                console.error("failed to delete ephemeral", e)
            }
        }, 5000)
        return
    }

    if (result.error === "no_token") {
        // Re-render the same auth prompt.
        await sendAuthPrompt(payload.channel, userId, payload.ts)
        return
    }

    await respond({
        response_type: "ephemeral",
        text: `Couldn't repost as @channel: ${result.error}`,
        replace_original: true,
    })
})
