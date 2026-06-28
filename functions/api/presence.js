/**
 * Canlı çevrimiçi kullanıcı sayacı (heartbeat).
 *
 * POST /api/presence  { id }   → kullanıcı "ben buradayım" sinyali, { online } döner
 * GET  /api/presence           → { online }  (son 60 sn içinde aktif kullanıcı sayısı)
 *
 * KV: SITE_CONFIG, key "presence" → { id: lastSeenMs }
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const KEY = "presence";
const TTL = 60 * 1000; // 60 sn

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 200, headers: CORS });
}

function prune(map, now) {
  let changed = false;
  for (const id of Object.keys(map)) {
    if (now - map[id] > TTL) { delete map[id]; changed = true; }
  }
  return changed;
}

export async function onRequestGet(context) {
  const { env } = context;
  const now = Date.now();
  const raw = await env.SITE_CONFIG.get(KEY);
  const map = raw ? JSON.parse(raw) : {};
  prune(map, now);
  return json({ online: Object.keys(map).length });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const now = Date.now();
  let body = {};
  try { body = await request.json(); } catch {}
  const id = (body.id || "").toString().slice(0, 64);
  if (!id) return json({ error: "id gerekli" }, 400);

  const raw = await env.SITE_CONFIG.get(KEY);
  const map = raw ? JSON.parse(raw) : {};
  map[id] = now;
  prune(map, now);
  // Aşırı büyümeyi önle (kötüye kullanım koruması)
  const ids = Object.keys(map);
  if (ids.length > 5000) {
    ids.sort((a, b) => map[a] - map[b]).slice(0, ids.length - 5000).forEach((k) => delete map[k]);
  }
  await env.SITE_CONFIG.put(KEY, JSON.stringify(map));
  return json({ ok: true, online: Object.keys(map).length });
}
