import type { App } from "@slack/bolt"
import { installationStore } from "./installationStore"
import { getUserSettings, isSettingsTableMissing, setReactToUnauthorized, setAutoSub, setNamePreference } from "./settings"
import { handleError } from "./errors"

async function isAccountLinked(teamId: string, userId: string): Promise<boolean> {
    try {
        await installationStore.fetchInstallation({
            teamId,
            userId,
            isEnterpriseInstall: false,
        })
        return true
    } catch (error) {
        if (error instanceof Error && error.message === "Installation not found") return false
        throw error
    }
}

function oauthUrl(): string {
    const port = process.env.PORT ?? 3000
    const base = process.env.PUBLIC_URL ?? `http://localhost:${port}`
    return `${base}/slack/install`
}

async function buildHomeBlocks(teamId: string, userId: string, client: any) {
    const [isLinked, settings, profile] = await Promise.all([
        isAccountLinked(teamId, userId),
        getUserSettings(teamId, userId),
        client.users.info({ user: userId }).then((r: any) => r.user?.profile).catch((error: unknown) => {
            handleError(error)
            return null
        }),
    ])
    const displayName = profile?.display_name || profile?.real_name || profile?.name || "Display name"
    const fullName = profile?.real_name || profile?.display_name || profile?.name || "Full name"

    return [
        {
            type: "header",
            text: { type: "plain_text", text: "nChannel", emoji: true },
        },
        {
            type: "context",
            elements: [
                {
                    type: "mrkdwn",
                    text: "A more natural way to ping @channel.",
                },
            ],
        },
        { type: "divider" },
        {
            type: "header",
            text: { type: "plain_text", text: "Slack account", emoji: true },
        },
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: isLinked
                    ? "*Connected*\nnChannel can ping the whole channel for you."
                    : "*Not connected*\nConnect your Slack account to start using nChannel.",
            },
            accessory: isLinked
                ? {
                    type: "button",
                    text: { type: "plain_text", text: "Disconnect", emoji: true },
                    action_id: "home_revoke",
                    style: "danger",
                    confirm: {
                        title: { type: "plain_text", text: "Disconnect nChannel?" },
                        text: { type: "mrkdwn", text: "nChannel won’t be able to ping the whole channel for you until you connect again." },
                        confirm: { type: "plain_text", text: "Disconnect" },
                        deny: { type: "plain_text", text: "Keep connected" },
                    },
                }
                : {
                    type: "button",
                    text: { type: "plain_text", text: "Connect", emoji: true },
                    action_id: "home_authorize",
                    url: oauthUrl(),
                    style: "primary",
                },
        },
        { type: "divider" },
        {
            type: "header",
            text: { type: "plain_text", text: "nChannel behavior", emoji: true },
        },
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: settings.reactToUnauthorized
                    ? "*On* — nChannel *will* ridicule you when you use it without permission."
                    : "*Off* — nChannel won’t ridicule you when you use it without permission.",
            },
            accessory: {
                type: "button",
                text: {
                    type: "plain_text",
                    text: settings.reactToUnauthorized ? "Disable" : "Enable",
                    emoji: true,
                },
                action_id: "home_toggle_loll",
                value: settings.reactToUnauthorized ? "off" : "on",
            },
        },
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: settings.autoSub
                    ? "*On* — Follow the thread after your message is reposted."
                    : "*Off* — Don’t follow repost threads automatically.",
            },
            accessory: {
                type: "button",
                text: {
                    type: "plain_text",
                    text: settings.autoSub ? "Disable" : "Enable",
                    emoji: true,
                },
                action_id: "home_toggle_autosub",
                value: settings.autoSub ? "off" : "on",
            },
        },
        { type: "divider" },
        {
            type: "header",
            text: { type: "plain_text", text: "Repost identity", emoji: true },
        },
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: "*Name on reposts*\nChoose whether nChannel uses your display name or full name.",
            },
            accessory: (() => {
                const options = [
                    {
                        text: { type: "plain_text", text: displayName, emoji: true },
                        value: "display_name",
                        description: { type: "plain_text", text: "Display name" },
                    },
                    {
                        text: { type: "plain_text", text: fullName, emoji: true },
                        value: "full_name",
                        description: { type: "plain_text", text: "Full name" },
                    },
                ]
                return {
                    type: "static_select" as const,
                    placeholder: { type: "plain_text", text: "Choose a name", emoji: true },
                    action_id: "home_name_preference",
                    initial_option:
                        settings.namePreference === "full_name" ? options[1] : options[0],
                    options,
                }
            })(),
        },
    ]
}

async function refreshHome(client: any, teamId: string, userId: string) {
    await client.views.publish({
        user_id: userId,
        view: { type: "home", blocks: await buildHomeBlocks(teamId, userId, client) },
    })
}

export function registerHomeTab(app: App, teamId: string) {
    app.event("app_home_opened", async ({ event, client }) => {
        try {
            await refreshHome(client, teamId, event.user)
        } catch (error) {
            if (!isSettingsTableMissing(error)) {
                handleError(error)
                return
            }
            try {
                await client.views.publish({
                    user_id: event.user,
                    view: {
                        type: "home",
                        blocks: [
                            {
                                type: "header",
                                text: { type: "plain_text", text: "nChannel", emoji: true },
                            },
                            {
                                type: "section",
                                text: {
                                    type: "mrkdwn",
                                    text: "nChannel couldn’t load your settings. Run the latest `schema.sql` in Supabase, then reopen this tab.",
                                },
                            },
                        ],
                    },
                })
            } catch (fallbackError) {
                handleError(fallbackError)
            }
        }
    })

    app.action("home_authorize", async ({ ack }) => {
        try {
            await ack()
        } catch (error) {
            handleError(error)
        }
    })

    app.action("home_revoke", async ({ ack, body, client }) => {
        try {
            await ack()
            const userId = body.user.id
            await installationStore.deleteInstallation({ teamId, userId, isEnterpriseInstall: false })
            await refreshHome(client, teamId, userId)
        } catch (error) {
            handleError(error)
        }
    })

    app.action("home_toggle_loll", async ({ ack, body, action, client }) => {
        try {
            await ack()
            const userId = body.user.id
            const enabled = "value" in action && action.value === "on"
            await setReactToUnauthorized(teamId, userId, enabled)
            await refreshHome(client, teamId, userId)
        } catch (error) {
            handleError(error)
        }
    })

    app.action("home_toggle_autosub", async ({ ack, body, action, client }) => {
        try {
            await ack()
            const userId = body.user.id
            const enabled = "value" in action && action.value === "on"
            await setAutoSub(teamId, userId, enabled)
            await refreshHome(client, teamId, userId)
        } catch (error) {
            handleError(error)
        }
    })

    app.action("home_name_preference", async ({ ack, body, action, client }) => {
        try {
            await ack()
            const userId = body.user.id
            const value =
                "selected_option" in action &&
                action.selected_option?.value === "full_name"
                    ? "full_name"
                    : "display_name"
            await setNamePreference(teamId, userId, value)
            await refreshHome(client, teamId, userId)
        } catch (error) {
            handleError(error)
        }
    })
}
