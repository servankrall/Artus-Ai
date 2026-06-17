/**
 * Cloudflare Pages Function: /api/search
 * DuckDuckGo Instant Answer proxy — API anahtarı gerekmez
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function onRequestOptions() {
  return new Response(null, { status: 200, headers: CORS });
}

export async function onRequestGet() {
  return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
    status: 405,
    headers: { ...CORS, "Allow": "POST, OPTIONS", "Content-Type": "application/json" },
  });
}

export async function onRequestPost(context) {
  const { request } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Geçersiz JSON" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const query = (body.query || "").trim().slice(0, 300);
  if (!query) {
    return new Response(JSON.stringify({ error: "query gerekli" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  try {
    const ddgUrl =
      "https://api.duckduckgo.com/?q=" +
      encodeURIComponent(query) +
      "&format=json&no_html=1&skip_disambig=1";

    const resp = await fetch(ddgUrl, {
      headers: { "User-Agent": "OmniAI/1.0" },
    });
    const data = await resp.json();

    const results = [];
    if (data.Answer) results.push({ title: "Hızlı Yanıt", snippet: data.Answer, url: "" });
    if (data.AbstractText) {
      results.push({ title: data.AbstractSource || "Özet", snippet: data.AbstractText, url: data.AbstractURL || "" });
    }
    if (data.Definition) results.push({ title: "Tanım", snippet: data.Definition, url: data.DefinitionURL || "" });
    (data.RelatedTopics || []).slice(0, 5).forEach((t) => {
      if (t.Text && !t.Topics) {
        results.push({ title: t.Text.split(" - ")[0]?.slice(0, 70) || "İlgili", snippet: t.Text.slice(0, 300), url: t.FirstURL || "" });
      }
    });

    return new Response(JSON.stringify({ query, results }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message, results: [] }), {
      status: 502,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
}
