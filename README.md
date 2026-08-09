# NChannel
A more natural way to ping @channel!

## Features
- Working @channel mentions
    - (yes it shows up in the activity tab)
- Authentication
    - Only channel managers or creators can ping
- Media sharing
    - Audio[^1], videos and images work
- Settings
    - There you can change if:
        - it reacts when your command fails
        - you need to revoke your oauth
        - you prefer using your slack "full name" or "display name"



## How to use
If you are in the [Hack Club Slack](https://slack.hackclub.com/):
1. you can create a new channel to get channel manager permissions
2. mention @nChannel how you would normally ping @channel (make sure to invite it) 
3. authenticate, (let the bot know,) and send your message!

**or**
 you could also join 
... todo ffa mode

## Selfhosting
Requirements:
- Bun installed

### Setting up the .env
I feel like its pretty self explanatory, just:
1. Go to https://api.slack.com/apps
0. Create New App
0. From a manifest
0. Copy the content from manifest.json into the field that pops up in slack
0. Go install it and stuff
The others are in explained in the .env as comments
```env
# your slack bot tokens, pretty self explanatory
# needed for essentially everything. go use the manifest.json if it exists
BSLACK_APP_TOKEN= # begins with xapp
BSLACK_TOKEN= # beginss with xoxb

# extra slack stuff needed for oauth stuff
# most of these are in the Basic Information section of your app settings
BSLACK_CLIENT_SECRET= 
BSLACK_CLIENT_ID= 
BSLACK_APP_ID= 
BSLACK_SIGNING_SECRET= 
BSLACK_STATE_SECRET= # any random long string i think

# public oauth stuff
PUBLIC_URL= # self explanatory
PORT= # local port your app is running on

# YOUR slack tokens, needed for checking channel manager permissions
SLACK_XOXC= # there isnt a easy way to do this. follow https://slack.green/en/docs/add-workspace-manual#:~:text=3-,Get%20the%20xoxc%20token,-Open%20Chrome%20DevTools
SLACK_XOXD= # you can use the above guide linked or get the d cookie 

# Hack Club CDN API key, needed for uploading stuff
HC_CDN_API_KEY= # get one at https://cdn.hackclub.com/api_keys

# Supabase stuff ik that its kinda shitty but idc go vibe code it
SUPABASE_SERVICE_ROLE_KEY= # get this one from ur project -> settings -> API keys -> legacy anon keys 
SUPABASE_URL= # get this one from ur project -> settings -> Data API -> API URL and get rid of the /rest/v1 at the end
```

### Running it
To install packages:
```bash
bun i
```
To run:
```bash
bun run start
```

[^1]: Audio works with a fake audio file image preview thing because slack fucking sucks