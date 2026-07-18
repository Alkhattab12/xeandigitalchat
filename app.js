import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// --- Init ---
const firebaseApp = initializeApp(window.__FIREBASE_CONFIG__);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

// --- DOM refs ---
const gate = document.getElementById("gate");
const nameInput = document.getElementById("nameInput");
const hpField = document.getElementById("hp");
const startBtn = document.getElementById("startBtn");
const gateError = document.getElementById("gateError");

const chatScreen = document.getElementById("chatScreen");
const messagesEl = document.getElementById("messages");
const composer = document.getElementById("composer");
const textInput = document.getElementById("textInput");
const sendBtn = document.getElementById("sendBtn");
const statusText = document.getElementById("statusText");

const LS_NAME_KEY = "lc_visitor_name";

let sessionId = null; // == firebase auth uid
let visitorName = "";
let unsubscribeMessages = null;

// --- Auth bootstrap: anonymous sign-in gives us a stable uid we use as sessionId ---
onAuthStateChanged(auth, (user) => {
  if (user) {
    sessionId = user.uid;
    const savedName = localStorage.getItem(LS_NAME_KEY);
    if (savedName !== null) {
      // returning visitor in this browser — skip the gate
      visitorName = savedName;
      enterChat();
    }
  }
});

signInAnonymously(auth).catch((err) => {
  console.error("Auth error:", err);
  gateError.textContent = "Gagal memulai sesi. Coba muat ulang halaman.";
});

// --- Gate submit ---
startBtn.addEventListener("click", async () => {
  if (hpField.value.trim() !== "") return; // honeypot triggered, silently ignore
  if (!sessionId) {
    gateError.textContent = "Sesi belum siap, tunggu sebentar lalu coba lagi.";
    return;
  }
  const name = nameInput.value.trim().slice(0, 40) || "Anonim";
  visitorName = name;
  localStorage.setItem(LS_NAME_KEY, name);

  startBtn.disabled = true;
  try {
    await setDoc(doc(db, "sessions", sessionId), {
      name,
      createdAt: serverTimestamp(),
      lastMessageAt: serverTimestamp(),
    });
    enterChat();
  } catch (err) {
    console.error("Gagal membuat sesi:", err);
    gateError.textContent = "Gagal memulai chat. Coba lagi.";
    startBtn.disabled = false;
  }
});

// --- Enter chat screen + attach realtime listener ---
function enterChat() {
  gate.classList.add("hidden");
  chatScreen.classList.remove("hidden");
  textInput.focus();

  if (unsubscribeMessages) return; // already listening

  const q = query(
    collection(db, "sessions", sessionId, "messages"),
    orderBy("createdAt", "asc")
  );

  unsubscribeMessages = onSnapshot(
    q,
    (snapshot) => {
      messagesEl.innerHTML = "";
      snapshot.forEach((docSnap) => {
        renderMessage(docSnap.data());
      });
      scrollToBottom();
    },
    (err) => {
      console.error("Listener error:", err);
      statusText.textContent = "koneksi terputus";
    }
  );
}

// --- Render a single message bubble ---
function renderMessage(msg) {
  const bubble = document.createElement("div");
  bubble.className = "bubble " + (msg.sender === "admin" ? "admin" : "visitor");

  const textNode = document.createElement("span");
  textNode.textContent = msg.text || ""; // textContent, never innerHTML → XSS-safe
  bubble.appendChild(textNode);

  const time = document.createElement("span");
  time.className = "time";
  time.textContent = formatTime(msg.createdAt);
  bubble.appendChild(time);

  messagesEl.appendChild(bubble);
}

function formatTime(ts) {
  if (!ts || typeof ts.toDate !== "function") return "";
  const d = ts.toDate();
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// --- Auto-grow textarea ---
textInput.addEventListener("input", () => {
  textInput.style.height = "auto";
  textInput.style.height = Math.min(textInput.scrollHeight, 120) + "px";
});

// --- Send message ---
composer.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = textInput.value.trim();
  if (!text || !sessionId) return;

  sendBtn.disabled = true;
  textInput.value = "";
  textInput.style.height = "auto";

  try {
    // 1) Write straight to Firestore so it appears instantly for the visitor
    await addDoc(collection(db, "sessions", sessionId, "messages"), {
      sender: "visitor",
      text,
      createdAt: serverTimestamp(),
    });
    await setDoc(
      doc(db, "sessions", sessionId),
      { name: visitorName, lastMessageAt: serverTimestamp() },
      { merge: true }
    );

    // 2) Ask the server to relay it to Telegram
    const res = await fetch("/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, name: visitorName, text }),
    });
    if (!res.ok) {
      console.error("Relay ke Telegram gagal:", await res.text());
      statusText.textContent = "pesan tersimpan, tapi gagal terkirim ke admin";
    } else {
      statusText.textContent = "online";
    }
  } catch (err) {
    console.error("Gagal mengirim pesan:", err);
    statusText.textContent = "gagal mengirim, coba lagi";
  } finally {
    sendBtn.disabled = false;
    textInput.focus();
  }
});

// Enter = kirim, Shift+Enter = baris baru
textInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    composer.requestSubmit();
  }
});
