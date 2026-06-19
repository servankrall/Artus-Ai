/**
 * POST /api/verify-payment
 * Body: { session_id: string }
 * Returns: { tier: "pro"|"max", email: string }
 * Env var: STRIPE_SECRET_KEY
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

  let body;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: "Geçersiz istek" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  const sessionId = (body.session_id || "").trim();
  if (!sessionId || !sessionId.startsWith("cs_")) {
    return new Response(JSON.stringify({ error: "Geçersiz session" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  const resp = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
    headers: { "Authorization": "Bearer " + env.STRIPE_SECRET_KEY },
  });

  const session = await resp.json();
  if (!resp.ok || session.payment_status !== "paid") {
    return new Response(JSON.stringify({ error: "Ödeme doğrulanamadı" }), { status: 402, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  const tier  = session.metadata?.tier || "pro";
  const email = session.customer_email || session.customer_details?.email || "";

  return new Response(JSON.stringify({ tier, email }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
}
