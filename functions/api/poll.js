/**
 * Canlı anket / oylama sistemi.
 *
 * GET  /api/poll                          → { poll }  (aktif anket + oy sayıları)
 * POST /api/poll  (oy ver — herkes):      { action:"vote", id, option, voter }
 * POST /api/poll  (oluştur — creator):    { action:"create", secret, question, options:[...] }
 * POST /api/poll  (kapat — creator):      { action:"close", secret }
 * POST /api/poll  (sil — creator):        { action:"clear", secret }
 *
 * KV: SITE_CONFIG, key "active_poll"
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const POLL_KEY = "active_poll";
const HISTORY_KEY = "poll_history";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 200, headers: CORS });
}

export async function onRequestGet(context) {
  const { env } = context;
  const raw = await env.SITE_CONFIG.get(POLL_KEY);
  const poll = raw ? JSON.parse(raw) : null;
  return json({ poll });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch {
    return json({ error: "Geçersiz JSON" }, 400);
  }

  const raw = await env.SITE_CONFIG.get(POLL_KEY);
  let poll = raw ? JSON.parse(raw) : null;

  // ── Oy ver (herkese açık) ───────────────────────────────
  if (body.action === "vote") {
    if (!poll || !poll.open) return json({ error: "Aktif anket yok" }, 400);
    if (poll.id !== body.id) return json({ error: "Anket güncellendi, sayfayı yenileyin" }, 409);
    const opt = parseInt(body.option);
    if (isNaN(opt) || opt < 0 || opt >= poll.options.length) return json({ error: "Geçersiz seçenek" }, 400);
    const voter = (body.voter || "").toString().slice(0, 64);
    if (!voter) return json({ error: "voter gerekli" }, 400);
    poll.voters = poll.voters || {};
    if (poll.voters[voter] !== undefined) {
      return json({ ok: true, already: true, poll: publicView(poll) });
    }
    poll.voters[voter] = opt;
    poll.votes[opt] = (poll.votes[opt] || 0) + 1;
    await env.SITE_CONFIG.put(POLL_KEY, JSON.stringify(poll));
    return json({ ok: true, poll: publicView(poll) });
  }

  // ── Aşağıdakiler creator gerektirir ─────────────────────
  if (!body.secret || body.secret !== env.CREATOR_SECRET) {
    return json({ error: "Yetkisiz" }, 403);
  }

  if (body.action === "history") {
    const hraw = await env.SITE_CONFIG.get(HISTORY_KEY);
    return json({ history: hraw ? JSON.parse(hraw) : [] });
  }

  if (body.action === "create") {
    const question = (body.question || "").toString().slice(0, 200);
    const options = Array.isArray(body.options)
      ? body.options.map((o) => o.toString().slice(0, 80)).filter(Boolean).slice(0, 6)
      : [];
    if (!question || options.length < 2) return json({ error: "Soru ve en az 2 seçenek gerekli" }, 400);
    // Önceki anketi geçmişe arşivle
    if (poll) await archive(env, poll);
    poll = {
      id: "p" + Date.now(),
      question,
      options,
      votes: options.map(() => 0),
      voters: {},
      open: true,
      createdAt: Date.now(),
    };
    await env.SITE_CONFIG.put(POLL_KEY, JSON.stringify(poll));
    return json({ ok: true, poll });
  }

  if (body.action === "close") {
    if (!poll) return json({ error: "Anket yok" }, 400);
    poll.open = false;
    await env.SITE_CONFIG.put(POLL_KEY, JSON.stringify(poll));
    return json({ ok: true, poll });
  }

  if (body.action === "clear") {
    if (poll) await archive(env, poll);
    await env.SITE_CONFIG.delete(POLL_KEY);
    return json({ ok: true, cleared: true });
  }

  return json({ error: "Bilinmeyen işlem" }, 400);
}

// Anketi geçmişe ekle (son 20 tutulur, sadece sayılar)
async function archive(env, poll) {
  try {
    const hraw = await env.SITE_CONFIG.get(HISTORY_KEY);
    const history = hraw ? JSON.parse(hraw) : [];
    history.unshift({
      question: poll.question,
      options: poll.options,
      votes: poll.votes,
      total: (poll.votes || []).reduce((a, b) => a + b, 0),
      closedAt: Date.now(),
    });
    await env.SITE_CONFIG.put(HISTORY_KEY, JSON.stringify(history.slice(0, 20)));
  } catch (e) {}
}

// Oy verenlerin kimliğini dışarı sızdırma — sadece sayıları döndür
function publicView(poll) {
  return {
    id: poll.id,
    question: poll.question,
    options: poll.options,
    votes: poll.votes,
    open: poll.open,
    total: (poll.votes || []).reduce((a, b) => a + b, 0),
  };
}
