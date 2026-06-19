/**
 * CrossPost Desktop — WhatsApp Sidecar
 * Evolution API-compatible REST interface via @whiskeysockets/baileys
 *
 * Endpoints:
 *   GET  /health              → { status: "ok" }
 *   POST /instance/init       → start WhatsApp connection, returns QR
 *   GET  /instance/qr         → { qr: "<base64 png>" } or { connected: true }
 *   GET  /instance/status     → { state: "qr"|"connected"|"disconnected" }
 *   POST /instance/logout     → disconnect & clear session
 *   POST /message/send        → { to, text } → send text message
 *   GET  /message/list        → { messages: [...] }
 */

import express from "express";
import { makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import QRCode from "qrcode";
import path from "path";
import os from "os";
import fs from "fs";
import pino from "pino";

const PORT = process.env.WA_PORT || 3001;
const SESSION_DIR = path.join(os.homedir(), ".crosspost", "sessions", "whatsapp");
fs.mkdirSync(SESSION_DIR, { recursive: true });

// Suppress Baileys verbose logging
const logger = pino({ level: "silent" });

const app = express();
app.use(express.json());

// ── State ────────────────────────────────────────────────────────────────────

let sock = null;
let currentQR = null;
let connectionState = "disconnected"; // "qr" | "connected" | "disconnected"
const messageStore = [];             // last 200 messages in memory

// ── Baileys connection ───────────────────────────────────────────────────────

async function connectWA() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    logger,
    auth: state,
    printQRInTerminal: false,
    browser: ["CrossPost Desktop", "Chrome", "1.0.0"],
    getMessage: async (key) => {
      const msg = messageStore.find((m) => m.key?.id === key.id);
      return msg?.message || undefined;
    },
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      currentQR = qr;
      connectionState = "qr";
      console.log("[WA] QR ready");
    }

    if (connection === "open") {
      currentQR = null;
      connectionState = "connected";
      console.log("[WA] Connected");
    }

    if (connection === "close") {
      const code = (lastDisconnect?.error instanceof Boom)
        ? lastDisconnect.error.output.statusCode
        : 0;

      const shouldReconnect = code !== DisconnectReason.loggedOut;
      connectionState = shouldReconnect ? "disconnected" : "logged_out";
      console.log("[WA] Disconnected, code:", code, "reconnect:", shouldReconnect);

      if (shouldReconnect) {
        await connectWA();
      }
    }
  });

  sock.ev.on("messages.upsert", ({ messages, type }) => {
    if (type !== "notify") return;
    for (const msg of messages) {
      if (!msg.key.fromMe) {
        messageStore.unshift({
          id: msg.key.id,
          from: msg.key.remoteJid,
          text: msg.message?.conversation
            || msg.message?.extendedTextMessage?.text
            || "",
          timestamp: (msg.messageTimestamp || 0) * 1000,
          key: msg.key,
        });
        if (messageStore.length > 200) messageStore.pop();
      }
    }
  });
}

// ── Routes ───────────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", port: PORT });
});

// Start connection (or return current state)
app.post("/instance/init", async (_req, res) => {
  if (connectionState === "connected") {
    return res.json({ state: "connected" });
  }
  if (!sock || connectionState === "disconnected" || connectionState === "logged_out") {
    connectWA().catch(console.error);
  }
  res.json({ state: "starting" });
});

// Get current QR code as base64 PNG
app.get("/instance/qr", async (_req, res) => {
  if (connectionState === "connected") {
    return res.json({ connected: true });
  }
  if (!currentQR) {
    return res.status(202).json({ state: connectionState, qr: null });
  }
  try {
    const png = await QRCode.toDataURL(currentQR, { width: 300, margin: 2 });
    res.json({ qr: png, state: "qr" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Connection status
app.get("/instance/status", (_req, res) => {
  const info = sock?.user || null;
  res.json({
    state: connectionState,
    phone: info?.id?.split(":")[0] || null,
    name: info?.name || null,
  });
});

// Logout & clear session
app.post("/instance/logout", async (_req, res) => {
  try {
    if (sock) {
      await sock.logout();
      sock = null;
    }
    fs.rmSync(SESSION_DIR, { recursive: true, force: true });
    fs.mkdirSync(SESSION_DIR, { recursive: true });
    connectionState = "disconnected";
    currentQR = null;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Send message: { to: "491601234567", text: "Hallo" }
app.post("/message/send", async (req, res) => {
  if (connectionState !== "connected") {
    return res.status(400).json({ error: "WhatsApp nicht verbunden" });
  }
  const { to, text } = req.body;
  if (!to || !text) {
    return res.status(400).json({ error: "to und text erforderlich" });
  }
  try {
    const jid = to.includes("@") ? to : `${to.replace(/\D/g, "")}@s.whatsapp.net`;
    await sock.sendMessage(jid, { text });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// List recent incoming messages
app.get("/message/list", (_req, res) => {
  res.json({ messages: messageStore.slice(0, 50) });
});

// ── Start server ─────────────────────────────────────────────────────────────

app.listen(PORT, "127.0.0.1", () => {
  console.log(`[WA] CrossPost WhatsApp sidecar running on port ${PORT}`);
  // Auto-connect on start if session exists
  const credsPath = path.join(SESSION_DIR, "creds.json");
  if (fs.existsSync(credsPath)) {
    console.log("[WA] Existing session found, auto-connecting...");
    connectWA().catch(console.error);
  }
});
