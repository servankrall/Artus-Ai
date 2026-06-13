/**
 * omni.ai — Netlify Function: Groq API proxy
 * Env variable: Netlify dashboard → Site Settings → Environment Variables
 *   GROQ_API_KEY = gsk_...
 */
exports.handler = async function(event) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const key = process.env.GROQ_API_KEY;
  if (!key) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: "GROQ_API_KEY eksik" }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const groqResp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const respBody = await groqResp.text();

  return {
    statusCode: groqResp.status,
    headers: {
      ...corsHeaders,
      "Content-Type": groqResp.headers.get("Content-Type") || "application/json",
    },
    body: respBody,
  };
};
