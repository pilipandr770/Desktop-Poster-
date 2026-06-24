import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Download, Send, Loader, AlertCircle, CheckCircle, ChevronDown, ChevronUp } from "lucide-react";
import { useAccountsStore } from "../../store/accounts";
import toast from "react-hot-toast";

const LABELS: Record<string, string> = {
  instagram: "Instagram", facebook: "Facebook", whatsapp: "WhatsApp",
  linkedin: "LinkedIn", twitter: "Twitter/X", telegram: "Telegram", email: "E-Mail",
};

const COLORS: Record<string, string> = {
  instagram: "#E1306C", facebook: "#1877F2", whatsapp: "#25D366",
  linkedin: "#0A66C2", twitter: "#1DA1F2", telegram: "#2AABEE", email: "#EA4335",
};

const SOURCE_CAPABLE = ["instagram", "linkedin", "facebook"];

interface RemotePost {
  id: string;
  text: string;
  media_url?: string;
  created_at?: string;
}

type PostingStatus = "idle" | "posting" | "done" | "error";

function PostCard({
  post,
  index,
  isSelected,
  color,
  onClick,
}: {
  post: RemotePost;
  index: number;
  isSelected: boolean;
  color: string;
  onClick: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const preview = post.text ? post.text.slice(0, 120) : "";
  const hasMore = post.text && post.text.length > 120;

  return (
    <div
      style={{
        border: `2px solid ${isSelected ? color : "var(--border)"}`,
        borderRadius: 12,
        background: isSelected ? color + "15" : "var(--surface)",
        overflow: "hidden",
        transition: "border-color 0.15s, background 0.15s",
      }}
    >
      <button
        onClick={onClick}
        style={{
          width: "100%",
          textAlign: "left",
          padding: "12px 14px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
        }}
      >
        {/* Index badge */}
        <span
          style={{
            flexShrink: 0,
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: isSelected ? color : "var(--overlay0)",
            color: isSelected ? "#fff" : "var(--text-secondary)",
            fontSize: 11,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginTop: 1,
          }}
        >
          {index + 1}
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          {post.text ? (
            <p style={{
              fontSize: 13,
              lineHeight: 1.5,
              color: "var(--text-primary)",
              margin: 0,
              wordBreak: "break-word",
            }}>
              {expanded ? post.text : (preview + (hasMore ? "…" : ""))}
            </p>
          ) : (
            <p style={{ fontSize: 13, color: "var(--text-secondary)", fontStyle: "italic", margin: 0 }}>
              [Kein Text]
            </p>
          )}

          <div style={{ display: "flex", gap: 12, marginTop: 6, alignItems: "center" }}>
            {post.created_at && (
              <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{post.created_at}</span>
            )}
            {post.text && (
              <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                {post.text.length} Zeichen
              </span>
            )}
            {isSelected && (
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                color: color,
                padding: "1px 7px",
                borderRadius: 10,
                background: color + "22",
              }}>
                ✓ Ausgewählt
              </span>
            )}
          </div>
        </div>
      </button>

      {hasMore && (
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
          style={{
            width: "100%",
            padding: "4px 14px 8px 46px",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
            color: "var(--text-secondary)",
          }}
        >
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {expanded ? "Weniger anzeigen" : "Mehr anzeigen"}
        </button>
      )}
    </div>
  );
}

