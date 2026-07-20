import { App } from "@slack/bolt"
import type { RichTextBlock, RichTextElement } from "@slack/types"
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

function buildBlock(message: string) {
    const mention = `<@${selfUserId}>`
    const parts = message.split(mention)
    const elements: RichTextElement[] = []

    parts.forEach((text, index) => {
        if (text) elements.push({ type: "text", text })
        if (index < parts.length - 1) {
            elements.push({ type: "broadcast", range: "channel" })
        }
    })

    return {
        type: "rich_text",
        elements: [{ type: "rich_text_section", elements }],
    } satisfies RichTextBlock
}

userApp.message(async ({ message, say }) => {
    // todo change
    if (!("text" in message) || !("user" in message)) return
    if (message.user === selfUserId) return
    if (!message.text?.includes(`<@${selfUserId}>`)) return

    const poo = buildBlock(message.text)
    console.log("Sending elements to bot:\n" + JSON.stringify(poo, null, 4))

    await botApp.client.chat.postMessage({
        channel: message.channel,
        blocks: [poo],
    })
})
