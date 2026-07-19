import { App } from '@slack/bolt'

const app = new App({
  token: process.env.SLACK_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
})

app.message(async ({ message, say }) => {
    console.log(message)
  if (!('user' in message)) return
  if (message.user === process.env.SLACK_USER_ID) return
  await say("I'm always listening :eyes:")
})

await app.start()
console.log("hello")
