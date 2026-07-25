import { botApp, selfUserId } from "./slack_bot"
import { repostAsChannelAndDelete, sendAuthPrompt } from "./repost"

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
            text: "alrighty, reposted as @channel!",
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
