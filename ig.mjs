#!/usr/bin/env node
/**
 * ig.mjs: a small client for the Instagram API (Instagram Login, graph.instagram.com).
 * Used by agent.mjs, and also works on its own from the command line (that's how the
 * Claude Code skill uses it):
 *
 *   node ig.mjs account
 *   node ig.mjs posts [limit]
 *   node ig.mjs insights <post-id>
 *   node ig.mjs account-insights [days]
 *   node ig.mjs comments <post-id>
 *   node ig.mjs reply <comment-id> "<text>" --confirm
 *   node ig.mjs hide <comment-id> --confirm          (unhide: --unhide)
 *   node ig.mjs publish image <url> "<caption>" --confirm
 *   node ig.mjs publish carousel <url1,url2,...> "<caption>" --confirm
 *   node ig.mjs publish reel <video-url> "<caption>" --confirm
 *   node ig.mjs publish story <image-or-video-url> --confirm
 *   node ig.mjs limit
 *   node ig.mjs refresh-token
 *
 * Without IG_ACCESS_TOKEN (or with IG_DEMO=true) it runs in demo mode with sample data,
 * and nothing is sent to Instagram.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
try { process.loadEnvFile(path.join(HERE, ".env")); } catch { /* no .env is fine */ }

const API = (process.env.IG_API_BASE || "https://graph.instagram.com").replace(/\/$/, "");
const VERSION = process.env.IG_API_VERSION || "v23.0";
export const DEMO = process.env.IG_DEMO === "true" || !process.env.IG_ACCESS_TOKEN;
const token = () => process.env.IG_ACCESS_TOKEN;

/* ---------------------------------------------------------------- HTTP */
export class IgError extends Error {
  constructor(message, code, status) { super(message); this.code = code; this.status = status; }
}

function friendly(err, status) {
  const code = err?.code, sub = err?.error_subcode;
  if (code === 190) return "The Instagram access token is invalid or expired. Get a new one (README → Connect Instagram) or run: npm run refresh-token";
  if (code === 4 || code === 17 || code === 32 || code === 613) return "Instagram rate limit reached. Wait a while and try again.";
  if (code === 10 || code === 200) return `Instagram refused permission: ${err.message}. Check the app has the needed permissions (README).`;
  if (code === 9 && sub === 2207042) return "The daily publishing limit (about 50 posts a day) is reached.";
  if (sub === 2207026 || sub === 2207004 || sub === 2207009) return `Instagram couldn't use the media: ${err.error_user_msg || err.message}. Check the link opens publicly and the format/size is allowed (README).`;
  return err?.error_user_msg || err?.message || `Instagram API error (HTTP ${status})`;
}

async function call(method, pathname, params = {}) {
  const url = new URL(`${API}/${VERSION}/${pathname.replace(/^\//, "")}`);
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) (method === "GET" ? url.searchParams : body).set(k, String(v));
  const headers = { authorization: `Bearer ${token()}` };
  let res;
  try {
    res = await fetch(url, { method, headers, ...(method === "GET" ? {} : { body }), signal: AbortSignal.timeout(30000) });
  } catch (e) {
    throw new IgError(`Could not reach Instagram (${e.cause?.code || e.message}). Check the internet connection.`);
  }
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new IgError(friendly(j.error, res.status), j.error?.code, res.status);
  return j;
}
const get = (p, q) => call("GET", p, q);
const post = (p, q) => call("POST", p, q);

