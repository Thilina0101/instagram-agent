#!/usr/bin/env node
/**
 * instagram-agent: an AI assistant that runs your business Instagram account, powered by Claude.
 *
 *   node agent.mjs
 *
 * Writes captions and posts photos, carousels, Reels and Stories; reads and answers comments;
 * hides spam; and explains how your posts are doing. It always shows you the exact post or
 * reply and waits for your "y" before anything goes to Instagram.
 */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import * as ig from "./ig.mjs";

/* ---------------------------------------------------------------- config */
const HERE = path.dirname(fileURLToPath(import.meta.url));
try { process.loadEnvFile(path.join(HERE, ".env")); } catch { /* no .env file is fine */ }

const MODEL = process.env.IG_AGENT_MODEL || "claude-opus-5-5";
const EFFORT = process.env.IG_AGENT_EFFORT || "medium";              // low | medium | high | xhigh | max
const BUSINESS_DIR = path.resolve(HERE, process.env.BUSINESS_DIR || "business");
const OUTPUT_DIR = path.join(HERE, "output");
const WEB_SEARCH = process.env.WEB_SEARCH !== "false";
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"]);
const PRICE = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 };   // approx. Claude Opus 5.5, $ per million tokens

const c = (code) => (s) => `\x1b[${code}m${s}\x1b[0m`;
const dim = c(2), red = c(31), green = c(32), yellow = c(33), cyan = c(36), bold = c(1), magenta = c(35);

const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8").replace(/^﻿/, "")); } catch { return d; } };
const config = readJson(path.join(BUSINESS_DIR, "config.json"), null);
if (!config) { console.error(red(`Could not read ${path.join(BUSINESS_DIR, "config.json")}`)); process.exit(1); }

function knowledge() {
  const dir = path.join(BUSINESS_DIR, "knowledge");
  if (!fs.existsSync(dir)) return "";
  return fs.readdirSync(dir).filter((f) => /\.(md|txt)$/i.test(f)).sort()
    .map((f) => `<document name="${f}">\n${fs.readFileSync(path.join(dir, f), "utf8").trim()}\n</document>`).join("\n\n");
}

/* ---------------------------------------------------------------- owner approval */
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

/** Shows exactly what will be sent and waits for the owner. Returns {approved} or {approved:false, owner_says}. */
async function approve(title, lines) {
  console.log("\n" + magenta("┌─ " + bold(title)));
  for (const l of lines) for (const row of String(l).split("\n")) console.log(magenta("│ ") + row);
  console.log(magenta("└─"));
  const a = (await rl.question(bold(yellow("Send this to Instagram? y = yes · n = no · or type what to change: ")))).trim();
  if (/^(y|yes|ok|ใช่|ได้|โอเค)$/i.test(a)) return { approved: true };
  return { approved: false, owner_says: a && !/^(n|no|ไม่)$/i.test(a) ? a : "No. Don't send it." };
}
const notApproved = (r) => ({ sent: false, ...r, note: "Nothing was sent. If the owner asked for changes, make them and call the tool again so they can approve the new version." });

