import { botApp } from "./slack_bot"
import { oauthApp } from "./oauthApp"
import "./handlers"
import * as Sentry from "@sentry/bun";
import { handleError } from "./errors"

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enableLogs: true
});

botApp.error(async (error) => {
  handleError(error)
})

oauthApp.error(async (error) => {
  handleError(error)
})

await botApp.start()
await oauthApp.start(Number(process.env.PORT ?? 3000))
console.log("bot is running!")
