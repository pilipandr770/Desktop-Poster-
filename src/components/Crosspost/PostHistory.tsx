import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CheckCircle, Clock, XCircle, Trash2, RefreshCw } from "lucide-react";
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

const STATUS_META: Record<string, { label: string; color: string; Icon: any }> = {
  published: { label: "Veröffentlicht", color: "var(--green)",  Icon: CheckCircle },
  scheduled:  { label: "Geplant",        color: "var(--yellow)", Icon: Clock },
  cancelled:  { label: "Abgebrochen",    color: "var(--overlay0)", Icon: XCircle },
};

const PLATFORM_COLORS: Record<string, string> = {
  instagram: "#E1306C", facebook: "#1877F2", whatsapp: "#25D366",
  linkedin: "#0A66C2", twitter: "#1DA1F2", telegram: "#2AABEE", email: "#EA4335",
};

const PLATFORM_LABELS: Record<string, string> = {
  instagram: "IG", facebook: "FB", whatsapp: "WA",
  linkedin: "LI", twitter: "TW", telegram: "TG", email: "E",
};

export default function PostHistory() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchPosts = async () => {
    setLoading(true);
    try {
      setPosts(await invoke<Post[]>("get_posts"));
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPosts(); }, []);

  const cancelPost = async (id: string) => {
    try {
      await invoke("cancel_scheduled_post", { postId: id });
      toast.success("Post abgebrochen");
      fetchPosts();
    } catch (e: any) {
      toast.error(String(e));
    }
  };

  if (posts.length === 0 && !loading) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: "60px 20px", color: "var(--overlay0)", textAlign: "center" }}>
      <Clock size={36} style={{ opacity: 0.4 }} />
      <p style={{ fontSize: 14, fontWeight: 600, color: "var(--subtext0)" }}>Noch keine Posts</p>
      <span style={{ fontSize: 12 }}>Veröffentlichte und geplante Posts erscheinen hier.</span>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--subtext0)" }}>
          {posts.length} {posts.length === 1 ? "Post" : "Posts"}
        </span>
        <button onClick={fetchPosts} disabled={loading} style={{ color: "var(--overlay1)", background: "none", border: "none", cursor: "pointer", padding: 4 }}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {posts.map((post) => {
        const meta = STATUS_META[post.status] ?? { label: post.status, color: "var(--overlay0)", Icon: Clock };
        const date = post.published_at || post.scheduled_at || post.created_at;
        const dateStr = date ? new Date(date).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }) : "";

        return (
          <div key={post.id} style={{
            padding: "14px 16px",
            borderRadius: 12,
            background: "var(--mantle)",
            border: "1px solid var(--surface0)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}>
            {/* Header row */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              {/* Platform badges */}
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {post.platforms.map((p) => (
                  <span key={p} style={{
                    fontSize: 11, fontWeight: 700,
                    padding: "2px 7px", borderRadius: 99,
                    background: (PLATFORM_COLORS[p] || "#666") + "22",
                    color: PLATFORM_COLORS[p] || "var(--overlay0)",
                  }}>
                    {PLATFORM_LABELS[p] || p}
                  </span>
                ))}
                {post.ai_generated && (
                  <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 99, background: "var(--blue)20", color: "var(--blue)", fontWeight: 600 }}>
                    KI
                  </span>
                )}
              </div>

              {/* Status + time */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <span style={{ fontSize: 11, color: meta.color, display: "flex", alignItems: "center", gap: 4, fontWeight: 600 }}>
                  <meta.Icon size={11} /> {meta.label}
                </span>
                <span style={{ fontSize: 11, color: "var(--overlay0)" }}>{dateStr}</span>
                {post.status === "scheduled" && (
                  <button
                    onClick={() => cancelPost(post.id)}
                    title="Abbrechen"
                    style={{ color: "var(--overlay0)", background: "none", border: "none", cursor: "pointer", padding: 2, display: "flex" }}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>

            {/* Content preview */}
            <p style={{
              fontSize: 13, color: "var(--subtext1)",
              lineHeight: 1.5,
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}>
              {post.content}
            </p>
          </div>
        );
      })}
    </div>
  );
}
