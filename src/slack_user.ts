import { App } from '@slack/bolt'
import { botApp } from './slack_bot'

export const userApp = new App({
  token: process.env.USLACK_TOKEN,
  appToken: process.env.USLACK_APP_TOKEN,
  socketMode: true,
})

const auth = await userApp.client.auth.test()
const selfUserId = auth.user_id

if (!selfUserId) throw new Error('Could not determine the selfbot user ID')

console.log(`Selfbot connected as ${selfUserId}`)

userApp.message(async ({ message, say }) => { // todo change
  if (!("text" in message) || !("user" in message)) return
  if (message.user === selfUserId) return
  if (!message.text?.includes(`<@${selfUserId}>`)) return

  await say('hello')
  botApp.client.chat.postMessage({
    channel: message.channel,
    text: `yeah cool <@${message.user}>`,
  })
})
