import { botApp } from "./slack_bot"
import { oauthApp } from "./oauthApp"
import "./handlers"

await botApp.start()
await oauthApp.start(Number(process.env.PORT ?? 3000))
console.log("bot is running!")
