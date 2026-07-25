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
