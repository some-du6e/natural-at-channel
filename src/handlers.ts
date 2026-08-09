import { botApp, selfUserId } from "./slack_bot"
import { repostAsChannelAndDelete, sendAuthPrompt } from "./repost"
import { handleError } from "./errors"

const UNAUTHORIZED_MESSAGE = "yeah buddy ur not channel manager nor channel creator byebye"

botApp.event("app_mention", async ({ event }) => {
    if (!event.text || !event.user) return
    if (event.user === selfUserId) return
    if (!event.text.includes(`<@${selfUserId}>`)) return

    console.log(event)

    try {
        const result = await repostAsChannelAndDelete(event.channel, event.ts, event.user)
        console.log("repost result:", result)
        if (!result.ok && result.error === "no_token") {
            await sendAuthPrompt(event.channel, event.user, event.ts)
        } else if (!result.ok) {
            await botApp.client.chat.postEphemeral({
                channel: event.channel,
                user: event.user,
                text: result.error === "unauthorized"
                    ? UNAUTHORIZED_MESSAGE
                    : `Couldn't repost as @channel: ${result.error}`,
            })
        }
    } catch (error) {
        const { error: message } = handleError(error)
        try {
            await botApp.client.chat.postEphemeral({
                channel: event.channel,
                user: event.user,
                text: message,
            })
        } catch (notifyError) {
            handleError(notifyError)
        }
    }
})

botApp.action("retry_repost", async ({ ack, body, respond }) => {
    try {
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
                } catch (error) {
                    handleError(error)
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
            text: result.error === "unauthorized"
                ? UNAUTHORIZED_MESSAGE
                : `Couldn't repost as @channel: ${result.error}`,
            replace_original: true,
        })
    } catch (error) {
        const { error: message } = handleError(error)
        try {
            await respond({
                response_type: "ephemeral",
                text: message,
                replace_original: true,
            })
        } catch (respondError) {
            handleError(respondError)
        }
    }
})
