import { App } from '@slack/bolt'

export const botApp = new App({
  token: process.env.BSLACK_TOKEN,
  appToken: process.env.BSLACK_APP_TOKEN,
  socketMode: true,
})