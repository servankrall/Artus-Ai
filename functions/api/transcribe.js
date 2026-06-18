/**
 * Cloudflare Pages Function: /api/transcribe
 * Ses dosyalarını Groq Whisper API ile metne çevirir.
 * Env var: GROQ_API_KEY
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 200, headers: CORS });
}

export async function onRequestGet() {
  return json({ error: "Method Not Allowed" }, 405);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const key = env.GROQ_API_KEY;
  if (!key) return json({ error: "GROQ_API_KEY eksik" }, 500);

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return json({ error: "Geçersiz form verisi" }, 400);
  }

  const file = formData.get("file");
  if (!file) return json({ error: "Ses dosyası gerekli" }, 400);

  const language = formData.get("language") || "tr";
  const model    = formData.get("model")    || "whisper-large-v3";

  // Groq'a ilet
  const groqForm = new FormData();
  groqForm.append("file", file);
  groqForm.append("model", model);
  groqForm.append("language", language);
  groqForm.append("response_format", "json");

  try {
    const resp = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: "Bearer " + key },
      body: groqForm,
    });

    const data = await resp.json();
    if (!resp.ok) return json({ error: data.error?.message || "Transkript hatası" }, resp.status);
    return json({ text: data.text || "" });
  } catch (e) {
    return json({ error: "Groq bağlantı hatası: " + e.message }, 502);
  }
}
