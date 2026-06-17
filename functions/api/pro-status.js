/**
 * Cloudflare Pages Function: /api/pro-status
 * Pro durumu — Cloudflare KV ile e-posta bazlı senkron
 *
 * Cloudflare dashboard'da KV namespace oluştur:
 *   Workers & Pages → KV → "Create namespace" → adı: PRO_USERS
 * Sonra Pages projesinde bağla:
 *   Settings → Functions → KV namespace bindings → Variable: PRO_USERS
 *
 * KV yoksa (bağlı değilse) graceful fallback — uygulama çalışmaya devam eder.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function onRequestOptions() {
  return new Response(null, { status: 200, headers: CORS });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const kv = env.PRO_USERS; // KV namespace binding

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Geçersiz JSON" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const email = (body.email || "").trim().toLowerCase();
  if (!email) {
    return new Response(JSON.stringify({ error: "email gerekli" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // KV bağlı değilse graceful fallback
  if (!kv) {
    return new Response(JSON.stringify({ pro: false, note: "KV bağlı değil" }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  if (body.activate) {
    await kv.put(email, JSON.stringify({ pro: true, activatedAt: Date.now() }));
    return new Response(JSON.stringify({ pro: true }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const raw = await kv.get(email);
  const pro = raw ? !!JSON.parse(raw).pro : false;
  return new Response(JSON.stringify({ pro }), {
    status: 200,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
