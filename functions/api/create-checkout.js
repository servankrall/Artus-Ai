/**
 * POST /api/create-checkout
 * Body: { tier: "pro" | "max", email: string }
 * Env vars: STRIPE_SECRET_KEY, STRIPE_PRO_PRICE_ID, STRIPE_MAX_PRICE_ID
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

  const tier  = body.tier === "max" ? "max" : "pro";
  const email = (body.email || "").trim().toLowerCase();
  const origin = request.headers.get("origin") || "https://artusai.pages.dev";

  const priceId = tier === "max" ? env.STRIPE_MAX_PRICE_ID : env.STRIPE_PRO_PRICE_ID;
  if (!priceId) {
    return new Response(JSON.stringify({ error: "Fiyat ID eksik" }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  const params = new URLSearchParams({
    "mode": "subscription",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    "success_url": `${origin}/?payment_success=1&tier=${tier}&session_id={CHECKOUT_SESSION_ID}`,
    "cancel_url": `${origin}/`,
    "metadata[tier]": tier,
  });
  if (email) params.set("customer_email", email);

  const resp = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + env.STRIPE_SECRET_KEY,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const data = await resp.json();
  if (!resp.ok) {
    return new Response(JSON.stringify({ error: data.error?.message || "Stripe hatası" }), { status: 502, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ url: data.url }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
}
