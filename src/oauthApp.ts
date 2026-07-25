import { App, ExpressReceiver } from "@slack/bolt"
import { installationStore } from "./installationStore"

// HTTP app for the OAuth flow only. Shares the installation store so tokens
// saved here are readable by botApp.
const oauthReceiver = new ExpressReceiver({
    signingSecret: process.env.BSLACK_SIGNING_SECRET!,
    clientId: process.env.BSLACK_CLIENT_ID,
    clientSecret: process.env.BSLACK_CLIENT_SECRET,
    stateSecret: process.env.BSLACK_STATE_SECRET,
    scopes: ["chat:write"],
    installerOptions: {
        userScopes: ["chat:write"],
        directInstall: true,
    },
    installationStore,
})

export const oauthApp = new App({
    receiver: oauthReceiver,
    // no token here — this app only handles OAuth endpoints
})
