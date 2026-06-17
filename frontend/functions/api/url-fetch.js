/**
 * Cloudflare Pages Function: /api/url-fetch
 * Fetches a URL and returns cleaned plain text for AI summarization.
 * Max 15000 chars returned to keep token usage reasonable.
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

function stripHtml(html) {
  // Remove scripts, styles, nav, footer, header, aside
  html = html.replace(/<(script|style|nav|footer|header|aside|noscript)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  // Remove all remaining tags
  html = html.replace(/<[^>]+>/g, ' ');
  // Decode common HTML entities
  html = html
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–');
  // Collapse whitespace
  html = html.replace(/\s{2,}/g, ' ').trim();
  return html;
}

export async function onRequestOptions() {
  return new Response(null, { status: 200, headers: CORS });
}

export async function onRequestGet() {
  return json({ error: "Method Not Allowed" }, 405);
}

export async function onRequestPost(context) {
  const { request } = context;

  let body;
  try { body = await request.json(); } catch { return json({ error: "Geçersiz JSON" }, 400); }

  const rawUrl = (body.url || "").trim();
  if (!rawUrl) return json({ error: "url gerekli" }, 400);

  // Basic URL validation
  let url;
  try {
    url = new URL(rawUrl.startsWith('http') ? rawUrl : 'https://' + rawUrl);
  } catch {
    return json({ error: "Geçersiz URL" }, 400);
  }

  // Block local/private addresses
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.startsWith('127.') || host.startsWith('192.168.') || host.startsWith('10.') || host === '0.0.0.0') {
    return json({ error: "Bu adrese erişim izni yok" }, 403);
  }

  try {
    const resp = await fetch(url.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ArtusAI/1.0; +https://artusai.pages.dev)",
        "Accept": "text/html,application/xhtml+xml,text/plain",
        "Accept-Language": "tr,en;q=0.9",
      },
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
    });

    if (!resp.ok) {
      return json({ error: `Sayfa alınamadı: HTTP ${resp.status}` }, 502);
    }

    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain") && !contentType.includes("application/xhtml")) {
      return json({ error: "Bu URL HTML/metin içermiyor" }, 415);
    }

    const raw = await resp.text();
    const text = stripHtml(raw).slice(0, 15000);
    const title = (raw.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || url.hostname;

    return json({ url: url.toString(), title: title.trim(), text });
  } catch (e) {
    return json({ error: "Bağlantı hatası: " + e.message }, 502);
  }
}
