import type { App } from "@slack/bolt"

export async function deleteMessage(
    userToken: string,
    messageTs: string,
    channelId: string,
    app: App,
) {
    return app.client.chat.delete({
        channel: channelId,
        ts: messageTs,
        token: userToken,
    })
}

export async function subscribeToThread(
    userToken: string,
    messageTs: string,
    channelId: string,
    app: App,
) {
    let submessage = app.client.chat.postMessage({
        text: `automated: cc <@${userToken}>`,
        channel: channelId,
        thread_ts: messageTs,
        token: userToken,
    })

    let submessagets = (await submessage).ts
    
    if (!submessagets) {
        throw new Error("Failed to subscribe to thread")
    }
    
    deleteMessage(userToken, submessagets, channelId, app)
}