/* ---------------------------------------------------------------- tools */
const id = z.string().min(1).max(100).regex(/^[\w-]+$/, "not a valid Instagram id");
const TOOLS = [
  {
    name: "get_account",
    description: "The connected Instagram account: username, name, account type, followers, following, number of posts.",
    input_schema: { type: "object", properties: {} },
    schema: z.object({}).passthrough(),
    run: async () => { log("👤 get_account"); return ig.account(); },
  },
  {
    name: "list_posts",
    description: "The account's most recent posts (newest first): id, caption, type (IMAGE/VIDEO/CAROUSEL_ALBUM; FEED or REELS), date, link, likes and comment count. Use the id with the other tools.",
    input_schema: { type: "object", properties: { limit: { type: "integer", description: "How many posts (1-50, default 12)" } } },
    schema: z.object({ limit: z.number().int().min(1).max(50).optional() }),
    run: async ({ limit }) => { const p = await ig.listPosts(limit); log(`🖼  list_posts → ${p.length}`); return p; },
  },
  {
    name: "get_post_insights",
    description: "Performance of one post: reach (people who saw it), views, likes, comments, shares, saves, total interactions, and engagement rate. Reels also give average watch time.",
    input_schema: { type: "object", properties: { post_id: { type: "string" } }, required: ["post_id"] },
    schema: z.object({ post_id: id }),
    run: async ({ post_id }) => { log(`📈 insights ${post_id}`); return ig.postInsights(post_id); },
  },
  {
    name: "get_account_insights",
    description: "Account totals for the last N days (max 30): reach, views, accounts engaged, total interactions, follows and unfollows.",
    input_schema: { type: "object", properties: { days: { type: "integer", description: "1-30, default 28" } } },
    schema: z.object({ days: z.number().int().min(1).max(30).optional() }),
    run: async ({ days }) => { log(`📊 account insights (${days || 28} days)`); return ig.accountInsights(days); },
  },
  {
    name: "list_comments",
    description: "Comments on one post, with replies already given and whether a comment is hidden.",
    input_schema: { type: "object", properties: { post_id: { type: "string" } }, required: ["post_id"] },
    schema: z.object({ post_id: id }),
    run: async ({ post_id }) => { const c = await ig.listComments(post_id); log(`💬 comments ${post_id} → ${c.length}`); return c; },
  },
  {
    name: "reply_to_comment",
    description: "Reply publicly to a comment. The owner sees the exact reply and must approve it before it's sent; if they ask for changes you get their words back.",
    input_schema: {
      type: "object",
      properties: {
        comment_id: { type: "string" },
        comment_text: { type: "string", description: "The comment you're replying to, shown to the owner for context" },
        commenter: { type: "string", description: "Username of the person who commented" },
        reply: { type: "string", description: "The reply, exactly as it should appear" },
      },
      required: ["comment_id", "reply"],
    },
    schema: z.object({ comment_id: id, comment_text: z.string().max(3000).optional(), commenter: z.string().max(100).optional(), reply: z.string().min(1).max(2200) }),
    async run({ comment_id, comment_text, commenter, reply }) {
      const ok = await approve("Reply to comment", [
        ...(comment_text ? [dim(`@${commenter || "?"}: ${comment_text}`), ""] : []),
        bold(reply),
      ]);
      if (!ok.approved) { log(yellow("✋ reply not sent")); return notApproved(ok); }
      const r = await ig.replyToComment(comment_id, reply);
      log(green(`✓ replied${r.demo ? " (demo)" : ""}`));
      return { sent: true, ...r };
    },
  },
  {
    name: "hide_comment",
    description: "Hide a comment (spam, scams, abuse) so only the commenter sees it, or unhide it. Hiding is reversible; comments are never deleted. Needs the owner's approval.",
    input_schema: {
      type: "object",
      properties: {
        comment_id: { type: "string" },
        comment_text: { type: "string" },
        commenter: { type: "string" },
        reason: { type: "string", description: "Why it should be hidden, in one short line" },
        unhide: { type: "boolean", description: "true to show a hidden comment again" },
      },
      required: ["comment_id", "reason"],
    },
    schema: z.object({ comment_id: id, comment_text: z.string().max(3000).optional(), commenter: z.string().max(100).optional(), reason: z.string().min(1).max(300), unhide: z.boolean().optional() }),
    async run({ comment_id, comment_text, commenter, reason, unhide }) {
      const ok = await approve(unhide ? "Unhide comment" : "Hide comment", [`@${commenter || "?"}: ${comment_text || comment_id}`, dim(`Reason: ${reason}`)]);
      if (!ok.approved) { log(yellow("✋ left as it is")); return notApproved(ok); }
      const r = await ig.hideComment(comment_id, !unhide);
      log(green(`✓ ${unhide ? "unhidden" : "hidden"}${r.demo ? " (demo)" : ""}`));
      return { done: true, ...r };
    },
  },
  {
    name: "publish_post",
    description: "Post to Instagram: an image, a carousel (2-10 photos/videos), a Reel (video) or a Story. Media must be public https links straight to the files (Instagram downloads them). Checks the caption (max 2200 characters, 30 hashtags), then shows the owner the exact post; it's only published if they approve.",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["image", "carousel", "reel", "story"] },
        media_urls: { type: "array", items: { type: "string" }, description: "Public https links to the photo(s) or video, in order" },
        caption: { type: "string", description: "Full caption including hashtags (stories have no caption)" },
        alt_text: { type: "string", description: "Short description of the photo for people using screen readers (images only)" },
      },
      required: ["kind", "media_urls"],
    },
    schema: z.object({
      kind: z.enum(["image", "carousel", "reel", "story"]),
      media_urls: z.array(z.string().max(2000)).min(1).max(10),
      caption: z.string().max(5000).optional(),
      alt_text: z.string().max(1000).optional(),
    }),
    async run({ kind, media_urls, caption = "", alt_text }) {
      if (kind === "story") caption = "";
      const cc = ig.checkCaption(caption);
      if (!cc.ok) return { sent: false, error: `Fix the caption first: ${cc.problems.join("; ")}` };
      const ok = await approve(`New ${kind}${ig.DEMO ? " (demo: nothing is really posted)" : ""}`, [
        ...media_urls.map((u, i) => dim(`${media_urls.length > 1 ? `${i + 1}. ` : ""}${u}`)),
        "",
        caption ? bold(caption) : dim("(no caption)"),
        ...(alt_text ? ["", dim(`Alt text: ${alt_text}`)] : []),
        "",
        dim(`${cc.length} characters · ${cc.hashtags} hashtags`),
      ]);
      if (!ok.approved) { log(yellow("✋ not posted")); return notApproved(ok); }
      log("⏳ posting…");
      const r = await ig.publish({ kind, media: kind === "carousel" ? media_urls : media_urls[0], caption, alt_text,
        onWait: (i) => { if (i % 3 === 0) log("⏳ Instagram is processing the video…"); } });
      log(green(`✓ posted ${r.permalink || r.id}`));
      return { sent: true, ...r };
    },
  },
  {
    name: "save_document",
    description: "Save a finished document (content plan, caption ideas, monthly report) as a Markdown file in the output folder.",
    input_schema: {
      type: "object",
      properties: { filename: { type: "string", description: "e.g. 2026-12-instagram-plan.md" }, content: { type: "string" } },
      required: ["filename", "content"],
    },
    schema: z.object({ filename: z.string().min(1).max(120), content: z.string().min(1) }),
    async run({ filename, content }) {
      let name = path.basename(filename).replace(/[^\p{L}\p{N}._ -]+/gu, "-").trim() || "document";
      if (!/\.(md|txt|csv)$/i.test(name)) name += ".md";
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      fs.writeFileSync(path.join(OUTPUT_DIR, name), content, "utf8");
      log(green(`💾 saved output/${name}`));
      return { saved: true, path: `output/${name}` };
    },
  },
];
const TOOL_BY_NAME = Object.fromEntries(TOOLS.map((t) => [t.name, t]));
const API_TOOLS = [
  ...TOOLS.map(({ name, description, input_schema }) => ({ name, description, input_schema, eager_input_streaming: true })),
  ...(WEB_SEARCH ? [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }] : []),
];

