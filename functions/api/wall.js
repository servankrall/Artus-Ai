/**
 * Canlı Duvar — kullanıcıların paylaştığı ortak mesaj akışı.
 *
 * GET  /api/wall                                   → { messages:[{id,name,text,t}] }
 * POST /api/wall  { name, text }                   → mesaj ekle (herkese açık)
 * POST /api/wall  { action:"delete", secret, id }  → tek mesaj sil (creator)
 * POST /api/wall  { action:"clear", secret }       → tümünü sil (creator)
 *
 * KV: SITE_CONFIG, key "wall" → son 60 mesaj
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const KEY = "wall";
const MAX = 60;

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
  return json({ messages: raw ? JSON.parse(raw) : [] });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let body = {};
  try { body = await request.json(); } catch {}

  if (body.action === "clear") {
    if (!body.secret || body.secret !== env.CREATOR_SECRET) return json({ error: "Yetkisiz" }, 403);
    await env.SITE_CONFIG.delete(KEY);
    return json({ ok: true, messages: [] });
  }

  const raw = await env.SITE_CONFIG.get(KEY);
  let messages = raw ? JSON.parse(raw) : [];

  if (body.action === "delete") {
    if (!body.secret || body.secret !== env.CREATOR_SECRET) return json({ error: "Yetkisiz" }, 403);
    messages = messages.filter((m) => m.id !== body.id);
    await env.SITE_CONFIG.put(KEY, JSON.stringify(messages));
    return json({ ok: true, messages });
  }

  // Mesaj ekle (herkese açık)
  const name = (body.name || "Misafir").toString().trim().slice(0, 24) || "Misafir";
  const text = (body.text || "").toString().trim().slice(0, 200);
  if (!text) return json({ error: "Boş mesaj" }, 400);

  messages.push({ id: "m" + Date.now() + Math.random().toString(36).slice(2, 6), name, text, t: Date.now() });
  if (messages.length > MAX) messages = messages.slice(messages.length - MAX);
  await env.SITE_CONFIG.put(KEY, JSON.stringify(messages));
  return json({ ok: true, messages });
}
