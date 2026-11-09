# instagram-agent: an AI assistant for your business Instagram

Chat with it in the terminal, or use it as a **Claude Code skill**. It can:

- **Write and publish posts**: photos, carousels (2-10), Reels and Stories, with captions in Thai and English, hashtags and alt text
- **Answer comments**: finds new comments, drafts friendly replies in the commenter's language, handles complaints politely, and hides spam
- **Explain your results**: reach, views, likes, shares, saves and engagement rate per post and for the whole account, and what to post next
- **Plan content**: calendars and monthly reports saved in `output/`

**Nothing goes to Instagram without your OK.** Before every post, reply or hide, it shows you the exact text and waits.
Type `y` to send, `n` to cancel, or type what to change ("shorter", "add the LINE ID") and it rewrites.
It never deletes anything.

## Start

1. Install [Node.js](https://nodejs.org) 20.12 or newer.
2. In this folder:
   ```
   npm install
   copy .env.example .env
   ```
3. Put your Anthropic API key in `.env` after `ANTHROPIC_API_KEY=` (from https://console.anthropic.com).
4. Run:
   ```
   npm start
   ```

Without an Instagram token it runs in **demo mode** with sample posts and comments, so you can try everything
safely. `/demo-reset` brings the sample data back.

Things to try:
- "Answer the new comments"
- "How did my last 10 posts do? What should I post more of?"
- "Write a caption for this photo and post it: https://…/katsu.jpg"
- "Plan 2 weeks of Instagram posts for December"

Fill in the TODOs in `business/knowledge/brand.md` (location, hours, how to order, hashtags). The assistant only
uses facts from there, and puts `[placeholders]` where something is missing.

## Connect Instagram

You need an Instagram **Business or Creator** account (Instagram app → Settings → Account type and tools).
A Facebook Page is not needed.

1. Go to https://developers.facebook.com → **My Apps → Create app** → use case **"Manage messaging & content on Instagram"**.
2. In the app: **Instagram → API setup with Instagram login** → **Add account** and log in with the shop's Instagram.
   Allow these permissions: `instagram_business_basic`, `instagram_business_content_publish`,
   `instagram_business_manage_comments`, `instagram_business_manage_insights`.
3. Click **Generate token** next to the account and copy it into `.env` after `IG_ACCESS_TOKEN=`.
4. `npm start`. It shows `Connected: @yourshop`.

While the Meta app is in development mode it works for your own account only, which is all you need.

The token lasts **60 days**. Run `npm run refresh-token` any time before then to get 60 more days (it updates `.env`).
If it has already expired, generate a new one (step 3).

## Photos and videos

Instagram downloads the file itself, so it needs a **public https link straight to the file**.
Photos on your phone or computer, and Google Drive / Dropbox share pages, don't work.
Easy options: an image link from your website or POS menu, or upload to an image host that gives a direct link
ending in `.jpg`.

- Photos: JPEG, up to 8 MB. Square 1:1 or portrait 4:5 look best.
- Reels: MP4 (H.264 + AAC), 3 seconds to 15 minutes, vertical 9:16. Instagram needs a minute or two to process them.
- Stories: a photo or a video up to 60 seconds.
- About 50 posts per 24 hours (`node ig.mjs limit`).

Instagram's API can't schedule posts, add music from Instagram's library, or tag products. Those still happen in the app.

## Use it as a Claude Code skill

```
npm run install-skill
```

This puts the skill in `~/.claude/skills/instagram/`. Restart Claude Code, then ask e.g.
"answer the new Instagram comments" or type `/instagram`. Claude Code uses the `ig.mjs` tool in this folder and
your `.env`, so keep this folder where it is (run the install again if you move it).
In the skill, too, nothing is sent until you approve it in the chat: the tool only previews unless it's run with
`--confirm`. `node install-skill.mjs --remove` uninstalls it.

## Command-line tool

`ig.mjs` works on its own (prints JSON):

```
node ig.mjs account
node ig.mjs posts 10
node ig.mjs insights <post-id>
node ig.mjs account-insights 28
node ig.mjs comments <post-id>
node ig.mjs reply <comment-id> "Thank you!" --confirm
node ig.mjs hide <comment-id> --confirm
node ig.mjs publish image https://…/photo.jpg "Caption #tag" --confirm
node ig.mjs publish carousel https://…/1.jpg,https://…/2.jpg "Caption" --confirm
node ig.mjs publish reel https://…/video.mp4 "Caption" --confirm
node ig.mjs publish story https://…/photo.jpg --confirm
```

Without `--confirm`, write commands only show a preview.

## Settings (.env)

| Setting | Default | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | (none) | Your Claude API key |
| `IG_ACCESS_TOKEN` | (none) | Instagram token; empty = demo mode |
| `IG_AGENT_MODEL` | `claude-opus-5-5` | Claude model |
| `IG_AGENT_EFFORT` | `medium` | `low` is faster and cheaper; `high` thinks harder |
| `WEB_SEARCH` | on | `false` turns off web search (holidays, trends) |

## Files

| File | What it does |
|---|---|
| `agent.mjs` | The chat assistant (Claude + tools + your approval) |
| `ig.mjs` | Instagram API client and command-line tool |
| `skill/instagram/SKILL.md` | The Claude Code skill (installed by `install-skill.mjs`) |
| `business/` | Your brand profile and settings |
| `output/` | Plans, reports, demo data (not uploaded to GitHub) |

Keep `.env` private: the Instagram token lets anyone post as your shop.
