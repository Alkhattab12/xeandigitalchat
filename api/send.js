import { adminDb } from "./lib/firebaseAdmin.js";
import { sendTelegramMessage, escapeHtml } from "./lib/telegram.js";

const MAX_TEXT_LEN = 2000;
const MAX_NAME_LEN = 40;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { sessionId, name, text } = req.body || {};

    if (!sessionId || typeof sessionId !== "string") {
      return res.status(400).json({ error: "sessionId tidak valid" });
    }
    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "Pesan kosong" });
    }
    if (text.length > MAX_TEXT_LEN) {
      return res.status(400).json({ error: `Pesan terlalu panjang (maks ${MAX_TEXT_LEN} karakter)` });
    }

    const safeName = (name || "Anonim").toString().slice(0, MAX_NAME_LEN);

    const telegramText =
      `👤 <b>${escapeHtml(safeName)}</b>\n` +
      `${escapeHtml(text)}\n\n` +
      `<code>id: ${escapeHtml(sessionId.slice(0, 12))}</code>`;

    const result = await sendTelegramMessage(telegramText);

    // Simpan pemetaan message_id Telegram -> sessionId, dipakai webhook.js
    // saat admin me-reply pesan ini, supaya tahu balasan itu untuk sesi mana.
    await adminDb.collection("telegramMap").doc(String(result.message_id)).set({
      sessionId,
      createdAt: new Date(),
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("api/send error:", err);
    // Detail error hanya di server log, client cukup tahu ada masalah
    return res.status(500).json({ error: "Gagal mengirim pesan ke admin" });
  }
}