const log = (s) => console.log(dim(`\n  ${s}`));

async function executeTool(block) {
  const tool = TOOL_BY_NAME[block.name];
  if (!tool) return { type: "tool_result", tool_use_id: block.id, is_error: true, content: `Unknown tool: ${block.name}` };
  // With eager input streaming the API doesn't validate tool input, so validate it here.
  const parsed = tool.schema.safeParse(block.input ?? {});
  if (!parsed.success) {
    log(red(`✗ ${block.name}: invalid input`));
    return { type: "tool_result", tool_use_id: block.id, is_error: true,
      content: JSON.stringify({ INVALID_JSON: JSON.stringify(block.input), problem: parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ") }) };
  }
  try {
    return { type: "tool_result", tool_use_id: block.id, content: JSON.stringify(await tool.run(parsed.data)) };
  } catch (e) {
    log(red(`✗ ${block.name}: ${e.message}`));
    return { type: "tool_result", tool_use_id: block.id, is_error: true, content: `Tool failed: ${e.message}` };
  }
}

/* ---------------------------------------------------------------- system prompt (fixed for the session, so it caches) */
const today = new Date().toISOString().slice(0, 10);
const SYSTEM = `You run the Instagram account of ${config.business_name}, a small business in ${config.country}, together with the owner. The owner is busy and not a social media expert. Today is ${today}.${ig.DEMO ? "\n\nDEMO MODE: no Instagram account is connected. The tools return sample data and nothing is really posted. Mention this once if the owner seems to think it's real." : ""}

What you do:
1. Posts. Write captions in ${config.languages}. Start with a strong first line (it's all people see before "more"), keep it short and warm, end with a clear next step (how to order or visit), then 3-8 relevant hashtags including the brand's own. Suggest what photo or video to shoot when the owner has none, and a good time to post. Offer two or three options when that helps. Add alt text for images.
2. Publishing with publish_post. You need public https links straight to the photo or video files. If the owner only has a photo on their phone, explain they need to upload it somewhere that gives a direct link first (see README → Photos). Never make up a link.
3. Comments. Check new comments with list_posts and list_comments. Skip ones already answered by the account. Reply in the commenter's language, short and friendly. Questions about location, hours, prices or menu: answer only from the brand profile; if it's unknown (TODO), say the shop will reply soon, or invite them to message the shop. Complaints: apologise sincerely, don't argue, ask them to send a direct message so the shop can make it right; don't admit legal fault or offer refunds/discounts unless the owner says so. Spam, scams and abuse: suggest hide_comment instead of replying. Never reply to bots.
4. Results. Use get_post_insights and get_account_insights and quote the real numbers. Compare posts by engagement rate and reach, say what worked (format, topic, time) and give 2-3 concrete ideas. Don't overclaim from a handful of posts.
5. Plans. Content calendars and reports go in a document via save_document, with a short summary in chat. Use web search for Thai holidays, events and current Instagram trends when needed.

Rules:
- publish_post, reply_to_comment and hide_comment always ask the owner first. If they decline or ask for changes, follow what they said. Never claim something was posted unless the tool says sent: true.
- Handle one action per approval; when there are several replies, call reply_to_comment once per reply.
- Use only facts from the brand profile below, the account data and web search. Never invent prices, opening hours, addresses, promotions, awards or customer quotes. Anything marked TODO is unknown: use a clear [placeholder] in drafts and ask the owner.
- No health claims, no "best in Thailand", no fake urgency.
- Keep chat answers concise.

<brand_profile>
${knowledge()}
</brand_profile>`;

/* ---------------------------------------------------------------- chat loop */
const client = new Anthropic();
let messages = [], current = null, interrupted = false, totalCost = 0;

async function respond() {
  let jsonRetries = 0;
  while (true) {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 64000,
      system: SYSTEM,
      tools: API_TOOLS,
      messages,
      thinking: { type: "adaptive" },
      output_config: { effort: EFFORT },
      cache_control: { type: "ephemeral" },
      ...(FALLBACK_MODELS.has(MODEL) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {}),
    });
    current = stream;
    let message;
    try {
      for await (const ev of stream) {
        if (ev.type === "content_block_start") {
          const b = ev.content_block;
          if (b.type === "server_tool_use") process.stdout.write(dim("\n  🌐 searching the web…"));
          else if (b.type === "text") process.stdout.write("\n");
        } else if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
          process.stdout.write(ev.delta.text);
        }
      }
      message = await stream.finalMessage();
      jsonRetries = 0;
    } catch (err) {
      if (interrupted) { interrupted = false; console.log(yellow("\n(stopped)")); return; }
      if (err instanceof Anthropic.APIError) throw err;
      if (jsonRetries++ >= 2) throw err;                 // a tool input wasn't valid JSON: ask again
      continue;
    } finally {
      current = null;
    }

    const u = message.usage;
    totalCost += (u.input_tokens * PRICE.input + u.output_tokens * PRICE.output
      + (u.cache_read_input_tokens || 0) * PRICE.cacheRead + (u.cache_creation_input_tokens || 0) * PRICE.cacheWrite) / 1e6
      + (u.server_tool_use?.web_search_requests || 0) * 0.01;

    if (message.stop_reason === "refusal") { console.log(red("\nClaude declined this request. Try rephrasing it.")); return; }
    const toolUses = message.content.filter((b) => b.type === "tool_use");
    if (message.stop_reason === "max_tokens" && toolUses.length) {
      console.log(red("\nThe answer was cut off. Try asking for a smaller piece."));
      return;
    }
    messages.push({ role: "assistant", content: message.content });     // append unchanged; never edit history
    if (message.stop_reason === "pause_turn") continue;                   // long web search: let it continue
    if (!toolUses.length) { console.log(dim(`\n\n  [session ≈ $${totalCost.toFixed(3)}]`)); return; }
    const results = [];
    for (const b of toolUses) results.push(await executeTool(b));      // one at a time: approvals ask in order
    messages.push({ role: "user", content: results });
  }
}

