// Chatbot bán bánh mì trên Messenger (acc cá nhân qua cookie) + Gemini
require("dotenv").config();
const fs = require("fs");
const login = require("@dongdev/fca-unofficial");
const { GoogleGenAI } = require("@google/genai");

const SYSTEM_PROMPT = fs.readFileSync(__dirname + "/prompt.txt", "utf8");
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Chuyển cookie (key/value) sang appState
const raw = JSON.parse(fs.readFileSync(__dirname + "/ufc-facebook.json", "utf8"));
const appState = raw.map((c) => ({ ...c, key: c.key || c.name }));

const histories = new Map(); // threadID -> [{role, parts}]
const MAX_TURNS = 30;

async function reply(threadID, text) {
  const h = histories.get(threadID) || [];
  h.push({ role: "user", parts: [{ text }] });
  const res = await ai.models.generateContent({
    model: MODEL,
    contents: h,
    config: { systemInstruction: SYSTEM_PROMPT, temperature: 0.7 },
  });
  const out = (res.text || "Dạ em chưa nghe rõ, anh/chị nhắn lại giúp em nha 😊").replace(/\*\*/g, "");
  h.push({ role: "model", parts: [{ text: out }] });
  histories.set(threadID, h.slice(-MAX_TURNS * 2));
  return out;
}

login({ appState }, (err, api) => {
  if (err) return console.error("Đăng nhập lỗi (cookie hết hạn?):", err);
  api.setOptions({ listenEvents: false, selfListen: false });
  const myID = api.getCurrentUserID();
  console.log("✅ Bot đang chạy với UID", myID);

  api.listenMqtt(async (err, event) => {
    if (err) return console.error("Listen lỗi:", err);
    console.log("📩 Event:", event.type, event.senderID, event.isGroup, JSON.stringify(event.body));
    if (event.type !== "message" || !event.body || event.senderID === myID) return;
    // Tin nhắn riêng thường bị mã hóa đầu cuối (E2EE) nên bot không đọc được -> cho phép test qua nhóm

    const text = event.body.trim();
    if (text === "/reset") {
      histories.delete(event.threadID);
      return api.sendMessage("Dạ em đã làm mới cuộc trò chuyện ạ 🥖", event.threadID);
    }
    try {
      api.sendTypingIndicator?.(event.threadID);
      const out = await reply(event.threadID, text);
      api.sendMessage(out, event.threadID);
    } catch (e) {
      console.error("Gemini lỗi:", e.message);
      api.sendMessage("Dạ hệ thống đang bận xíu, anh/chị đợi em chút nha 🙏", event.threadID);
    }
  });
});