/* ---------------------------------------------------------------- demo data */
const DEMO_FILE = path.join(HERE, "output", "demo-instagram.json");
const day = (n) => new Date(Date.now() - n * 864e5).toISOString().replace(/\.\d+Z$/, "+0000");
function demoSeed() {
  return {
    account: { user_id: "17840000000000001", username: "karena.curry.demo", name: "Karena Curry Rice (demo)", account_type: "BUSINESS", followers_count: 1284, follows_count: 210, media_count: 4 },
    posts: [
      { id: "demo_post_1", media_type: "IMAGE", media_product_type: "FEED", timestamp: day(1), permalink: "https://www.instagram.com/p/demo1/", caption: "ข้าวแกงกะหรี่หมูทอดกรอบๆ ราดแกงเข้มข้น 🍛✨ #KarenaCurryRice #ข้าวแกงกะหรี่ญี่ปุ่น", like_count: 86, comments_count: 3,
        insights: { reach: 1530, views: 2210, likes: 86, comments: 3, shares: 7, saved: 19, total_interactions: 115 } },
      { id: "demo_post_2", media_type: "VIDEO", media_product_type: "REELS", timestamp: day(4), permalink: "https://www.instagram.com/reel/demo2/", caption: "เบื้องหลังการทอดคัตสึ 🎬 กรอบนอกนุ่มใน", like_count: 241, comments_count: 2,
        insights: { reach: 6120, views: 9840, likes: 241, comments: 2, shares: 38, saved: 52, total_interactions: 333 } },
      { id: "demo_post_3", media_type: "CAROUSEL_ALBUM", media_product_type: "FEED", timestamp: day(8), permalink: "https://www.instagram.com/p/demo3/", caption: "เมนูใหม่! แกงกะหรี่ไก่คาราอาเกะ 3 แบบ เลือกเผ็ดได้ 🌶️", like_count: 64, comments_count: 1,
        insights: { reach: 1210, views: 1980, likes: 64, comments: 1, shares: 4, saved: 11, total_interactions: 80 } },
      { id: "demo_post_4", media_type: "IMAGE", media_product_type: "FEED", timestamp: day(13), permalink: "https://www.instagram.com/p/demo4/", caption: "Monday lunch? Pork curry rice from ฿49 🍛", like_count: 38, comments_count: 0,
        insights: { reach: 820, views: 1100, likes: 38, comments: 0, shares: 1, saved: 3, total_interactions: 42 } },
    ],
    comments: {
      demo_post_1: [
        { id: "demo_c1", username: "nong_food", text: "น่ากินมากกก ร้านอยู่ตรงไหนคะ?", timestamp: day(1), like_count: 2, hidden: false, replies: [] },
        { id: "demo_c2", username: "mike.bkk", text: "Ordered yesterday, the rice was cold and it took 40 minutes 😕", timestamp: day(1), like_count: 0, hidden: false, replies: [] },
        { id: "demo_c3", username: "cheap_followers_4u", text: "🔥 Get 10k followers FAST, DM us now!!! link in bio", timestamp: day(1), like_count: 0, hidden: false, replies: [] },
      ],
      demo_post_2: [
        { id: "demo_c4", username: "aom.eats", text: "ขอสูตรได้มั้ยคะ 555 กรอบมาก", timestamp: day(3), like_count: 5, hidden: false, replies: [] },
        { id: "demo_c5", username: "ken_jp", text: "Tastes like home in Osaka! 🇯🇵", timestamp: day(3), like_count: 9, hidden: false, replies: [{ id: "demo_r1", username: "karena.curry.demo", text: "ありがとうございます! 🙏", timestamp: day(3) }] },
      ],
      demo_post_3: [{ id: "demo_c6", username: "fern.ss", text: "เผ็ดสุดเผ็ดแค่ไหนคะ", timestamp: day(7), like_count: 1, hidden: false, replies: [] }],
    },
    published: [],
  };
}
function demoLoad() {
  try { return JSON.parse(fs.readFileSync(DEMO_FILE, "utf8")); } catch { return demoSeed(); }
}
function demoSave(d) { fs.mkdirSync(path.dirname(DEMO_FILE), { recursive: true }); fs.writeFileSync(DEMO_FILE, JSON.stringify(d, null, 2)); }
export function demoReset() { fs.rmSync(DEMO_FILE, { force: true }); }

/* ---------------------------------------------------------------- read */
const POST_FIELDS = "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count";
let cachedUserId = process.env.IG_USER_ID || null;

export async function account() {
  if (DEMO) return { ...demoLoad().account, demo: true };
  const a = await get("me", { fields: "user_id,username,name,account_type,followers_count,follows_count,media_count" });
  cachedUserId = a.user_id || a.id;
  return a;
}
async function userId() { if (!cachedUserId) await account(); return cachedUserId; }

export async function listPosts(limit = 12) {
  limit = Math.max(1, Math.min(50, Number(limit) || 12));
  if (DEMO) return demoLoad().posts.slice(0, limit).map(({ insights, ...p }) => p);
  const j = await get(`${await userId()}/media`, { fields: POST_FIELDS, limit });
  return j.data || [];
}

