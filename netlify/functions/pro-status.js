/**
 * omni.ai — Netlify Function: Pro durumu (e-posta bazlı, cihazlar arası senkron)
 * Netlify Blobs kullanır — ekstra veritabanı kurulumu gerekmez.
 *
 * POST { email, activate: true }  -> Pro'yu bu e-posta için aktif eder
 * POST { email }                  -> O e-postanın Pro durumunu döner
 */
const { getStore } = require("@netlify/blobs");

exports.handler = async function (event) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders, body: "Method Not Allowed" };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Geçersiz JSON" }) };
  }

  const email = (body.email || "").trim().toLowerCase();
  if (!email) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "email gerekli" }) };
  }

  const store = getStore("pro-users");

  if (body.activate) {
    await store.set(email, JSON.stringify({ pro: true, activatedAt: Date.now() }));
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ pro: true }) };
  }

  const raw = await store.get(email);
  const pro = raw ? !!JSON.parse(raw).pro : false;
  return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ pro }) };
};
