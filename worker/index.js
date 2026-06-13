/**
 * omni.ai — Cloudflare Worker: Groq API Proxy
 *
 * Bu worker:
 *  1. Tarayıcıdan gelen /chat isteklerini alır
 *  2. GROQ_API_KEY environment variable'ını ekler
 *  3. Groq API'ye iletir, streaming cevabı olduğu gibi döner
 *  4. Key kullanıcıya hiç görünmez
 *
 * Deploy: https://dash.cloudflare.com → Workers → Create → bu kodu yapıştır
 *         Environment Variables → GROQ_API_KEY = gsk_...
 */
export default {
  async fetch(request, env) {
    // CORS — sitenin kendi domain'inden gelen isteklere izin ver
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const groqKey = env.GROQ_API_KEY;
    if (!groqKey) {
      return new Response(
        JSON.stringify({ error: "GROQ_API_KEY environment variable eksik" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    const groqResp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    // Streaming cevabı olduğu gibi ilet
    return new Response(groqResp.body, {
      status: groqResp.status,
      headers: {
        ...corsHeaders,
        "Content-Type": groqResp.headers.get("Content-Type") || "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  },
};
