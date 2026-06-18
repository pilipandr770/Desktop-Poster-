import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, Bot, Send } from "lucide-react";
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
  instagram: "#E1306C",
  facebook:  "#1877F2",
  whatsapp:  "#25D366",
  linkedin:  "#0A66C2",
  twitter:   "#1DA1F2",
  telegram:  "#2AABEE",
  email:     "#EA4335",
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
      const msgs = await invoke<Message[]>("get_messages");
      setMessages(msgs);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMessages(); }, []);

  const unread = messages.filter((m) => !m.is_read && m.direction === "incoming");
  const filtered = filter === "all"
    ? messages
    : messages.filter((m) => m.platform === filter);

  const sendReply = async () => {
    if (!reply.trim() || !selected) return;
    try {
      await invoke("send_reply", {
        messageId: selected.id,
        content: reply,
      });
      toast.success("Antwort gesendet");
      setReply("");
      fetchMessages();
    } catch (e: any) {
      toast.error(`Fehler: ${e.message}`);
    }
  };

  const useAISuggestion = () => {
    if (selected?.ai_suggested_reply) {
      setReply(selected.ai_suggested_reply);
    }
  };

  const platforms = [...new Set(messages.map((m) => m.platform))];

  return (
    <div className="flex h-full">
      {/* ── Message list ── */}
      <div
        className="w-72 shrink-0 flex flex-col border-r"
        style={{ borderColor: "var(--surface0)" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: "var(--surface0)" }}
        >
          <div>
            <h2 className="font-semibold text-sm" style={{ color: "var(--text)" }}>
              Posteingang
            </h2>
            {unread.length > 0 && (
              <p className="text-xs" style={{ color: "var(--blue)" }}>
                {unread.length} ungelesen
              </p>
            )}
          </div>
          <button onClick={fetchMessages} disabled={loading}>
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} style={{ color: "var(--overlay0)" }} />
          </button>
        </div>

        {/* Platform filter */}
        <div className="flex gap-1 p-2 overflow-x-auto" style={{ borderBottom: "1px solid var(--surface0)" }}>
          <button
            onClick={() => setFilter("all")}
            className="px-2 py-1 rounded text-xs shrink-0"
            style={{
              background: filter === "all" ? "var(--blue)" : "var(--surface0)",
              color: filter === "all" ? "var(--crust)" : "var(--subtext0)",
            }}
          >
            Alle
          </button>
          {platforms.map((p) => (
            <button
              key={p}
              onClick={() => setFilter(p)}
              className="px-2 py-1 rounded text-xs shrink-0"
              style={{
                background: filter === p ? platformColors[p] : "var(--surface0)",
                color: filter === p ? "white" : "var(--subtext0)",
              }}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2">
              <p className="text-sm" style={{ color: "var(--overlay0)" }}>Keine Nachrichten</p>
            </div>
          ) : (
            filtered.map((msg) => (
              <button
                key={msg.id}
                onClick={() => setSelected(msg)}
                className="w-full text-left px-4 py-3 border-b transition-all"
                style={{
                  borderColor: "var(--surface0)",
                  background: selected?.id === msg.id ? "var(--surface0)" : "transparent",
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className="text-xs font-medium truncate"
                    style={{ color: "var(--text)" }}
                  >
                    {msg.sender_name || "Unbekannt"}
                  </span>
                  <span
                    className="text-xs px-1.5 py-0.5 rounded"
                    style={{
                      background: (platformColors[msg.platform] || "#666") + "20",
                      color: platformColors[msg.platform] || "var(--subtext0)",
                    }}
                  >
                    {msg.platform}
                  </span>
                </div>
                <p
                  className="text-xs truncate"
                  style={{ color: msg.is_read ? "var(--overlay0)" : "var(--subtext1)" }}
                >
                  {msg.content}
                </p>
                {!msg.is_read && msg.direction === "incoming" && (
                  <div
                    className="w-2 h-2 rounded-full mt-1"
                    style={{ background: "var(--blue)" }}
                  />
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Conversation detail ── */}
      {selected ? (
        <div className="flex-1 flex flex-col">
          {/* Contact header */}
          <div
            className="px-6 py-4 border-b flex items-center gap-3"
            style={{ borderColor: "var(--surface0)" }}
          >
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
              style={{
                background: platformColors[selected.platform] + "30",
                color: platformColors[selected.platform],
              }}
            >
              {(selected.sender_name || "?")[0].toUpperCase()}
            </div>
            <div>
              <p className="font-medium text-sm" style={{ color: "var(--text)" }}>
                {selected.sender_name}
              </p>
              <p className="text-xs" style={{ color: "var(--overlay0)" }}>
                via {selected.platform}
              </p>
            </div>
          </div>

          {/* Message */}
          <div className="flex-1 overflow-y-auto p-6">
            <div
              className="max-w-lg p-4 rounded-xl text-sm"
              style={{ background: "var(--surface0)", color: "var(--text)" }}
            >
              {selected.content}
            </div>
          </div>

          {/* Reply area — НЕ пишем первыми, только отвечаем! */}
          <div
            className="p-4 border-t"
            style={{ borderColor: "var(--surface0)" }}
          >
            {selected.ai_suggested_reply && (
              <div
                className="mb-3 p-3 rounded-lg flex items-start gap-2 cursor-pointer hover:opacity-80"
                onClick={useAISuggestion}
                style={{ background: "var(--surface0)", border: "1px solid var(--blue)30" }}
              >
                <Bot size={14} style={{ color: "var(--blue)", marginTop: 2 }} />
                <div>
                  <p className="text-xs font-medium mb-1" style={{ color: "var(--blue)" }}>
                    KI-Vorschlag (klicken zum Übernehmen)
                  </p>
                  <p className="text-xs" style={{ color: "var(--subtext1)" }}>
                    {selected.ai_suggested_reply}
                  </p>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <textarea
                rows={2}
                placeholder="Antwort schreiben... (nur auf eingehende Nachrichten antworten)"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                style={{
                  flex: 1,
                  background: "var(--surface0)",
                  border: "1px solid var(--surface1)",
                  borderRadius: 8,
                  padding: "8px 12px",
                  color: "var(--text)",
                  resize: "none",
                }}
              />
              <button
                onClick={sendReply}
                disabled={!reply.trim()}
                className="flex items-center justify-center w-10 h-10 rounded-lg self-end disabled:opacity-40"
                style={{ background: "var(--blue)", color: "var(--crust)" }}
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm" style={{ color: "var(--overlay0)" }}>
            Nachricht auswählen
          </p>
        </div>
      )}
    </div>
  );
}
