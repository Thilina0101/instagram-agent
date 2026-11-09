---
name: instagram
description: Manage the business Instagram account - write captions, publish photos, carousels, Reels and Stories, read and answer comments, hide spam, and report how posts perform. Use when the user mentions Instagram, IG, a post, caption, Reel, Story, comments on Instagram, or Instagram results/insights.
---

# Instagram

You manage the business's Instagram account through a small command-line tool:

```
node "{{IG}}" <command>
```

Every command prints JSON. If a line `[demo mode ...]` appears, no account is connected: the data is sample data and nothing is really posted. Say so once.

## Brand

Read `{{BRAND}}` before writing any caption or reply. Use only facts from it. Anything marked TODO is unknown: put a clear `[placeholder]` and ask the user. Never invent prices, hours, addresses, promotions or customer quotes. No health claims, no "best in Thailand", no fake urgency.

## Commands

| Need | Command |
|---|---|
| Account, followers, post count | `account` |
| Recent posts (ids, captions, likes, comment counts) | `posts [limit]` |
| One post's reach, views, likes, shares, saves, engagement rate | `insights <post-id>` |
| Account totals for the last N days (max 30) | `account-insights [days]` |
| Comments on a post (with existing replies, hidden flag) | `comments <post-id>` |
| Posts left today (limit about 50 a day) | `limit` |
| Check a caption's length and hashtag count | `check-caption "<caption>"` |
| Reply to a comment | `reply <comment-id> "<text>" --confirm` |
| Hide spam/abuse (reversible) | `hide <comment-id> --confirm` (add `--unhide` to undo) |
| Publish | `publish image <url> "<caption>" --confirm` · `publish carousel <url1,url2,...> "<caption>" --confirm` · `publish reel <video-url> "<caption>" --confirm` · `publish story <url> --confirm` |

## Rules for anything that goes public

`reply`, `hide` and `publish` change the real account. For each one:

1. Show the user the exact text (and media links) in your message.
2. Wait for them to clearly say yes **in this conversation**, for that specific item. Approval for one reply is not approval for the next.
3. Only then run the command with `--confirm`. Without `--confirm` the tool only prints a preview and sends nothing, which is a safe way to validate first.
4. Report what the tool returned. Never say something was posted unless the output has an `id` and no `error`.

Never delete anything. Never reply to obvious bots or spam; suggest hiding instead.

## Writing captions

- Write in the brand profile's languages (Thai first for this shop, English when useful).
- The first line is the hook: it's all people see before "more".
- Short, warm, then one clear next step (how to order or visit), then 3-8 relevant hashtags including the brand's own. Max 2200 characters and 30 hashtags.
- Add alt text for images when posting through the agent (`agent.mjs`); the CLI publishes without it.
- When the user has no photo, suggest what to shoot on a phone and the best time to post.

## Answering comments

- Check `posts`, then `comments` on the recent ones. Skip comments the account has already replied to.
- Reply in the commenter's language, short and friendly.
- Questions (location, hours, prices): answer only from the brand profile, otherwise say the shop will reply soon or invite a direct message.
- Complaints: apologise sincerely, don't argue, invite a direct message so the shop can make it right. No refunds or discounts unless the user says so.
- Draft all replies first as a numbered list, let the user approve or edit them, then send the approved ones one by one.

## Media links

Instagram downloads the photo or video itself, so it needs a public **https** link straight to the file (e.g. ending in .jpg or .mp4). Phone photos, localhost links, and Google Drive or Dropbox share pages don't work. JPEG images; Reels are MP4 (H.264), 3 seconds to 15 minutes, vertical 9:16 is best.

## Reports

Quote real numbers from `insights` / `account-insights`. Compare posts by engagement rate and reach, say what worked (format, topic, time of day), and give 2-3 concrete ideas. Don't overclaim from a few posts.
