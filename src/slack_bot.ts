import { App } from '@slack/bolt'

export const botApp = new App({
  token: process.env.BSLACK_TOKEN,
  appToken: process.env.BSLACK_APP_TOKEN,
  socketMode: true,
})


const auth = await botApp.client.auth.test()
const selfUserId = auth.user_id

if (!selfUserId) throw new Error("Could not determine the selfbot user ID")

console.log(`Selfbot connected as ${selfUserId}`)





function replaceSelfMention(message: string) {
    const mention = `<@${selfUserId}>`
    return message.replaceAll(mention, "<!channel>")
}

botApp.event("app_mention", async ({ event, say }) => {
    console.log("poo")
    // todo change
    if (!event.text || !event.user) return
    if (event.user === selfUserId) return
    if (!event.text.includes(`<@${selfUserId}>`)) return

    const text = replaceSelfMention(event.text)
    console.log(event.user)
    const { user } = await botApp.client.users.info({ user: event.user })
    const username = user?.profile?.display_name || user?.profile?.real_name || user?.name || event.user
    const iconUrl = user?.profile?.image_192 || user?.profile?.image_72

    await botApp.client.chat.postMessage({
        channel: event.channel,
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
