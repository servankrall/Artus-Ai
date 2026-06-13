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
    const safeHistory = trimHistory(opts.messages || []);

    var order = MODELS.slice();
    if (opts.model && MODELS.includes(opts.model)) {
      order = [opts.model].concat(MODELS.filter(function(m) { return m !== opts.model; }));
    }

    let lastErr = null;
    for (let attempt = 0; attempt < order.length + 2; attempt++) {
      const model = order[attempt % order.length];
      const payload = {
        model: model,
        messages: [{ role: "system", content: sysPrompt }].concat(safeHistory),
        stream: false,
        max_tokens: 4096,
        temperature: temperature,
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
    getKey: function() { return ""; },
    setKey: function() {},
    hasKey: function() { return true; },
    streamChat: streamChat,
  };
})();