const MEDIA_METRICS = { FEED: "reach,views,likes,comments,shares,saved,total_interactions", REELS: "reach,views,likes,comments,shares,saved,total_interactions,ig_reels_avg_watch_time", STORY: "reach,views,replies,shares,total_interactions,navigation" };
export async function postInsights(mediaId) {
  if (DEMO) {
    const p = demoLoad().posts.find((x) => x.id === mediaId);
    if (!p) throw new IgError(`No post with id ${mediaId}`);
    return { id: p.id, media_product_type: p.media_product_type, timestamp: p.timestamp, ...p.insights, engagement_rate: rate(p.insights) };
  }
  const p = await get(mediaId, { fields: "id,media_product_type,timestamp,permalink" });
  const metric = MEDIA_METRICS[p.media_product_type] || MEDIA_METRICS.FEED;
  const j = await get(`${mediaId}/insights`, { metric });
  const out = { id: p.id, media_product_type: p.media_product_type, timestamp: p.timestamp, permalink: p.permalink };
  for (const m of j.data || []) out[m.name] = m.values?.[0]?.value ?? m.total_value?.value;
  if (out.reach) out.engagement_rate = rate(out);
  return out;
}
const rate = (i) => (i.reach ? `${((i.total_interactions ?? (i.likes || 0) + (i.comments || 0) + (i.shares || 0) + (i.saved || 0)) / i.reach * 100).toFixed(1)}% of people reached` : undefined);

export async function accountInsights(days = 28) {
  days = Math.max(1, Math.min(30, Number(days) || 28));
  if (DEMO) {
    const a = demoLoad();
    const s = a.posts.reduce((t, p) => ({ reach: t.reach + p.insights.reach, views: t.views + p.insights.views, total_interactions: t.total_interactions + p.insights.total_interactions }), { reach: 0, views: 0, total_interactions: 0 });
    return { period_days: days, ...s, accounts_engaged: Math.round(s.reach * 0.06), follows_and_unfollows: { follows: 31, unfollows: 6 }, followers_count: a.account.followers_count, demo: true };
  }
  const until = Math.floor(Date.now() / 1000), since = until - days * 86400;
  const j = await get(`${await userId()}/insights`, { metric: "reach,views,accounts_engaged,total_interactions,follows_and_unfollows", period: "day", metric_type: "total_value", since, until });
  const out = { period_days: days };
  for (const m of j.data || []) {
    const tv = m.total_value;
    out[m.name] = tv?.breakdowns?.[0]?.results
      ? Object.fromEntries(tv.breakdowns[0].results.map((r) => [String(r.dimension_values?.[0] || "").toLowerCase().replace("follower", "follows").replace("non_follows", "unfollows"), r.value]))
      : tv?.value;
  }
  return out;
}

export async function listComments(mediaId, limit = 50) {
  if (DEMO) {
    const d = demoLoad();
    if (!d.posts.some((p) => p.id === mediaId)) throw new IgError(`No post with id ${mediaId}`);
    return (d.comments[mediaId] || []).slice(0, limit);
  }
  const j = await get(`${mediaId}/comments`, { fields: "id,text,username,timestamp,like_count,hidden,replies{id,text,username,timestamp}", limit: Math.min(50, limit) });
  return (j.data || []).map((c) => ({ ...c, replies: c.replies?.data || [] }));
}

export async function publishingLimit() {
  if (DEMO) return { quota_usage: demoLoad().published.length, quota_total: 50, demo: true };
  const j = await get(`${await userId()}/content_publishing_limit`, { fields: "quota_usage,config" });
  const d = j.data?.[0] || {};
  return { quota_usage: d.quota_usage, quota_total: d.config?.quota_total, quota_duration_hours: d.config?.quota_duration ? d.config.quota_duration / 3600 : undefined };
}

