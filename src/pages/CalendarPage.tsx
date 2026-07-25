import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CalendarDays, Clock, Trash2, RefreshCw, Send, Bot } from "lucide-react";
import toast from "react-hot-toast";

interface Post {
  id: string;
  content: string;
  platforms: string[];
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
  ai_generated: boolean;
  created_at: string;
}

const platformColors: Record<string, string> = {
  instagram: "#E1306C", facebook: "#1877F2", whatsapp: "#25D366",
  linkedin: "#0A66C2", twitter: "#1DA1F2", telegram: "#2AABEE", email: "#EA4335",
};

const platformLabels: Record<string, string> = {
  instagram: "Instagram", facebook: "Facebook", whatsapp: "WhatsApp",
  linkedin: "LinkedIn", twitter: "Twitter/X", telegram: "Telegram", email: "E-Mail",
};

const statusColors: Record<string, string> = {
  scheduled:  "var(--blue)",
  published:  "var(--green)",
  failed:     "var(--red)",
  draft:      "var(--overlay1)",
};

const statusLabels: Record<string, string> = {
  scheduled: "Geplant",
  published: "Veröffentlicht",
  failed:    "Fehlgeschlagen",
  draft:     "Entwurf",
};

export default function CalendarPage() {
  const [posts, setPosts]     = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter]   = useState<"all" | "scheduled" | "published">("all");

  const fetchPosts = async () => {
    setLoading(true);
    try {
      setPosts(await invoke<Post[]>("get_posts"));
    } catch (e: any) {
      toast.error(`Fehler: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPosts(); }, []);

  const cancelPost = async (id: string) => {
    try {
      await invoke("cancel_scheduled_post", { postId: id });
      toast.success("Geplanter Post abgebrochen");
      fetchPosts();
    } catch (e: any) {
      toast.error(`Fehler: ${e}`);
    }
  };

  const filtered = posts.filter((p) =>
    filter === "all" ? true : p.status === filter
  );

  // Group by date
  const groups: Record<string, Post[]> = {};
  for (const p of filtered) {
    const dateStr = p.scheduled_at || p.created_at;
    const day = dateStr ? dateStr.slice(0, 10) : "Ohne Datum";
    if (!groups[day]) groups[day] = [];
    groups[day].push(p);
  }
  const sortedDays = Object.keys(groups).sort();

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* Header */}
      <div style={{
        padding: "18px 22px 14px",
        borderBottom: "1.5px solid var(--surface0)",
        display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <CalendarDays size={20} style={{ color: "var(--blue)" }} />
          <span style={{ fontWeight: 700, fontSize: 17, color: "var(--text)" }}>Content-Kalender</span>
          <span style={{ fontSize: 13, color: "var(--overlay0)" }}>{posts.length} Posts</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Filter */}
          <div style={{ display: "flex", background: "var(--surface0)", borderRadius: 10, padding: 3, gap: 2 }}>
            {([
              { id: "all",       label: "Alle" },
              { id: "scheduled", label: "Geplant" },
              { id: "published", label: "Veröffentlicht" },
            ] as const).map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setFilter(id)}
                style={{
                  padding: "5px 12px", borderRadius: 7, fontSize: 12,
                  fontWeight: filter === id ? 600 : 400,
                  background: filter === id ? "var(--base)" : "transparent",
                  color: filter === id ? "var(--text)" : "var(--overlay1)",
                  border: "none", cursor: "pointer",
                  boxShadow: filter === id ? "0 1px 4px rgba(0,0,0,0.2)" : "none",
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={fetchPosts}
            disabled={loading}
            style={{ padding: 7, borderRadius: 8, background: "var(--surface0)", border: "none", cursor: "pointer", color: "var(--overlay1)", display: "flex" }}
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
        {sortedDays.length === 0 ? (
          <div className="empty-state" style={{ marginTop: 60 }}>
            <CalendarDays size={40} />
            <p>Keine Posts</p>
            <span>Geplante und veröffentlichte Beiträge erscheinen hier</span>
          </div>
        ) : (
          sortedDays.map((day) => (
            <div key={day} style={{ marginBottom: 28 }}>
              {/* Day header */}
              <div style={{
                display: "flex", alignItems: "center", gap: 10, marginBottom: 10,
              }}>
                <div style={{ height: 1, background: "var(--surface1)", flex: 1 }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--overlay0)", whiteSpace: "nowrap" }}>
                  {day === "Ohne Datum" ? day : formatDay(day)}
                </span>
                <div style={{ height: 1, background: "var(--surface1)", flex: 1 }} />
              </div>

              {/* Posts for this day */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {groups[day].map((post) => (
                  <PostCard key={post.id} post={post} onCancel={cancelPost} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function PostCard({ post, onCancel }: { post: Post; onCancel: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{
        borderRadius: 12, padding: "14px 16px",
        background: "var(--mantle)", border: "1px solid var(--surface0)",
        cursor: "pointer",
      }}
      onClick={() => setExpanded((v) => !v)}
    >
      {/* Top row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Platforms */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 6 }}>
            {post.platforms.map((p) => (
              <span
                key={p}
                style={{
                  fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 99,
                  background: (platformColors[p] || "#888") + "22",
                  color: platformColors[p] || "var(--text)",
                }}
              >
                {platformLabels[p] || p}
              </span>
            ))}
            {post.ai_generated && (
              <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 99, background: "var(--mauve)22", color: "var(--mauve)", display: "flex", alignItems: "center", gap: 3 }}>
                <Bot size={9} /> KI
              </span>
            )}
          </div>

          {/* Content preview */}
          <p style={{
            fontSize: 13, color: "var(--text)", lineHeight: 1.5,
            overflow: "hidden", textOverflow: "ellipsis",
            display: expanded ? "block" : "-webkit-box",
            WebkitLineClamp: expanded ? undefined : 2,
            WebkitBoxOrient: "vertical" as any,
          }}>
            {post.content}
          </p>
        </div>

        {/* Status + time + actions */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: statusColors[post.status] || "var(--overlay1)" }}>
            {statusLabels[post.status] || post.status}
          </span>
          {post.scheduled_at && (
            <span style={{ fontSize: 11, color: "var(--overlay0)", display: "flex", alignItems: "center", gap: 4 }}>
              <Clock size={10} />
              {formatTime(post.scheduled_at)}
            </span>
          )}
          {post.status === "scheduled" && (
            <button
              onClick={(e) => { e.stopPropagation(); onCancel(post.id); }}
              title="Abbrechen"
              style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "3px 8px", borderRadius: 6, fontSize: 11,
                background: "var(--red)18", color: "var(--red)",
                border: "1px solid var(--red)33", cursor: "pointer",
              }}
            >
              <Trash2 size={10} /> Abbrechen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function formatDay(iso: string): string {
  const d = new Date(iso);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const target = new Date(iso); target.setHours(0, 0, 0, 0);
  if (target.getTime() === today.getTime()) return "Heute";
  if (target.getTime() === tomorrow.getTime()) return "Morgen";
  return d.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}
