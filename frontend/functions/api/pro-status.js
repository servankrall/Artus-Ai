/**
 * Cloudflare Pages Function: /api/pro-status
 *
 * KV namespace: PRO_USERS  (Settings → Functions → KV namespace bindings)
 *
 * KV key schema:
 *   user:<email>         → { pro: true, activatedAt: ms }
 *   code:<CODE>          → { used: false }   (unused)
 *                        → { used: true, usedBy: email, usedAt: ms }  (burned)
 *
 * Kodu Cloudflare KV Dashboard'dan ekle:
 *   Key: code:YENI-KOD-BURAYA   Value: {"used":false}
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
  const kv = env.PRO_USERS;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Geçersiz JSON" }, 400);
  }

  const email = (body.email || "").trim().toLowerCase();
  if (!email) return json({ error: "email gerekli" }, 400);

  if (!kv) {
    return json({ pro: false, note: "KV bağlı değil" });
  }

  // ── Kod ile aktivasyon ──────────────────────────────────────
  if (body.code) {
    const rawCode = (body.code || "").trim().toUpperCase();
    if (!rawCode) return json({ error: "Geçersiz kod" }, 400);

    const codeKey = "code:" + rawCode;
    const codeRaw = await kv.get(codeKey);

    if (!codeRaw) {
      return json({ error: "Geçersiz aktivasyon kodu" }, 400);
    }

    let codeData;
    try { codeData = JSON.parse(codeRaw); } catch { codeData = {}; }

    if (codeData.used) {
      return json({ error: "Bu kod daha önce kullanılmış" }, 409);
    }

    // Kodu yak (tek kullanım)
    await kv.put(codeKey, JSON.stringify({ used: true, usedBy: email, usedAt: Date.now() }));

    // Kullanıcıyı Pro yap
    await kv.put("user:" + email, JSON.stringify({ pro: true, activatedAt: Date.now() }));

    return json({ pro: true });
  }

  // ── Pro durumu sorgula ──────────────────────────────────────
  let raw = await kv.get("user:" + email);
  // Geriye dönük uyumluluk: eski format key'i prefix'siz saklıyordu
  if (!raw) raw = await kv.get(email);
  const pro = raw ? !!JSON.parse(raw).pro : false;
  return json({ pro });
}
