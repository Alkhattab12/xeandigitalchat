import { adminDb } from "./lib/firebaseAdmin.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  // 1) Verifikasi request ini benar dari Telegram, bukan orang lain yang
  //    menebak URL webhook-nya.
  const secretHeader = req.headers["x-telegram-bot-api-secret-token"];
  if (secretHeader !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return res.status(401).send("Unauthorized");
  }

  try {
    const update = req.body || {};
    const message = update.message;

    // Selalu balas 200 cepat ke Telegram walau tidak ada yang perlu diproses,
    // supaya Telegram tidak retry terus-menerus.
    if (!message) {
      return res.status(200).send("ignored");
    }

    // Hanya proses pesan dari chat admin sendiri.
    const adminChatId = String(process.env.TELEGRAM_CHAT_ID);
    if (String(message.chat?.id) !== adminChatId) {
      return res.status(200).send("ignored (foreign chat)");
    }

    // Harus berupa Reply (fitur reply bawaan Telegram) ke pesan forward tadi.
    const repliedTo = message.reply_to_message;
    if (!repliedTo) {
      return res.status(200).send("ignored (not a reply)");
    }

    const replyText = message.text;
    if (!replyText || !replyText.trim()) {
      return res.status(200).send("ignored (empty reply)");
    }

    // Cari sessionId dari pemetaan yang disimpan saat pesan visitor diteruskan.
    const mapDoc = await adminDb.collection("telegramMap").doc(String(repliedTo.message_id)).get();
    if (!mapDoc.exists) {
      return res.status(200).send("ignored (no session mapping found)");
    }

    const { sessionId } = mapDoc.data();

    await adminDb
      .collection("sessions")
      .doc(sessionId)
      .collection("messages")
      .add({
        sender: "admin",
        text: replyText.trim().slice(0, 2000),
        createdAt: new Date(),
      });

    return res.status(200).send("ok");
  } catch (err) {
    console.error("api/webhook error:", err);
    // Tetap 200 supaya Telegram tidak spam retry; error sudah tercatat di log.
    return res.status(200).send("error logged");
  }
}
