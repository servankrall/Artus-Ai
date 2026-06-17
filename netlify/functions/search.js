/**
 * omni.ai — Netlify Function: Web araması proxy (DuckDuckGo Instant Answer API)
 * API anahtarı gerekmez — ücretsiz, herkese açık.
 */
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

  const query = (body.query || "").trim().slice(0, 300);
  if (!query) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "query gerekli" }) };
  }

  try {
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const resp = await fetch(ddgUrl, {
      headers: { "User-Agent": "OmniAI/1.0 (web search, contact: support@omni.ai)" },
    });
    if (!resp.ok) throw new Error("DDG HTTP " + resp.status);
    const data = await resp.json();

    const results = [];

    if (data.Answer) {
      results.push({ title: "Hızlı Yanıt", snippet: data.Answer, url: "" });
    }
    if (data.AbstractText) {
      results.push({
        title: data.AbstractSource || "Özet",
        snippet: data.AbstractText,
        url: data.AbstractURL || "",
      });
    }
    if (data.Definition) {
      results.push({ title: "Tanım", snippet: data.Definition, url: data.DefinitionURL || "" });
    }
    (data.RelatedTopics || []).slice(0, 5).forEach((t) => {
      if (t.Text && !t.Topics) {
        results.push({
          title: (t.Text.split(" - ")[0] || "İlgili").slice(0, 70),
          snippet: t.Text.slice(0, 300),
          url: t.FirstURL || "",
        });
      }
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ query, results }),
    };
  } catch (e) {
    return {
      statusCode: 502,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Arama başarısız: " + e.message, results: [] }),
    };
  }
};
