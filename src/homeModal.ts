import type { App } from "@slack/bolt";
import type { PostgrestTransformBuilder } from "@supabase/supabase-js/dist/index.cjs";
// ty rossetta and santi for this

function buildHomeBlocks(userId: String) {
    const settings = null // todo
        const isLinked = true
        const autoTranslate = true

        const blocks: any[] = [
            {
                type: "header",
                text: { type: "plain_text", text: "Rosetta", emoji: true },
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: "Rosetta automatically translates your non-English messages so everyone can understand you.",
                },
            },
            { type: "divider" },

            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: isLinked
                        ? "✅ *Account linked* - Rosetta can edit your messages in-place."
                        : "❌ *Account not linked* - Authorize Rosetta to translate your messages automatically.",
                },
                ...(isLinked
                    ? {
                        accessory: {
                            type: "button",
                            text: { type: "plain_text", text: "🔓 Unlink Account", emoji: true },
                            action_id: "home_revoke",
                            style: "danger",
                            confirm: {
                                title: { type: "plain_text", text: "Unlink account?" },
                                text: {
                                    type: "mrkdwn",
                                    text: "Rosetta will no longer be able to edit your messages in-place. You can re-link at any time.",
                                },
                                confirm: { type: "plain_text", text: "Unlink" },
                                deny: { type: "plain_text", text: "Cancel" },
                            },
                        },
                    }
                    : {
                        accessory: {
                            type: "button",
                            text: { type: "plain_text", text: "🔐 Authorize Rosetta", emoji: true },
                            action_id: "home_authorize",
                            url: `${process.env.BASE_URL}/oauth/authorize?user=${userId}`,
                            style: "primary",
                        },
                    }),
            },

            { type: "divider" },

            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: autoTranslate
                        ? "🟢 *Auto-translate is ON* - Your non-English messages are translated automatically."
                        : "🔴 *Auto-translate is OFF* - Your messages won't be translated.",
                },
                accessory: {
                    type: "button",
                    text: {
                        type: "plain_text",
                        text: autoTranslate ? "Turn Off" : "Turn On",
                        emoji: true,
                    },
                    action_id: "home_toggle_autotranslate",
                    ...(autoTranslate ? { style: "danger" } : { style: "primary" }),
                },
            },

            { type: "divider" },

            {
                type: "context",
                elements: [
                    {
                        type: "mrkdwn",
                        text: "Built with ❤️ by <https://github.com/sbeltranc|santi> at <https://github.com/hackclub|Hack Club> · <https://github.com/hackclub/rosetta|Source on GitHub>",
                    },
                ],
            },
        ];

        return blocks
}



export function registerHomeTab(app: App) {
    app.event("app_home_opened", async ({ event, client }) => {
        const userId = event.user;
        const blocks = buildHomeBlocks(userId);

        await client.views.publish({
            user_id: userId,
            view: {
                type: "home",
                blocks,
            },
        });
    });

    app.action("home_authorize", async ({ ack }) => await ack());

    app.action("home_revoke", async ({ ack, body, client }) => {
        await ack();
    });

}

async function refreshHome(client: any, userId: string) {

    const blocks = buildHomeBlocks(userId);

    await client.views.publish({
        user_id: userId,
        view: {
            type: "home",
            blocks,
        },
    });
}