export default function PipelinePost() {
  const accounts = useAccountsStore((s) => s.accounts);
  const connected = accounts.filter((a) => a.status === "connected");

  const [sourceId, setSourceId] = useState<string | null>(null);
  const [destinations, setDestinations] = useState<string[]>([]);
  const [remotePosts, setRemotePosts] = useState<RemotePost[]>([]);
  const [selectedPost, setSelectedPost] = useState<RemotePost | null>(null);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [statuses, setStatuses] = useState<Record<string, PostingStatus>>({});
  const [posting, setPosting] = useState(false);

  const step3Ref = useRef<HTMLDivElement>(null);

  const sources = connected.filter((a) => SOURCE_CAPABLE.includes(a.platform));
  const destCandidates = connected.filter((a) => a.id !== sourceId);

  const toggleDest = (id: string) =>
    setDestinations((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);

  const selectSource = (id: string) => {
    if (sourceId === id) {
      setSourceId(null);
      setRemotePosts([]);
      setSelectedPost(null);
      setLoadError("");
    } else {
      setSourceId(id);
      setRemotePosts([]);
      setSelectedPost(null);
      setLoadError("");
      setDestinations((d) => d.filter((x) => x !== id));
    }
  };

  const loadPosts = async () => {
    if (!sourceId) return;
    setLoadingPosts(true);
    setLoadError("");
    setRemotePosts([]);
    setSelectedPost(null);
    try {
      const result = await invoke<{ success: boolean; posts?: RemotePost[]; error?: string }>(
        "fetch_account_posts",
        { accountId: sourceId, limit: 10 }
      );
      if (result.success && result.posts) {
        setRemotePosts(result.posts);
        if (result.posts.length === 0) setLoadError("Keine Beiträge gefunden.");
      } else {
        setLoadError(result.error || "Fehler beim Laden.");
      }
    } catch (e: any) {
      setLoadError(String(e));
    } finally {
      setLoadingPosts(false);
    }
  };

  const selectPost = (post: RemotePost) => {
    setSelectedPost(post);
    setTimeout(() => {
      step3Ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const handlePost = async () => {
    if (!selectedPost || destinations.length === 0) return;
    setPosting(true);
    const next: Record<string, PostingStatus> = {};
    destinations.forEach((id) => (next[id] = "posting"));
    setStatuses(next);

    for (const id of destinations) {
      try {
        await invoke("post_content", { accountId: id, content: selectedPost.text });
        setStatuses((s) => ({ ...s, [id]: "done" }));
      } catch (e: any) {
        setStatuses((s) => ({ ...s, [id]: "error" }));
        toast.error(`Fehler bei ${accounts.find((a) => a.id === id)?.display_name ?? id}: ${e}`);
      }
    }
    setPosting(false);
  };

  const sourceAccount = accounts.find((a) => a.id === sourceId);
  const sourceColor = COLORS[sourceAccount?.platform ?? ""] ?? "#888";

  const stepStyle = (active: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "flex-start",
    gap: 14,
    opacity: active ? 1 : 0.4,
    transition: "opacity 0.2s",
  });

  const stepNumStyle = (active: boolean, done: boolean): React.CSSProperties => ({
    flexShrink: 0,
    width: 28,
    height: 28,
    borderRadius: "50%",
    background: done ? "#22c55e" : active ? "var(--mauve)" : "var(--overlay0)",
    color: "#fff",
    fontWeight: 700,
    fontSize: 13,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  });

  const step1Done = !!sourceId;
  const step2Done = !!selectedPost;
  const step3Active = !!selectedPost;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* STEP 1 */}
      <div style={stepStyle(true)}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={stepNumStyle(true, step1Done)}>
            {step1Done ? "✓" : "1"}
          </div>
          <div style={{ width: 2, flex: 1, minHeight: 24, background: step1Done ? "#22c55e44" : "var(--border)", margin: "4px 0" }} />
        </div>
        <div style={{ flex: 1, paddingBottom: 20 }}>
          <p style={{ fontWeight: 600, fontSize: 14, margin: "0 0 10px 0", color: "var(--text)" }}>
            Quelle wählen
          </p>
          {sources.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              Kein unterstützter Quell-Account verbunden (Instagram, LinkedIn, Facebook).
            </p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {sources.map((acc) => {
                const isSel = sourceId === acc.id;
                const c = COLORS[acc.platform];
                return (
                  <button
                    key={acc.id}
                    onClick={() => selectSource(acc.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 14px",
                      borderRadius: 10,
                      border: `2px solid ${isSel ? c : "var(--border)"}`,
                      background: isSel ? c + "22" : "var(--surface)",
                      color: isSel ? c : "var(--text-primary)",
                      cursor: "pointer",
                      fontWeight: isSel ? 600 : 400,
                      fontSize: 13,
                      transition: "all 0.15s",
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: c, flexShrink: 0 }} />
                    <span>{LABELS[acc.platform]}</span>
                    <span style={{ opacity: 0.6, fontSize: 12 }}>{acc.display_name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* STEP 2 */}
      <div style={stepStyle(!!sourceId)}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={stepNumStyle(!!sourceId, step2Done)}>
            {step2Done ? "✓" : "2"}
          </div>
          <div style={{ width: 2, flex: 1, minHeight: 24, background: step2Done ? "#22c55e44" : "var(--border)", margin: "4px 0" }} />
        </div>
        <div style={{ flex: 1, paddingBottom: 20 }}>
          <p style={{ fontWeight: 600, fontSize: 14, margin: "0 0 10px 0", color: "var(--text)" }}>
            Beitrag auswählen
          </p>

          {sourceId && (
            <button
              onClick={loadPosts}
              disabled={loadingPosts}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "8px 16px",
                borderRadius: 10,
                border: "none",
                background: sourceColor,
                color: "#fff",
                cursor: loadingPosts ? "not-allowed" : "pointer",
                opacity: loadingPosts ? 0.7 : 1,
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 12,
              }}
            >
              {loadingPosts ? <Loader size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Download size={14} />}
              {loadingPosts ? "Lade Beiträge…" : "Beiträge laden"}
            </button>
          )}

          {loadError && (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", color: "#f87171", fontSize: 13 }}>
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{loadError}</span>
            </div>
          )}

          {remotePosts.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 4px 0" }}>
                {remotePosts.length} Beiträge geladen — klicke auf einen zum Auswählen:
              </p>
              {remotePosts.map((post, i) => (
                <PostCard
                  key={post.id}
                  post={post}
                  index={i}
                  isSelected={selectedPost?.id === post.id}
                  color={sourceColor}
                  onClick={() => selectPost(post)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* STEP 3 */}
      <div ref={step3Ref} style={stepStyle(step3Active)}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={stepNumStyle(step3Active, false)}>3</div>
          <div style={{ width: 2, flex: 1, minHeight: 24, background: "var(--border)", margin: "4px 0" }} />
        </div>
        <div style={{ flex: 1, paddingBottom: 20 }}>
          <p style={{ fontWeight: 600, fontSize: 14, margin: "0 0 10px 0", color: "var(--text)" }}>
            Ziele wählen
          </p>

          {!selectedPost && (
            <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              Wähle zuerst einen Beitrag aus (Schritt 2).
            </p>
          )}

          {selectedPost && destCandidates.length === 0 && (
            <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>Keine weiteren Konten verbunden.</p>
          )}

          {selectedPost && destCandidates.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Selected post preview */}
              <div style={{
                background: "var(--surface)",
                border: `1px solid ${sourceColor}44`,
                borderLeft: `3px solid ${sourceColor}`,
                borderRadius: 8,
                padding: "10px 12px",
                fontSize: 12,
                color: "var(--text-secondary)",
                marginBottom: 4,
              }}>
                <p style={{ margin: "0 0 4px 0", fontWeight: 600, color: sourceColor }}>
                  Ausgewählter Beitrag
                </p>
                <p style={{ margin: 0, color: "var(--text-primary)", lineHeight: 1.5, fontSize: 13 }}>
                  {selectedPost.text?.slice(0, 200)}{(selectedPost.text?.length ?? 0) > 200 ? "…" : ""}
                </p>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {destCandidates.map((acc) => {
                  const isSel = destinations.includes(acc.id);
                  const c = COLORS[acc.platform];
                  const status = statuses[acc.id];
                  return (
                    <button
                      key={acc.id}
                      onClick={() => !posting && toggleDest(acc.id)}
                      disabled={posting}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "8px 14px",
                        borderRadius: 10,
                        border: `2px solid ${isSel ? c : "var(--border)"}`,
                        background: isSel ? c + "22" : "var(--surface)",
                        color: isSel ? c : "var(--text-primary)",
                        cursor: posting ? "not-allowed" : "pointer",
                        fontSize: 13,
                        fontWeight: isSel ? 600 : 400,
                        transition: "all 0.15s",
                      }}
                    >
                      <span style={{
                        width: 8, height: 8, borderRadius: "50%",
                        background: isSel ? c : "var(--overlay1)",
                        flexShrink: 0,
                      }} />
                      <span>{LABELS[acc.platform]}</span>
                      <span style={{ opacity: 0.6, fontSize: 12 }}>{acc.display_name}</span>
                      {status === "posting" && <Loader size={12} style={{ animation: "spin 1s linear infinite" }} />}
                      {status === "done" && <CheckCircle size={12} style={{ color: "#22c55e" }} />}
                      {status === "error" && <AlertCircle size={12} style={{ color: "#f87171" }} />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Publish button */}
      {selectedPost && destinations.length > 0 && (
        <div style={{ paddingLeft: 42, paddingBottom: 32 }}>
          <button
            onClick={handlePost}
            disabled={posting}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "12px 24px",
              borderRadius: 12,
              border: "none",
              background: posting ? "var(--overlay0)" : "#22c55e",
              color: "#fff",
              cursor: posting ? "not-allowed" : "pointer",
              fontSize: 14,
              fontWeight: 700,
              boxShadow: posting ? "none" : "0 4px 16px #22c55e44",
              transition: "all 0.2s",
            }}
          >
            {posting ? <Loader size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Send size={16} />}
            {posting
              ? "Wird gepostet…"
              : `Auf ${destinations.length} Kanal${destinations.length > 1 ? "en" : ""} posten`}
          </button>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
