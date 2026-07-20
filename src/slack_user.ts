import { App } from "@slack/bolt"
import { botApp } from "./slack_bot"

export const userApp = new App({
    token: process.env.USLACK_TOKEN,
    appToken: process.env.USLACK_APP_TOKEN,
    socketMode: true,
})

const auth = await userApp.client.auth.test()
const selfUserId = auth.user_id

if (!selfUserId) throw new Error("Could not determine the selfbot user ID")

console.log(`Selfbot connected as ${selfUserId}`)

function replaceSelfMention(message: string) {
    const mention = `<@${selfUserId}>`
    return message.replaceAll(mention, "<!channel>")
}

userApp.message(async ({ message, say }) => {
    // todo change
    if (!("text" in message) || !message.text || !("user" in message) || !message.user) return
    if (message.user === selfUserId) return
    if (!message.text?.includes(`<@${selfUserId}>`)) return

    const text = replaceSelfMention(message.text)
    console.log(message.user)
    const { user } = await botApp.client.users.info({ user: message.user })
    const username = user?.profile?.display_name || user?.profile?.real_name || user?.name || message.user
    const iconUrl = user?.profile?.image_192 || user?.profile?.image_72

    await botApp.client.chat.postMessage({
        channel: message.channel,
        text,
        blocks: [
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text,
                },
            },
        ],
        username,
        icon_url: iconUrl,
    })
})
