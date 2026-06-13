/* ════════════════════════════════════════════════════════════
   omni.ai — İstemci taraflı AI motoru (statik / backend'siz)
   Groq API'ye doğrudan tarayıcıdan bağlanır.
   API anahtarı tarayıcıda (localStorage) saklanır, kodda değildir.
════════════════════════════════════════════════════════════ */
(function () {
  const SYSTEM_PROMPT = `# OMNI AGENT v1

Sen dünyanın en yetenekli dijital operatörüsün.

## Uzmanlık Alanların
Yazılım geliştirme, web geliştirme, yapay zeka sistemleri, siber güvenlik, veri analizi, oyun geliştirme, mobil uygulama, DevOps, UI/UX, iş geliştirme, pazarlama, eğitim, araştırma.

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
Amaç Analizi → Gereksinimler → Riskler → Plan → Uygulama → Doğrulama → Sonuç.

## Yazılım Kuralları
SOLID, DRY, KISS, Clean Architecture, TDD, Modüler Tasarım.

## Hata Ayıklama
Hatanın sebebi → muhtemel sebepler → çözüm adımları → kalıcı çözüm → önleme.

## Hedef
Kullanıcının istediği sonucu en kısa sürede, en yüksek doğrulukla ve profesyonel seviyede üret.`;

  const MODELS = [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "gemma2-9b-it",
    "llama3-8b-8192",
  ];

  const KEY_STORAGE = "omni_groq_key";

  function getKey() {
    return (localStorage.getItem(KEY_STORAGE) || "").trim();
  }
  function setKey(k) {
    localStorage.setItem(KEY_STORAGE, (k || "").trim());
  }
  function hasKey() {
    return getKey().startsWith("gsk_");
  }

  // Sohbet geçmişini karakter sınırına göre kırp; her zaman 'user' ile başlasın
  function trimHistory(history, maxChars) {
    maxChars = maxChars || 12000;
    let trimmed = history.slice();
    while (trimmed.length) {
      const total = trimmed.reduce((s, m) => s + (m.content || "").length, 0);
      if (total <= maxChars) break;
      trimmed = trimmed.slice(2);
    }
    trimmed = trimmed.filter((m) => (m.content || "").trim());
    while (trimmed.length && trimmed[0].role !== "user") trimmed = trimmed.slice(1);
    return trimmed.length ? trimmed : history.slice(-1);
  }

  /* Groq'a doğrudan akışlı (streaming) istek.
     opts: { messages, model, systemPrompt, temperature, onText, signal } */
  async function streamChat(opts) {
    const key = getKey();
    if (!key) {
      throw new Error("NO_KEY");
    }

    const sysPrompt = (opts.systemPrompt && opts.systemPrompt.trim()) || SYSTEM_PROMPT;
    const temperature = typeof opts.temperature === "number" ? opts.temperature : 0.7;
    const onText = opts.onText || function () {};
    const safeHistory = trimHistory(opts.messages || []);

    // Tercih edilen modeli başa al, sonra diğerlerine düş
    let order = MODELS.slice();
    if (opts.model && MODELS.includes(opts.model)) {
      order = [opts.model].concat(MODELS.filter((m) => m !== opts.model));
    }

    let lastErr = null;
    // Her modeli sırayla dene; 429'da sıradakine geç
    for (let attempt = 0; attempt < order.length + 2; attempt++) {
      const model = order[attempt % order.length];
      const payload = {
        model: model,
        messages: [{ role: "system", content: sysPrompt }].concat(safeHistory),
        stream: true,
        max_tokens: 4096,
        temperature: temperature,
      };

      try {
        const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + key,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: opts.signal,
        });

        if (resp.status === 401) throw new Error("BAD_KEY");
        if (resp.status === 429) {
          await new Promise((r) => setTimeout(r, 1200));
          continue; // sıradaki modeli dene
        }
        if (!resp.ok) {
          lastErr = new Error("HTTP " + resp.status);
          continue;
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop();
          for (const line of lines) {
            const t = line.trim();
            if (!t.startsWith("data:")) continue;
            const data = t.slice(5).trim();
            if (data === "[DONE]") return;
            try {
              const delta = JSON.parse(data).choices[0].delta.content || "";
              if (delta) onText(delta);
            } catch (_) {}
          }
        }
        return; // başarıyla bitti
      } catch (e) {
        if (e.message === "BAD_KEY" || e.name === "AbortError") throw e;
        lastErr = e;
        await new Promise((r) => setTimeout(r, 800));
      }
    }
    throw lastErr || new Error("Groq cevap vermedi");
  }

  window.OmniAI = {
    SYSTEM_PROMPT,
    MODELS,
    getKey,
    setKey,
    hasKey,
    streamChat,
  };
})();