/* ---------------------------------------------------------------- write (callers must get approval first) */
const CAPTION_MAX = 2200;
export function checkCaption(caption = "") {
  const problems = [];
  if (caption.length > CAPTION_MAX) problems.push(`caption is ${caption.length} characters (max ${CAPTION_MAX})`);
  const tags = caption.match(/(^|\s)#[\p{L}\p{N}_]+/gu) || [];
  if (tags.length > 30) problems.push(`${tags.length} hashtags (max 30)`);
  const mentions = caption.match(/(^|\s)@[\w.]+/g) || [];
  if (mentions.length > 20) problems.push(`${mentions.length} @mentions (max 20)`);
  return { ok: !problems.length, problems, hashtags: tags.length, length: caption.length };
}
function checkUrl(u) {
  let x;
  try { x = new URL(u); } catch { throw new IgError(`"${u}" is not a link. Instagram needs a public https link to the photo or video (README → Photos).`); }
  if (x.protocol !== "https:") throw new IgError(`Instagram needs an https link, got ${x.protocol}`);
  if (/^(localhost|127\.|10\.|192\.168\.)/.test(x.hostname)) throw new IgError("That link is only on this computer. Instagram must be able to download the file from the internet.");
  if (/drive\.google\.com|dropbox\.com\/s\//.test(x.hostname + x.pathname)) throw new IgError("Google Drive / Dropbox share pages don't work: Instagram needs a direct link to the file itself (README → Photos).");
  return x.href;
}

export async function replyToComment(commentId, message) {
  message = String(message || "").trim();
  if (!message) throw new IgError("The reply is empty.");
  if (message.length > 2200) throw new IgError("The reply is too long (max 2200 characters).");
  if (DEMO) {
    const d = demoLoad();
    const c = Object.values(d.comments).flat().find((x) => x.id === commentId);
    if (!c) throw new IgError(`No comment with id ${commentId}`);
    const r = { id: `demo_r${Date.now()}`, username: d.account.username, text: message, timestamp: day(0) };
    c.replies.push(r); demoSave(d);
    return { id: r.id, demo: true };
  }
  return post(`${commentId}/replies`, { message });
}

export async function hideComment(commentId, hide = true) {
  if (DEMO) {
    const d = demoLoad();
    const c = Object.values(d.comments).flat().find((x) => x.id === commentId);
    if (!c) throw new IgError(`No comment with id ${commentId}`);
    c.hidden = hide; demoSave(d);
    return { success: true, demo: true };
  }
  return post(commentId, { hide });
}

async function waitReady(containerId, onWait) {
  for (let i = 0; i < 60; i++) {                      // videos can take a few minutes to process
    const s = await get(containerId, { fields: "status_code,status" });
    if (s.status_code === "FINISHED") return;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new IgError(`Instagram couldn't process the media: ${s.status || s.status_code}. Check the format and size (README → Photos).`);
    onWait?.(i);
    await new Promise((r) => setTimeout(r, Number(process.env.IG_POLL_MS || 5000)));
  }
  throw new IgError("Instagram is still processing the video after 5 minutes. Try again later.");
}

/** kind: image | carousel | reel | story. media: one URL, or a list for carousel. */
export async function publish({ kind, media, caption = "", alt_text, share_to_feed = true, onWait }) {
  const urls = (Array.isArray(media) ? media : [media]).filter(Boolean).map(checkUrl);
  if (!urls.length) throw new IgError("No photo or video link given.");
  if (kind === "carousel" && (urls.length < 2 || urls.length > 10)) throw new IgError("A carousel needs 2 to 10 photos/videos.");
  if (kind !== "carousel" && urls.length > 1) throw new IgError(`A ${kind} takes one link. Use a carousel for several.`);
  const cc = checkCaption(caption);
  if (!cc.ok) throw new IgError(`Caption problem: ${cc.problems.join("; ")}`);
  const isVideo = (u) => /\.(mp4|mov)(\?|$)/i.test(u);

  if (DEMO) {
    const d = demoLoad();
    const p = { id: `demo_new_${d.published.length + 1}`, kind, media: urls, caption, alt_text, published_at: new Date().toISOString() };
    d.published.push(p); demoSave(d);
    return { id: p.id, permalink: `https://www.instagram.com/p/${p.id}/`, demo: true, note: "Demo mode: nothing was posted to Instagram." };
  }

  const uid = await userId();
  let creation;
  if (kind === "image") {
    if (isVideo(urls[0])) throw new IgError("That looks like a video. Use kind \"reel\" for videos.");
    creation = await post(`${uid}/media`, { image_url: urls[0], caption, alt_text });
  } else if (kind === "reel") {
    creation = await post(`${uid}/media`, { media_type: "REELS", video_url: urls[0], caption, share_to_feed });
    await waitReady(creation.id, onWait);
  } else if (kind === "story") {
    creation = await post(`${uid}/media`, isVideo(urls[0]) ? { media_type: "STORIES", video_url: urls[0] } : { media_type: "STORIES", image_url: urls[0] });
    if (isVideo(urls[0])) await waitReady(creation.id, onWait);
  } else if (kind === "carousel") {
    const children = [];
    for (const u of urls) {
      const c = await post(`${uid}/media`, isVideo(u) ? { media_type: "VIDEO", video_url: u, is_carousel_item: true } : { image_url: u, is_carousel_item: true });
      if (isVideo(u)) await waitReady(c.id, onWait);
      children.push(c.id);
    }
    creation = await post(`${uid}/media`, { media_type: "CAROUSEL", children: children.join(","), caption });
    await waitReady(creation.id, onWait);
  } else {
    throw new IgError(`Unknown post type "${kind}". Use image, carousel, reel or story.`);
  }
  const done = await post(`${uid}/media_publish`, { creation_id: creation.id });
  let permalink;
  try { permalink = (await get(done.id, { fields: "permalink" })).permalink; } catch { /* not important */ }
  return { id: done.id, permalink };
}

/** Long-lived tokens last 60 days; refreshing gives another 60. Saves the new token in .env. */
export async function refreshToken() {
  if (DEMO) throw new IgError("No IG_ACCESS_TOKEN set, so there's nothing to refresh (demo mode).");
  const url = new URL(`${API}/refresh_access_token`);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", token());
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new IgError(friendly(j.error, res.status), j.error?.code, res.status);
  const envFile = path.join(HERE, ".env");
  let saved = false;
  if (fs.existsSync(envFile)) {
    const txt = fs.readFileSync(envFile, "utf8");
    if (/^IG_ACCESS_TOKEN=.*$/m.test(txt)) { fs.writeFileSync(envFile, txt.replace(/^IG_ACCESS_TOKEN=.*$/m, `IG_ACCESS_TOKEN=${j.access_token}`)); saved = true; }
  }
  process.env.IG_ACCESS_TOKEN = j.access_token;
  return { expires_in_days: Math.round((j.expires_in || 0) / 86400), saved_to_env: saved };
}

/* ---------------------------------------------------------------- command line */
async function cli(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const args = argv.filter((a) => !a.startsWith("--"));
  const [cmd, a1, a2, a3] = args;
  const confirm = flags.has("--confirm");
  const out = (x) => console.log(JSON.stringify(x, null, 2));
  const needConfirm = (what) => {
    console.log(JSON.stringify({ preview: what, not_sent: true, note: "Nothing was sent. Show this to the owner, and run the same command again with --confirm only after they approve it." }, null, 2));
  };
  if (DEMO && cmd && cmd !== "help") console.error("[demo mode: sample data, nothing is sent to Instagram]");
  switch (cmd) {
    case "account": return out(await account());
    case "posts": return out(await listPosts(a1));
    case "insights": if (!a1) throw new IgError("Usage: insights <post-id>"); return out(await postInsights(a1));
    case "account-insights": return out(await accountInsights(a1));
    case "comments": if (!a1) throw new IgError("Usage: comments <post-id>"); return out(await listComments(a1));
    case "limit": return out(await publishingLimit());
    case "reply":
      if (!a1 || !a2) throw new IgError('Usage: reply <comment-id> "<text>" --confirm');
      return confirm ? out(await replyToComment(a1, a2)) : needConfirm({ action: "reply to comment", comment_id: a1, text: a2 });
    case "hide":
      if (!a1) throw new IgError("Usage: hide <comment-id> --confirm  (add --unhide to show it again)");
      return confirm ? out(await hideComment(a1, !flags.has("--unhide"))) : needConfirm({ action: flags.has("--unhide") ? "unhide comment" : "hide comment", comment_id: a1 });
    case "publish": {
      if (!a1 || !a2) throw new IgError('Usage: publish image|carousel|reel|story <url or url1,url2> "<caption>" --confirm');
      const media = a1 === "carousel" ? a2.split(",").map((s) => s.trim()) : a2;
      if (!confirm) {
        (Array.isArray(media) ? media : [media]).forEach(checkUrl);
        return needConfirm({ action: `publish ${a1}`, media, caption: a3 || "", caption_check: checkCaption(a3 || "") });
      }
      return out(await publish({ kind: a1, media, caption: a3 || "", onWait: () => console.error("  …Instagram is processing the video") }));
    }
    case "check-caption": return out(checkCaption(a1 || ""));
    case "refresh-token": return out(await refreshToken());
    case "demo-reset": demoReset(); return out({ reset: true });
    default:
      console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").match(/\/\*\*([\s\S]*?)\*\//)[1].replace(/^ \* ?/gm, "").trim());
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cli(process.argv.slice(2)).catch((e) => { console.error(JSON.stringify({ error: e.message })); process.exitCode = 1; });
}
