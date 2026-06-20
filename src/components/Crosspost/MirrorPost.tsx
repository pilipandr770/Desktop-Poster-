import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Send, Loader, Image, X, CheckCircle, AlertCircle, Clock, Calendar } from "lucide-react";
import { useAccountsStore } from "../../store/accounts";
import toast from "react-hot-toast";

const LABELS: Record<string, string> = {
  instagram: "Instagram", facebook: "Facebook", whatsapp: "WhatsApp",
  linkedin: "LinkedIn", twitter: "Twitter/X", telegram: "Telegram", email: "E-Mail",
};

const COLORS: Record<string, string> = {
  instagram: "#E1306C", facebook: "#1877F2", whatsapp: "#25D366",
  linkedin: "#0A66C2",  twitter:  "#1DA1F2", telegram: "#2AABEE", email: "#EA4335",
};

const LIMITS: Record<string, number> = { twitter: 280, instagram: 2200, linkedin: 3000 };

type PostStatus = "idle" | "posting" | "done" | "error";
type PostMode = "now" | "schedule";

// Returns "YYYY-MM-DDTHH:MM" in local time for datetime-local input
function localDatetimeValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function MirrorPost() {
  const accounts = useAccountsStore((s) => s.accounts);
  const connected = accounts.filter((a) => a.status === "connected");

  const [targets, setTargets]     = useState<string[]>([]);
  const [content, setContent]     = useState("");
  const [mediaPath, setMediaPath] = useState("");
  const [posting, setPosting]     = useState(false);
  const [results, setResults]     = useState<Record<string, PostStatus>>({});
  const [postMode, setPostMode]   = useState<PostMode>("now");
  // Default scheduled time: tomorrow at 10:00
  const defaultScheduled = () => {
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0);
    return localDatetimeValue(d);
  };
  const [scheduledAt, setScheduledAt] = useState<string>(defaultScheduled());

  const toggle = (id: string) =>
    setTargets((p) => p.includes(id) ? p.filter((a) => a !== id) : [...p, id]);

  const handlePost = async () => {
    if (!content.trim() || targets.length === 0) return;

    if (postMode === "schedule") {
      // Schedule post
      const isoAt = new Date(scheduledAt).toISOString();
      const platforms = [...new Set(targets.map(id => accounts.find(a => a.id === id)?.platform).filter(Boolean) as string[])];
      try {
        await invoke("create_scheduled_post", {
          content,
          platforms,
          accountIds: targets,
          scheduledAt: isoAt,
        });
        toast.success(`Geplant für ${new Date(scheduledAt).toLocaleString("de-DE")}`);
        setContent("");
        setTargets([]);
        setResults({});
      } catch (e: any) {
        toast.error(`Planungsfehler: ${e}`);
      }
      return;
    }

    // Post now
    setPosting(true);
    setResults(Object.fromEntries(targets.map((id) => [id, "posting"])));

    for (const accountId of targets) {
      try {
        await invoke("post_content", { accountId, content, mediaPath: mediaPath || null });
        setResults((p) => ({ ...p, [accountId]: "done" }));
        toast.success(`✓ ${accounts.find((a) => a.id === accountId)?.display_name}`);
      } catch (e: any) {
        setResults((p) => ({ ...p, [accountId]: "error" }));
        toast.error(`✗ ${accounts.find((a) => a.id === accountId)?.display_name}: ${e}`);
      }
    }
    setPosting(false);
  };

  const openMedia = async () => {
    try {
      const f = await openDialog({ multiple: false, filters: [{ name: "Medien", extensions: ["jpg","jpeg","png","gif","webp","mp4","mov"] }] });
      if (f) setMediaPath(f as string);
    } catch { toast.error("Datei-Dialog fehlgeschlagen"); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Text input */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <textarea
          rows={6}
          placeholder="Was möchten Sie veröffentlichen?"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          style={{
            border: "none",
            borderRadius: 0,
            background: "transparent",
            padding: "16px 18px",
            fontSize: 14,
            resize: "none",
            minHeight: 140,
          }}
        />

        {/* Footer bar */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          borderTop: "1.5px solid var(--surface0)",
          background: "var(--base)",
          gap: 12,
          flexWrap: "wrap",
        }}>
          {/* Character counters */}
          <div style={{ display: "flex", gap: 14 }}>
            {Object.entries(LIMITS).map(([p, limit]) => {
              const over = content.length > limit;
              return (
                <span key={p} style={{ fontSize: 12, color: over ? "var(--red)" : "var(--overlay0)" }}>
                  {LABELS[p]}: <strong style={{ color: over ? "var(--red)" : "var(--subtext0)" }}>{content.length}</strong>/{limit}
                </span>
              );
            })}
          </div>

          {/* Media button */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {mediaPath && (
              <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 6, background: "var(--green)15", border: "1px solid var(--green)30" }}>
                <span style={{ fontSize: 12, color: "var(--green)" }}>
                  ✓ {mediaPath.split(/[/\\]/).pop()}
                </span>
                <button onClick={() => setMediaPath("")} style={{ color: "var(--overlay0)", display: "flex" }}>
                  <X size={11} />
                </button>
              </div>
            )}
            <button onClick={openMedia} className="btn btn-sm btn-ghost">
              <Image size={13} />
              Bild / Video
            </button>
          </div>
        </div>
      </div>

      {/* Target accounts */}
      <div>
        <div className="section-label">Veröffentlichen auf</div>

        {connected.length === 0 ? (
          <div className="card empty-state" style={{ padding: "32px 20px" }}>
            <p>Keine verbundenen Konten</p>
            <span>Bitte fügen Sie Konten unter "Konten" hinzu.</span>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
            {connected.map((account) => {
              const selected = targets.includes(account.id);
              const color    = COLORS[account.platform] || "var(--blue)";
              const status   = results[account.id];

              return (
                <button
                  key={account.id}
                  onClick={() => !posting && toggle(account.id)}
                  disabled={posting}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "11px 14px",
                    borderRadius: 10,
                    textAlign: "left",
                    background: selected ? color + "18" : "var(--mantle)",
                    border: `1.5px solid ${selected ? color : "var(--surface0)"}`,
                    cursor: posting ? "default" : "pointer",
                    transition: "all 0.15s",
                    boxShadow: selected ? `0 0 0 2px ${color}22` : "none",
                  }}
                >
                  <div style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    background: color + "22",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    fontSize: 13,
                    fontWeight: 700,
                    color,
                  }}>
                    {LABELS[account.platform]?.[0] ?? "?"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {account.display_name}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--overlay1)" }}>
                      {LABELS[account.platform]}
                    </div>
                  </div>
                  {status === "posting" && <Loader size={14} className="animate-spin" style={{ color: "var(--blue)", flexShrink: 0 }} />}
                  {status === "done"    && <CheckCircle size={14} style={{ color: "var(--green)", flexShrink: 0 }} />}
                  {status === "error"   && <AlertCircle size={14} style={{ color: "var(--red)",   flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Jetzt / Planen switcher */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{
          display: "flex",
          background: "var(--surface0)",
          borderRadius: 10,
          padding: 3,
          gap: 2,
          alignSelf: "flex-start",
        }}>
          {([
            { id: "now",      icon: Send,     label: "Jetzt" },
            { id: "schedule", icon: Calendar, label: "Planen" },
          ] as const).map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setPostMode(id)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "7px 14px", borderRadius: 8, fontSize: 13,
                fontWeight: postMode === id ? 600 : 400,
                background: postMode === id ? "var(--base)" : "transparent",
                color: postMode === id ? "var(--text)" : "var(--overlay1)",
                border: "none", cursor: "pointer",
                boxShadow: postMode === id ? "0 1px 4px rgba(0,0,0,0.2)" : "none",
                transition: "all 0.15s",
              }}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>

        {postMode === "schedule" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Clock size={14} style={{ color: "var(--overlay1)", flexShrink: 0 }} />
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              min={localDatetimeValue(new Date())}
              style={{
                background: "var(--surface0)",
                border: "1px solid var(--surface1)",
                borderRadius: 8,
                color: "var(--text)",
                padding: "7px 12px",
                fontSize: 13,
              }}
            />
          </div>
        )}
      </div>

      {/* Post button */}
      <button
        onClick={handlePost}
        disabled={!content.trim() || targets.length === 0 || posting}
        className="btn btn-primary btn-lg"
        style={{ alignSelf: "flex-start" }}
      >
        {posting ? <Loader size={16} className="animate-spin" /> : postMode === "schedule" ? <Calendar size={16} /> : <Send size={16} />}
        {posting
          ? `Veröffentliche auf ${targets.length} Plattformen…`
          : targets.length === 0
            ? "Plattformen auswählen"
            : postMode === "schedule"
              ? `Planen auf ${targets.length} Plattform${targets.length > 1 ? "en" : ""}`
              : `Auf ${targets.length} Plattform${targets.length > 1 ? "en" : ""} veröffentlichen`}
      </button>
    </div>
  );
}
