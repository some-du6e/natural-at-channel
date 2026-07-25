import { App } from "@slack/bolt"

// Socket-mode app for events/actions. Static single-workspace token.
export const botApp = new App({
    token: process.env.BSLACK_TOKEN,
    appToken: process.env.BSLACK_APP_TOKEN,
    socketMode: true,
})

const auth = await botApp.client.auth.test()
const selfUserId = auth.user_id
const teamId = auth.team_id

if (!selfUserId) throw new Error("Could not determine the selfbot user ID")
if (!teamId) throw new Error("Could not determine the team ID")

console.log(`Selfbot connected as ${selfUserId} on team ${teamId}`)

export { selfUserId, teamId }
