/**
 * Canlı tepki / alkış sistemi.
 *
 * POST /api/reactions  { emoji }   → tepki ekle, { counts } döner (herkese açık)
 * GET  /api/reactions              → { counts }
 * POST /api/reactions  { action:"reset", secret }  → sıfırla (creator)
 *
 * KV: SITE_CONFIG, key "reactions" → { "👏": 12, "❤️": 5, ... }
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const KEY = "reactions";
const ALLOWED = ["👏", "❤️", "😂", "🔥", "🎉", "👍", "😮", "💜"];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 200, headers: CORS });
}

export async function onRequestGet(context) {
  const { env } = context;
  const raw = await env.SITE_CONFIG.get(KEY);
  return json({ counts: raw ? JSON.parse(raw) : {} });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let body = {};
  try { body = await request.json(); } catch {}

  if (body.action === "reset") {
    if (!body.secret || body.secret !== env.CREATOR_SECRET) return json({ error: "Yetkisiz" }, 403);
    await env.SITE_CONFIG.delete(KEY);
    return json({ ok: true, counts: {} });
  }

  const emoji = (body.emoji || "").toString();
  if (!ALLOWED.includes(emoji)) return json({ error: "Geçersiz tepki" }, 400);

  const raw = await env.SITE_CONFIG.get(KEY);
  const counts = raw ? JSON.parse(raw) : {};
  counts[emoji] = (counts[emoji] || 0) + 1;
  await env.SITE_CONFIG.put(KEY, JSON.stringify(counts));
  return json({ ok: true, counts });
}
