import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Download, Send, Loader, AlertCircle, CheckCircle } from "lucide-react";
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

// Platforms that support reading posts as source
const SOURCE_CAPABLE = ["instagram", "linkedin", "facebook"];

interface RemotePost {
  id: string;
  text: string;
  media_url?: string;
  created_at?: string;
}

type PostingStatus = "idle" | "posting" | "done" | "error";

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
        toast.error(`Fehler bei ${accounts.find((a) => a.id === id)?.name ?? id}: ${e}`);
      }
    }
    setPosting(false);
    const allDone = destinations.every((id) => statuses[id] === "done" || next[id] === "done");
    if (allDone) toast.success("Alle Beiträge veröffentlicht!");
  };

  const sourceAccount = accounts.find((a) => a.id === sourceId);

  return (
    <div className="space-y-6">
      {/* Step 1: Source */}
      <section>
        <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
          1. Quelle wählen
        </h3>
        {sources.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">
            Kein unterstützter Quell-Account verbunden (Instagram, LinkedIn, Facebook).
          </p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {sources.map((acc) => {
              const isSelected = sourceId === acc.id;
              return (
                <button
                  key={acc.id}
                  onClick={() => selectSource(acc.id)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border-2 transition-all"
                  style={{
                    borderColor: isSelected ? COLORS[acc.platform] : "var(--border)",
                    background: isSelected ? COLORS[acc.platform] + "22" : "var(--surface)",
                    color: isSelected ? COLORS[acc.platform] : "var(--text-primary)",
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: COLORS[acc.platform] }}
                  />
                  <span className="font-medium text-sm">{LABELS[acc.platform]}</span>
                  <span className="text-xs opacity-70">{acc.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Step 2: Load posts */}
      {sourceId && (
        <section>
          <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
            2. Beiträge laden
          </h3>
          <button
            onClick={loadPosts}
            disabled={loadingPosts}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all"
            style={{
              background: COLORS[sourceAccount?.platform ?? ""] + "cc",
              color: "#fff",
              opacity: loadingPosts ? 0.7 : 1,
            }}
          >
            {loadingPosts ? <Loader size={15} className="animate-spin" /> : <Download size={15} />}
            {loadingPosts ? "Lade..." : "Beiträge laden"}
          </button>

          {loadError && (
            <div className="mt-3 flex items-start gap-2 text-sm text-red-400">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span>{loadError}</span>
            </div>
          )}

          {remotePosts.length > 0 && (
            <div className="mt-3 space-y-2 max-h-64 overflow-y-auto pr-1">
              {remotePosts.map((post) => (
                <button
                  key={post.id}
                  onClick={() => setSelectedPost(post)}
                  className="w-full text-left px-4 py-3 rounded-xl border-2 transition-all text-sm"
                  style={{
                    borderColor: selectedPost?.id === post.id ? COLORS[sourceAccount?.platform ?? ""] : "var(--border)",
                    background: selectedPost?.id === post.id ? COLORS[sourceAccount?.platform ?? ""] + "18" : "var(--surface)",
                  }}
                >
                  <p className="line-clamp-3 text-[var(--text-primary)]">
                    {post.text || <span className="italic text-[var(--text-secondary)]">[Kein Text]</span>}
                  </p>
                  {post.created_at && (
                    <p className="text-xs text-[var(--text-secondary)] mt-1">{post.created_at}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Step 3: Destinations */}
      {selectedPost && (
        <section>
          <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
            3. Ziele wählen
          </h3>
          {destCandidates.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">Keine weiteren Konten verbunden.</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {destCandidates.map((acc) => {
                const isSelected = destinations.includes(acc.id);
                const status = statuses[acc.id];
                return (
                  <button
                    key={acc.id}
                    onClick={() => !posting && toggleDest(acc.id)}
                    disabled={posting}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl border-2 transition-all"
                    style={{
                      borderColor: isSelected ? COLORS[acc.platform] : "var(--border)",
                      background: isSelected ? COLORS[acc.platform] + "22" : "var(--surface)",
                      color: isSelected ? COLORS[acc.platform] : "var(--text-primary)",
                    }}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: isSelected ? "#22c55e" : "var(--text-secondary)" }}
                    />
                    <span className="font-medium text-sm">{LABELS[acc.platform]}</span>
                    <span className="text-xs opacity-70">{acc.name}</span>
                    {status === "posting" && <Loader size={12} className="animate-spin" />}
                    {status === "done" && <CheckCircle size={12} className="text-green-400" />}
                    {status === "error" && <AlertCircle size={12} className="text-red-400" />}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Selected post preview */}
      {selectedPost && (
        <section className="rounded-xl border border-[var(--border)] p-4 bg-[var(--surface)]">
          <p className="text-xs text-[var(--text-secondary)] mb-2 uppercase tracking-wider">Ausgewählter Beitrag</p>
          <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap">{selectedPost.text}</p>
        </section>
      )}

      {/* Publish button */}
      {selectedPost && destinations.length > 0 && (
        <button
          onClick={handlePost}
          disabled={posting}
          className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm text-white transition-all"
          style={{ background: posting ? "#555" : "#22c55e", cursor: posting ? "not-allowed" : "pointer" }}
        >
          {posting ? <Loader size={16} className="animate-spin" /> : <Send size={16} />}
          {posting ? "Wird gepostet..." : `Auf ${destinations.length} Kanal${destinations.length > 1 ? "en" : ""} posten`}
        </button>
      )}
    </div>
  );
}
