/**
 * GET  /api/global-modes → { modes: {} }
 * POST /api/global-modes → { modes: {} }  (creator only, body: { secret, modes })
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const MODES_KEY = "global_active_modes";

export async function onRequestOptions() {
  return new Response(null, { status: 200, headers: CORS });
}

export async function onRequestGet(context) {
  const { env } = context;
  const raw = await env.SITE_CONFIG.get(MODES_KEY, { cacheTtl: 0 });
  const modes = raw ? JSON.parse(raw) : {};
  return new Response(JSON.stringify({ modes }), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: "Geçersiz JSON" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  // Secret doğrulama — CREATOR_SECRET env var ile karşılaştır
  if (!body.secret || body.secret !== env.CREATOR_SECRET) {
    return new Response(JSON.stringify({ error: "Yetkisiz" }), { status: 403, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  const modes = body.modes || {};
  await env.SITE_CONFIG.put(MODES_KEY, JSON.stringify(modes));
  return new Response(JSON.stringify({ ok: true, modes }), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
