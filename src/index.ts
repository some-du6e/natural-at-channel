import { botApp, oauthApp } from "./slack_bot"

await botApp.start()
await oauthApp.start(Number(process.env.PORT ?? 3000))
console.log("bot is running!")
