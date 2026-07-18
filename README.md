# Live Chat 2-Arah (Web ↔ Telegram)

Pengunjung chat di web → pesan masuk ke Telegram pribadimu → kamu **reply** pesan itu di Telegram → balasan muncul real-time di layar web pengunjung. Semua sesi terpisah, pengunjung tidak bisa saling lihat.

## Arsitektur singkat

- **Firestore** = jembatan real-time. Setiap pengunjung dapat `sessions/{sessionId}` (sessionId = uid dari Firebase Anonymous Auth), dengan subkoleksi `messages`.
- **api/send.js** = saat pengunjung kirim pesan, function ini meneruskan ke Telegram lewat Bot API, lalu menyimpan pemetaan `telegramMessageId → sessionId` di koleksi `telegramMap`.
- **api/webhook.js** = endpoint yang didaftarkan ke Telegram sebagai webhook. Saat kamu **reply** (fitur reply bawaan Telegram, bukan chat baru) ke pesan pengunjung, Telegram mengirim update ke sini, function mencari `sessionId` dari `telegramMap`, lalu menulis balasanmu ke `sessions/{sessionId}/messages`. Firestore listener di browser pengunjung otomatis menampilkannya.

## 1. Buat Bot Telegram

1. Chat **@BotFather** di Telegram → `/newbot` → ikuti instruksi → catat **token** (format `123456:AA...`).
2. Chat bot barumu sekali (misal ketik `/start`) supaya chat-nya "aktif".
3. Untuk dapat **Chat ID**-mu: chat **@userinfobot** atau buka `https://api.telegram.org/bot<TOKEN>/getUpdates` setelah kirim pesan ke bot, lihat field `"chat":{"id": ...}`.

## 2. Buat Project Firebase

1. Ke [console.firebase.google.com](https://console.firebase.google.com) → **Add project**.
2. **Build → Firestore Database → Create database** (mode production).
3. **Build → Authentication → Sign-in method → Anonymous → Enable**.
4. **Project settings → General → Your apps → Add app → Web (</>)** → salin config yang muncul (`apiKey`, `authDomain`, dst) → tempel ke file `firebase-config.js` (copy dari `firebase-config.example.js`).
5. **Project settings → Service accounts → Generate new private key** → download file JSON. Dari file ini kamu ambil `project_id`, `client_email`, `private_key` untuk env var server (langkah 4 di bawah).
6. **Firestore → Rules** → tempel isi `firestore.rules` dari project ini → **Publish**.

## 3. Push ke GitHub, lalu Deploy ke Vercel

1. Push semua file (kecuali yang di `.gitignore`) ke repo GitHub.
2. Di Vercel: **Add New → Project** → import repo tersebut.
3. Di layar **Configure Project**, buka **Environment Variables**, isi semua dari `.env.example`:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
   - `TELEGRAM_WEBHOOK_SECRET` (bikin string acak sendiri, minimal 20 karakter)
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY` (paste apa adanya dari JSON service account, termasuk `\n`)
4. **Deploy**.
5. Setelah live, buat `firebase-config.js` di root project (copy dari `firebase-config.example.js`, isi dengan config Firebase Web-mu), commit & push — Vercel auto-redeploy.

## 4. Daftarkan Webhook Telegram

Setelah domain Vercel-mu aktif (misal `https://xeanchat.vercel.app`), jalankan sekali lewat browser atau curl:

```
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://xeanchat.vercel.app/api/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>
```

Ganti `<TELEGRAM_BOT_TOKEN>` dan `<TELEGRAM_WEBHOOK_SECRET>` dengan nilai yang sama seperti di env var Vercel. Respons `{"ok":true,...}` berarti berhasil.

Cek status webhook kapan saja lewat:
```
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo
```

## 5. Testing

1. Buka web-mu, isi nama (atau kosongkan), kirim pesan.
2. Cek Telegram — pesan pengunjung harus masuk dengan format `👤 Nama` + isi pesan + `id: ...`.
3. Di Telegram, **swipe/tap pesan itu → Reply** → ketik balasan → kirim.
4. Balasan harus muncul di layar web pengunjung dalam beberapa detik (real-time via Firestore, bukan polling).

⚠️ Kalau kamu kirim pesan biasa di Telegram (bukan Reply ke pesan tertentu), balasan **tidak** akan terkirim ke manapun — ini sengaja, supaya balasan selalu tepat sasaran ke sesi yang benar.

## Edge case yang sudah ditangani

- Method selain POST di kedua API → 405
- Pesan kosong / >2000 karakter → ditolak dengan pesan jelas ke client
- Env var server belum lengkap → 500 generik ke client, detail cuma di server log (kredensial tak pernah bocor)
- Webhook tanpa header secret yang cocok → 401 (menolak request selain dari Telegram)
- Reply di Telegram yang bukan reply ke pesan sesi manapun (atau reply ke pesan lama yang mapping-nya sudah tidak ada) → diabaikan dengan aman, tidak error
- Reply dari chat Telegram lain (bukan chat admin) → diabaikan
- Nama & teks divalidasi & dibatasi panjangnya
- Rendering pesan pakai `textContent`, bukan `innerHTML` → aman dari self-XSS
- Firestore Security Rules memastikan satu pengunjung tidak bisa baca/tulis sesi pengunjung lain, dan tidak bisa memalsukan pesan sebagai "admin"
- Honeypot field tersembunyi di form nama → spam bot sederhana ditolak diam-diam

## Pengembangan lanjutan (opsional)

- Rate-limit per sessionId di `api/send.js` kalau mau cegah spam lebih ketat
- Simpan status "sudah dibaca admin" di Firestore untuk fitur read receipt
- Tambah typing indicator dua arah
