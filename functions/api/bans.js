/**
 * GET  /api/bans              → { bans: { email: { reason, until, bannedAt } } }
 * POST /api/bans              → ban/unban (creator only)
 *   body: { secret, action: "ban"|"unban", email, reason, duration }
 *   duration: minutes (0 = permanent)
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const BANS_KEY = "global_bans";

export async function onRequestOptions() {
  return new Response(null, { status: 200, headers: CORS });
}

export async function onRequestGet(context) {
  const { env } = context;
  const raw = await env.SITE_CONFIG.get(BANS_KEY);
  const bans = raw ? JSON.parse(raw) : {};
  // Süresi dolmuş banları temizle
  const now = Date.now();
  let changed = false;
  for (const email of Object.keys(bans)) {
    if (bans[email].until !== 0 && bans[email].until < now) {
      delete bans[email];
      changed = true;
    }
  }
  if (changed) await env.SITE_CONFIG.put(BANS_KEY, JSON.stringify(bans));
  return new Response(JSON.stringify({ bans }), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: "Geçersiz JSON" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  if (!body.secret || body.secret !== env.CREATOR_SECRET) {
    return new Response(JSON.stringify({ error: "Yetkisiz" }), { status: 403, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  const raw = await env.SITE_CONFIG.get(BANS_KEY);
  const bans = raw ? JSON.parse(raw) : {};

  if (body.action === "unban") {
    delete bans[body.email];
  } else if (body.action === "ban") {
    const durationMs = body.duration > 0 ? body.duration * 60 * 1000 : 0;
    bans[body.email] = {
      reason: body.reason || "Admin kararı",
      bannedAt: Date.now(),
      until: durationMs > 0 ? Date.now() + durationMs : 0, // 0 = kalıcı
    };
  } else if (body.action === "clear") {
    Object.keys(bans).forEach(k => delete bans[k]);
  }

  await env.SITE_CONFIG.put(BANS_KEY, JSON.stringify(bans));
  return new Response(JSON.stringify({ ok: true, bans }), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
