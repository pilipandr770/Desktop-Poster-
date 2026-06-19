import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, Bot, Send, Inbox } from "lucide-react";
import toast from "react-hot-toast";

interface Message {
  id: string;
  account_id: string;
  platform: string;
  conversation_id: string;
  sender_name: string;
  content: string;
  direction: "incoming" | "outgoing";
  is_read: boolean;
  ai_suggested_reply?: string;
  created_at: string;
}

const platformColors: Record<string, string> = {
  instagram: "#E1306C", facebook: "#1877F2", whatsapp: "#25D366",
  linkedin:  "#0A66C2", twitter:  "#1DA1F2", telegram: "#2AABEE", email: "#EA4335",
};

const platformLabels: Record<string, string> = {
  instagram: "Instagram", facebook: "Facebook", whatsapp: "WhatsApp",
  linkedin: "LinkedIn", twitter: "Twitter/X", telegram: "Telegram", email: "E-Mail",
};

export default function InboxPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [selected, setSelected] = useState<Message | null>(null);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string>("all");

  const fetchMessages = async () => {
    setLoading(true);
    try {
      setMessages(await invoke<Message[]>("get_messages"));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMessages(); }, []);

  const unread   = messages.filter((m) => !m.is_read && m.direction === "incoming");
  const filtered = filter === "all" ? messages : messages.filter((m) => m.platform === filter);
  const platforms = [...new Set(messages.map((m) => m.platform))];

  const sendReply = async () => {
    if (!reply.trim() || !selected) return;
    try {
      await invoke("send_reply", { messageId: selected.id, content: reply });
      toast.success("Antwort gesendet");
      setReply("");
      fetchMessages();
    } catch (e: any) {
      toast.error(`Fehler: ${e.message}`);
    }
  };

  const useAISuggestion = () => {
    if (selected?.ai_suggested_reply) setReply(selected.ai_suggested_reply);
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>

      {/* ── Sidebar: message list ── */}
      <div style={{
        width: 300,
        minWidth: 300,
        display: "flex",
        flexDirection: "column",
        borderRight: "1.5px solid var(--surface0)",
        background: "var(--mantle)",
      }}>

        {/* Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "18px 16px 14px",
          borderBottom: "1.5px solid var(--surface0)",
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text)" }}>Posteingang</div>
            {unread.length > 0 && (
              <div style={{ fontSize: 12, color: "var(--blue)", marginTop: 2 }}>
                {unread.length} ungelesen
              </div>
            )}
          </div>
          <button
            onClick={fetchMessages}
            disabled={loading}
            style={{ padding: 6, borderRadius: 8, color: "var(--overlay1)", transition: "all 0.15s" }}
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {/* Platform filter */}
        <div style={{
          display: "flex",
          gap: 6,
          padding: "10px 12px",
          borderBottom: "1.5px solid var(--surface0)",
          overflowX: "auto",
          flexShrink: 0,
        }}>
          <button
            onClick={() => setFilter("all")}
            style={{
              padding: "4px 10px",
              borderRadius: 99,
              fontSize: 12,
              fontWeight: filter === "all" ? 600 : 400,
              background: filter === "all" ? "var(--blue)" : "var(--surface0)",
              color: filter === "all" ? "var(--crust)" : "var(--subtext0)",
              border: "none",
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "all 0.15s",
            }}
          >
            Alle
          </button>
          {platforms.map((p) => {
            const active = filter === p;
            const color  = platformColors[p] || "var(--blue)";
            return (
              <button
                key={p}
                onClick={() => setFilter(p)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 99,
                  fontSize: 12,
                  fontWeight: active ? 600 : 400,
                  background: active ? color : "var(--surface0)",
                  color: active ? "white" : "var(--subtext0)",
                  border: "none",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  transition: "all 0.15s",
                }}
              >
                {platformLabels[p] || p}
              </button>
            );
          })}
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filtered.length === 0 ? (
            <div className="empty-state">
              <Inbox size={32} />
              <p>Keine Nachrichten</p>
              <span>Verbundene Konten werden hier synchronisiert</span>
            </div>
          ) : (
            filtered.map((msg) => {
              const color   = platformColors[msg.platform] || "#666";
              const isActive = selected?.id === msg.id;
              return (
                <button
                  key={msg.id}
                  onClick={() => setSelected(msg)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "12px 14px",
                    borderBottom: "1px solid var(--surface0)",
                    background: isActive ? "var(--surface0)" : "transparent",
                    cursor: "pointer",
                    border: "none",
                    borderBottomColor: "var(--surface0)",
                    borderBottomWidth: 1,
                    borderBottomStyle: "solid",
                    transition: "background 0.12s",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: msg.is_read ? 400 : 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {msg.sender_name || "Unbekannt"}
                    </span>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 600,
                      padding: "2px 7px",
                      borderRadius: 99,
                      background: color + "22",
                      color,
                      flexShrink: 0,
                    }}>
                      {platformLabels[msg.platform] || msg.platform}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {!msg.is_read && msg.direction === "incoming" && (
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--blue)", flexShrink: 0 }} />
                    )}
                    <p style={{
                      fontSize: 12,
                      color: msg.is_read ? "var(--overlay0)" : "var(--subtext1)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      flex: 1,
                    }}>
                      {msg.content}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Conversation detail ── */}
      {selected ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Contact header */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "16px 22px",
            borderBottom: "1.5px solid var(--surface0)",
            flexShrink: 0,
          }}>
            <div style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: (platformColors[selected.platform] || "#666") + "28",
              color: platformColors[selected.platform] || "var(--text)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 15,
              fontWeight: 700,
              flexShrink: 0,
            }}>
              {(selected.sender_name || "?")[0].toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text)" }}>
                {selected.sender_name}
              </div>
              <div style={{ fontSize: 12, color: "var(--overlay0)" }}>
                via {platformLabels[selected.platform] || selected.platform}
              </div>
            </div>
          </div>

          {/* Message body */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 22px" }}>
            <div style={{
              maxWidth: 520,
              padding: "14px 16px",
              borderRadius: 12,
              background: "var(--surface0)",
              color: "var(--text)",
              fontSize: 14,
              lineHeight: 1.6,
            }}>
              {selected.content}
            </div>
          </div>

          {/* Reply */}
          <div style={{
            padding: "14px 20px",
            borderTop: "1.5px solid var(--surface0)",
            flexShrink: 0,
          }}>
            {selected.ai_suggested_reply && (
              <button
                onClick={useAISuggestion}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: "var(--surface0)",
                  border: "1.5px solid var(--blue)40",
                  cursor: "pointer",
                  marginBottom: 10,
                  transition: "opacity 0.15s",
                }}
              >
                <Bot size={14} style={{ color: "var(--blue)", marginTop: 2, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--blue)", marginBottom: 3 }}>
                    KI-Vorschlag — klicken zum Übernehmen
                  </div>
                  <div style={{ fontSize: 13, color: "var(--subtext1)" }}>
                    {selected.ai_suggested_reply}
                  </div>
                </div>
              </button>
            )}

            <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
              <textarea
                rows={2}
                placeholder="Antwort schreiben…"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                style={{
                  flex: 1,
                  resize: "none",
                  borderRadius: 10,
                  minHeight: 68,
                }}
              />
              <button
                onClick={sendReply}
                disabled={!reply.trim()}
                className="btn btn-primary"
                style={{ padding: "10px 16px", flexShrink: 0 }}
              >
                <Send size={15} />
                Senden
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="empty-state" style={{ flex: 1 }}>
          <Inbox size={40} />
          <p>Nachricht auswählen</p>
          <span>Klicken Sie auf eine Nachricht links, um sie zu öffnen</span>
        </div>
      )}
    </div>
  );
}