rl.on("SIGINT", () => {
  if (current) { interrupted = true; current.abort(); return; }
  console.log("\nBye!"); process.exit(0);
});

console.log(bold(cyan(`${config.short_name || config.business_name} — Instagram assistant`)) + dim(` · ${MODEL} · effort ${EFFORT}`));
if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) console.log(yellow(`No ANTHROPIC_API_KEY found. Put it in ${path.join(HERE, ".env")} (see README.md).`));
if (ig.DEMO) console.log(yellow("Demo mode: no Instagram account connected (IG_ACCESS_TOKEN), so it uses sample posts and nothing is really posted."));
else {
  try { const a = await ig.account(); console.log(dim(`Connected: @${a.username} · ${a.followers_count ?? "?"} followers · ${a.media_count ?? "?"} posts`)); }
  catch (e) { console.log(red(`Instagram: ${e.message}`)); }
}
console.log(dim(`Try: "Answer the new comments" · "How did my last 10 posts do?"
     "Write a caption for this photo: https://… and post it" · "Plan 2 weeks of posts for December"
Commands: /new (start over), ${ig.DEMO ? "/demo-reset (fresh sample data), " : ""}/exit\n`));

while (true) {
  let input;
  try { input = (await rl.question(bold(green("\n> ")))).trim(); } catch { break; }
  if (!input) continue;
  if (input === "/exit" || input === "/quit") break;
  if (input === "/new") { messages = []; console.log(dim("Started a new conversation.")); continue; }
  if (input === "/demo-reset") { ig.demoReset(); console.log(dim("Sample data reset.")); continue; }

  messages.push({ role: "user", content: input });
  try {
    await respond();
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) console.log(red("\nThe API key was rejected. Check ANTHROPIC_API_KEY in .env."));
    else if (err instanceof Anthropic.RateLimitError) console.log(red("\nRate limit reached. Wait a minute and try again."));
    else if (err instanceof Anthropic.BadRequestError) console.log(red(`\nRequest rejected: ${err.message}`));
    else if (err instanceof Anthropic.APIConnectionError) console.log(red("\nCould not reach the Claude API. Check the internet connection."));
    else if (err instanceof Anthropic.APIError) console.log(red(`\nAPI error ${err.status ?? ""}: ${err.message}`));
    else console.log(red(`\nUnexpected error: ${err?.stack || err}`));
    if (messages.at(-1)?.role === "user" && typeof messages.at(-1).content === "string") messages.pop();
  }
}
rl.close();
