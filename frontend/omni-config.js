/* ════════════════════════════════════════════════════════════
   omni.ai — AI motoru (Netlify Function proxy üzerinden Groq)
════════════════════════════════════════════════════════════ */
(function () {
  const PROXY_URL = "/api/chat";

  const SYSTEM_PROMPT = `# OMNI AGENT v1

Sen dünyanın en yetenekli dijital operatörüsün. Adın Omni.Ai.

## Uzmanlık Alanların
Yazılım geliştirme, web geliştirme, yapay zeka, siber güvenlik, veri analizi, oyun geliştirme, mobil uygulama, DevOps, UI/UX, iş geliştirme, pazarlama, eğitim, araştırma.

## Genel Kurallar
1. Kullanıcının amacını anlamadan çözüm üretme.
2. Gerektiğinde açıklayıcı sorular sor.
3. Varsayım yaparken belirt.
4. Her zaman en verimli çözümü öner.
5. Birden fazla çözüm varsa karşılaştır.
6. Teknik konularda uzman seviyesinde cevap ver.
7. Kod yazarken üretim kalitesinde kod üret.
8. Büyük projeleri modüllere ayır.
9. Hata bulduğunda nedenini açıkla.
10. Gereksiz uzun cevap verme.

## Çalışma Şekli
Amaç Analizi → Gereksinimler → Plan → Uygulama → Doğrulama → Sonuç.

## Yazılım Kuralları
SOLID, DRY, KISS, Clean Architecture, TDD, Modüler Tasarım.

## Hedef
Kullanıcının istediği sonucu en kısa sürede, en yüksek doğrulukla üret.`;

  const MODELS = [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "gemma2-9b-it",
    "llama3-8b-8192",
  ];

  // Görsel anlayan (vision) modeller — görsel ekliyse bunlar kullanılır
  const VISION_MODELS = [
    "meta-llama/llama-4-scout-17b-16e-instruct",
    "meta-llama/llama-4-maverick-17b-128e-instruct",
  ];

  function trimHistory(history, maxChars) {
    maxChars = maxChars || 10000;
    let trimmed = history.slice();
    while (trimmed.length) {
      const total = trimmed.reduce(function(s, m) { return s + (m.content || "").length; }, 0);
      if (total <= maxChars) break;
      trimmed = trimmed.slice(2);
    }
    trimmed = trimmed.filter(function(m) { return (m.content || "").trim(); });
    while (trimmed.length && trimmed[0].role !== "user") trimmed = trimmed.slice(1);
    return trimmed.length ? trimmed : history.slice(-1);
  }

  async function streamChat(opts) {
    const sysPrompt = (opts.systemPrompt && opts.systemPrompt.trim()) || SYSTEM_PROMPT;
    const temperature = typeof opts.temperature === "number" ? opts.temperature : 0.7;
    const onText = opts.onText || function() {};
    let safeHistory = trimHistory(opts.messages || []);

    // ── Görsel (vision) desteği ──
    const images = opts.images || [];
    const hasImages = images.length > 0;
    if (hasImages && safeHistory.length) {
      // Son kullanıcı mesajını multimodal içeriğe çevir (metin + görseller)
      const last = safeHistory[safeHistory.length - 1];
      if (last && last.role === "user" && typeof last.content === "string") {
        const content = [{ type: "text", text: last.content }];
        images.forEach(function(url) {
          content.push({ type: "image_url", image_url: { url: url } });
        });
        safeHistory = safeHistory.slice(0, -1).concat([{ role: "user", content: content }]);
      }
    }

    var order;
    if (hasImages) {
      order = VISION_MODELS.slice();
    } else {
      order = MODELS.slice();
      if (opts.model && MODELS.includes(opts.model)) {
        order = [opts.model].concat(MODELS.filter(function(m) { return m !== opts.model; }));
      }
    }

    let lastErr = null;
    for (let attempt = 0; attempt < order.length + 2; attempt++) {
      const model = order[attempt % order.length];
      const payload = {
        model: model,
        messages: [{ role: "system", content: sysPrompt }].concat(safeHistory),
        stream: false,
        max_tokens: typeof opts.maxTokens === "number" ? opts.maxTokens : 4096,
        temperature: temperature,
        top_p: typeof opts.topP === "number" ? opts.topP : 1,
      };

      try {
        const resp = await fetch(PROXY_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: opts.signal,
        });

        if (resp.status === 429) {
          await new Promise(function(r) { setTimeout(r, 1500); });
          continue;
        }
        if (!resp.ok) {
          lastErr = new Error("HTTP " + resp.status);
          await new Promise(function(r) { setTimeout(r, 800); });
          continue;
        }

        const data = await resp.json();
        const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
        if (text) onText(text);
        return;

      } catch(e) {
        if (e.name === "AbortError") throw e;
        lastErr = e;
        await new Promise(function(r) { setTimeout(r, 800); });
      }
    }
    throw lastErr || new Error("Groq cevap vermedi");
  }

  window.OmniAI = {
    SYSTEM_PROMPT: SYSTEM_PROMPT,
    MODELS: MODELS,
    VISION_MODELS: VISION_MODELS,
    getKey: function() { return ""; },
    setKey: function() {},
    hasKey: function() { return true; },
    streamChat: streamChat,
  };
})();
