import type { AppMentionEvent } from "@slack/types"
import { selfUserId } from "./slack_bot"
import { App } from "@slack/bolt"
import { handleError } from "./errors"

// A bare mention (just `@bot` with nothing else) was probably an accident —
// don't @channel the whole room over it. Whisper to the user and let them
// confirm before we repost. Returns true when we surfaced the whisper, so the
// caller knows to skip the automatic repost and let the buttons drive it.
export async function handleAccidentalPing(event: AppMentionEvent, botApp: App): Promise<boolean> {
    const text = event.text?.trim()
    const userId = event.user
    if (!text || !userId) return false

    const selfMention = `<@${selfUserId}>`
    // Strip our own mention out; if nothing meaningful remains, the user pinged
    // us with no actual content.
    const probablyAccidental = text.replaceAll(selfMention, "").trim() === ""
    if (!probablyAccidental) return false

    // "yeah" reuses retry_repost: it already parses {channel, ts} from the
    // value, runs repostAsChannelAndDelete, and handles auth/errors — exactly
    // what "yes I meant to ping @channel" needs.
    const payload = JSON.stringify({ channel: event.channel, ts: event.ts })

    try {
        await botApp.client.chat.postEphemeral({
            channel: event.channel,
            user: userId,
            text: "hey buddy i noticed u pinged me, i was wondering if it was intentional",
            blocks: [
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: "hey buddy i noticed u pinged me, was that intentional?",
                    },
                },
                {
                    type: "context",
                    elements: [
                        {
                            type: "mrkdwn",
                            text: "btw u dont have to invite me to the channel via mentioning me, just post the message normally and i'll repost it when u invite me",
                        },
                    ],
                },
                {
                    type: "actions",
                    elements: [
                        {
                            type: "button",
                            text: { type: "plain_text", text: "yeah", emoji: true },
                            style: "primary",
                            action_id: "retry_repost",
                            value: payload,
                        },
                        {
                            type: "button",
                            text: { type: "plain_text", text: "nah", emoji: true },
                            action_id: "accident_ignore",
                            value: payload,
                        },
                    ],
                },
            ],
        })
    } catch (error) {
        handleError(error)
    }

    console.log(`probably accidental ping from ${userId} in ${event.channel}, whispered`)
    return true
}
