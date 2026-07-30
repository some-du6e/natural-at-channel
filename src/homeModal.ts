import type { App } from "@slack/bolt"
import { installationStore } from "./installationStore"
import { getUserSettings, isSettingsTableMissing, setReactToUnauthorized } from "./settings"

async function isAccountLinked(teamId: string, userId: string): Promise<boolean> {
    try {
        await installationStore.fetchInstallation({
            teamId,
            userId,
            isEnterpriseInstall: false,
        })
        return true
    } catch {
        return false
    }
}

function oauthUrl(): string {
    const port = process.env.PORT ?? 3000
    const base = process.env.PUBLIC_URL ?? `http://localhost:${port}`
    return `${base}/slack/install`
}

async function buildHomeBlocks(teamId: string, userId: string) {
    const [isLinked, settings] = await Promise.all([
        isAccountLinked(teamId, userId),
        getUserSettings(teamId, userId),
    ])

    return [
        {
            type: "header",
            text: { type: "plain_text", text: "Nchannel", emoji: true },
        },
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: "Nchannel transforms messages that mention it into <!channel> announcements.",
            },
        },
        { type: "divider" },
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: isLinked
                    ? "✅ *Account authorized* — Nchannel can transform your messages."
                    : "❌ *Account not authorized* — authorize Nchannel before transforming messages.",
            },
            accessory: isLinked
                ? {
                    type: "button",
                    text: { type: "plain_text", text: "Revoke authorization", emoji: true },
                    action_id: "home_revoke",
                    style: "danger",
                    confirm: {
                        title: { type: "plain_text", text: "Revoke authorization?" },
                        text: { type: "mrkdwn", text: "Nchannel will no longer be able to transform your messages." },
                        confirm: { type: "plain_text", text: "Revoke" },
                        deny: { type: "plain_text", text: "Cancel" },
                    },
                }
                : {
                    type: "button",
                    text: { type: "plain_text", text: "Authorize", emoji: true },
                    action_id: "home_authorize",
                    url: oauthUrl(),
                    style: "primary",
                },
        },
        { type: "divider" },
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: settings.reactToUnauthorized
                    ? "🟢 i *will* react when your not allowed :loll:"
                    : "🔴 ok then ill not react with :loll: any more :(",
            },
            accessory: {
                type: "button",
                text: {
                    type: "plain_text",
                    text: settings.reactToUnauthorized ? "Turn off" : "Turn on",
                    emoji: true,
                },
                action_id: "home_toggle_loll",
                value: settings.reactToUnauthorized ? "off" : "on",
                ...(settings.reactToUnauthorized ? { style: "danger" } : { style: "primary" }),
            },
        },
    ]
}

async function refreshHome(client: any, teamId: string, userId: string) {
    await client.views.publish({
        user_id: userId,
        view: { type: "home", blocks: await buildHomeBlocks(teamId, userId) },
    })
}

export function registerHomeTab(app: App, teamId: string) {
    app.event("app_home_opened", async ({ event, client }) => {
        try {
            await refreshHome(client, teamId, event.user)
        } catch (error) {
            if (!isSettingsTableMissing(error)) throw error
            await client.views.publish({
                user_id: event.user,
                view: {
                    type: "home",
                    blocks: [
                        {
                            type: "header",
                            text: { type: "plain_text", text: "Nchannel", emoji: true },
                        },
                        {
                            type: "section",
                            text: {
                                type: "mrkdwn",
                                text: "⚠️ Settings are not ready yet. Run the latest `schema.sql` in the Supabase SQL editor, then reopen this tab.",
                            },
                        },
                    ],
                },
            })
        }
    })

    app.action("home_authorize", async ({ ack }) => await ack())

    app.action("home_revoke", async ({ ack, body, client }) => {
        await ack()
        const userId = body.user.id
        await installationStore.deleteInstallation({ teamId, userId, isEnterpriseInstall: false })
        await refreshHome(client, teamId, userId)
    })

    app.action("home_toggle_loll", async ({ ack, body, action, client }) => {
        await ack()
        const userId = body.user.id
        const enabled = "value" in action && action.value === "on"
        await setReactToUnauthorized(teamId, userId, enabled)
        await refreshHome(client, teamId, userId)
    })
}
