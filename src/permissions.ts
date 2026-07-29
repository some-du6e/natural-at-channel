import { App } from "@slack/bolt";

async function getChannelManagers(channelId: string): Promise<string[]> { // src: https://github.com/skyfallwastaken/at-channel/blob/d7f003954e0486c1182f01ac383bad503a7481ac/src/util.ts#L48-L68
  const formData = new FormData();
  formData.append("token", process.env.SLACK_XOXC || "");
  formData.append("entity_id", channelId);

  const request = await fetch(
    "https://slack.com/api/admin.roles.entity.listAssignments",
    {
      method: "POST",
      body: formData,
      headers: {
        Cookie: `d=${encodeURIComponent(process.env.SLACK_XOXD || "")}`,
      },
    },
  );

  const json = (await request.json()) as {
    ok?: boolean;
    role_assignments?: { users?: string[] }[];
  };
  if (!json) return []
  if (!json.ok) return [];
  return json.role_assignments?.[0]?.users || [];
}


export async function isUserAuthorized(slackId: string, channel: string, app: App) {
    let channelInfo = await app.client.conversations.info({
        channel,
})
    let isPrivate = channelInfo.channel?.is_private 
    let channelCreator = channelInfo.channel?.creator
    let channelManagers = await getChannelManagers(channel)

    if (isPrivate==null && !channelCreator && !channelManagers ) { return }

    console.log(channelManagers)
    // TODO: add a db thing idk, claudex it cuz idk databases
    if (isPrivate) {
        // private channels cant get the list of cms
        if (slackId == channelCreator) {
            return true
        }else {
            return false
        }
    }else {
        if (slackId == channelCreator) {
            return true
        }else if (channelManagers.includes(slackId)) {
            return true
        }else {
            return false
        }
    }

    return false


}

function humiliateUser(channel: string, messageTs: string, app: App) {
    return app.client.reactions.add({
        "channel": channel,
        "timestamp": messageTs,
        "name": "loll"
    })
}

export async function handleAuth(slackId: string, channel: string, app: App, messageTs: string) {
    if (await isUserAuthorized(slackId, channel, app)) {
        return true
    }
    try {
        await humiliateUser(channel, messageTs, app)
    } catch (e) {
        console.error("failed to humiliate user", e)
    }
    return false    
}
