# Artus AI — OMNI AGENT

Canlı site: **https://artus-ai.pages.dev**

Artus AI, **Cloudflare Pages** üzerinde çalışan bir sohbet/yapay zeka uygulamasıdır.
Statik bir arayüz (`frontend/`) + sunucusuz fonksiyonlar (`functions/api/`) ile çalışır.
Yapay zeka yanıtları **Groq API** üzerinden gelir (anahtar sunucu tarafında saklanır, istemciye sızmaz).

## Mimari

```
├── frontend/
│   ├── index.html          # Ana uygulama (sohbet arayüzü + admin panel)
│   ├── login.html          # Giriş
│   └── omni-config.js      # Model listesi + /api/chat istemcisi (SYSTEM_PROMPT v2)
├── functions/api/          # Cloudflare Pages Functions (sunucusuz backend)
│   ├── chat.js             # Groq proxy + prompt-injection koruması
│   ├── global-modes.js     # Global modlar/komutlar (creator)  [KV: SITE_CONFIG]
│   ├── poll.js             # Canlı anket / oylama             [KV: SITE_CONFIG]
│   ├── presence.js         # Çevrimiçi kullanıcı sayacı        [KV: SITE_CONFIG]
│   ├── reactions.js        # Canlı tepkiler                    [KV: SITE_CONFIG]
│   ├── wall.js             # Canlı duvar                       [KV: SITE_CONFIG]
│   ├── bans.js             # Ban yönetimi                      [KV: SITE_CONFIG]
│   ├── pro-status.js       # Pro/Max aktivasyon                [KV: PRO_USERS]
│   ├── create-checkout.js  # Stripe ödeme başlatma
│   ├── verify-payment.js   # Stripe ödeme doğrulama
│   ├── search.js           # Web arama
│   ├── url-fetch.js        # URL özetleme
│   └── transcribe.js       # Ses → metin
└── prompts/                # Sistem promptu notları
```

## Dağıtım (Cloudflare Pages)

1. Bu repoyu Cloudflare Pages'e bağla.
2. **Build ayarları:** Build command boş, **Output directory: `frontend`** (Functions otomatik `functions/` klasöründen alınır).
3. **Environment variables** (Settings → Environment variables):
   - `GROQ_API_KEY` — Groq API anahtarı (zorunlu)
   - `CREATOR_SECRET` — Admin/creator işlemleri için gizli anahtar
   - (Opsiyonel) Stripe için: `STRIPE_SECRET_KEY` vb.
4. **KV Namespace bağlamaları** (Settings → Functions → KV namespace bindings):
   - `SITE_CONFIG` — global modlar, anket, çevrimiçi, tepkiler, duvar, banlar
   - `PRO_USERS` — Pro/Max kullanıcı ve aktivasyon kodları

> ⚠️ API anahtarları **asla** repoya/koda yazılmaz; yalnızca Cloudflare environment variables içinde tutulur.

## Yerel Geliştirme (opsiyonel)

İsteğe bağlı olarak `app.py` (FastAPI) ile yerel bir sunucu çalıştırılabilir — bu yalnızca
geliştirme/test içindir, **canlı site Cloudflare Pages'tir**.

- **Windows:** `start.bat`
- **Linux/Mac:** `./start.sh`

Yerel sunucu `http://localhost:8000` adresinde açılır. (Yerel modda yapay zeka için
`GROQ_API_KEY` ortam değişkeni gerekir.)

## Sistem Promptu

Aktif sistem promptu `frontend/omni-config.js` içindeki `SYSTEM_PROMPT` (OMNI AGENT v2) sabitindedir.
`prompts/` klasörü tarihsel/dokümantasyon amaçlıdır.
