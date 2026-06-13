/**
 * omni.ai — Vercel Edge Function: Groq API proxy
 *
 * Tarayıcıdan gelen istekleri GROQ_API_KEY ekleyerek Groq'a iletir.
 * Key sunucuda kalır, kullanıcı asla görmez.
 *
 * Env variable: Vercel dashboard → Settings → Environment Variables
 *   GROQ_API_KEY = gsk_...
 */
export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const key = process.env.GROQ_API_KEY;
  if (!key) {
    return new Response(
      JSON.stringify({ error: "GROQ_API_KEY environment variable eksik" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const groqResp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return new Response(groqResp.body, {
    status: groqResp.status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": groqResp.headers.get("Content-Type") || "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}
