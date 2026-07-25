import { useState, useRef } from "react";
import {
  Wand2, Send, Loader, CheckCircle, XCircle, Calendar, Clock,
  RefreshCw, Hash, Image, X, Briefcase, Coffee, Laugh, Zap,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useAccountsStore } from "../../store/accounts";
import toast from "react-hot-toast";

// ─── Types ───────────────────────────────────────────────────────────────────

type PostMode = "now" | "schedule";
type Tone = "professionell" | "casual" | "witzig" | "inspirierend";

interface GeneratedContent {
  platform: string;
  content: string;
  status: "idle" | "generating" | "ready" | "posting" | "done" | "error";
  error?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PLATFORMS = [
  { id: "instagram", label: "Instagram", color: "#E1306C" },
  { id: "facebook",  label: "Facebook",  color: "#1877F2" },
  { id: "linkedin",  label: "LinkedIn",  color: "#0A66C2" },
  { id: "twitter",   label: "Twitter/X", color: "#1DA1F2" },
  { id: "telegram",  label: "Telegram",  color: "#2AABEE" },
  { id: "email",     label: "E-Mail",    color: "#EA4335" },
];

const TONES: { id: Tone; label: string; icon: React.ElementType }[] = [
  { id: "professionell", label: "Professionell", icon: Briefcase },
  { id: "casual",        label: "Casual",        icon: Coffee    },
  { id: "witzig",        label: "Witzig",         icon: Laugh     },
  { id: "inspirierend",  label: "Inspirierend",  icon: Zap       },
];

const TEMPLATES = [
  { label: "Produkt-Launch", emoji: "🚀", text: "Wir launchen heute unser neues Produkt [NAME]. Es löst [PROBLEM] und bietet [VORTEILE]." },
  { label: "Event",          emoji: "📅", text: "Wir laden Sie herzlich zu unserem Event [NAME] am [DATUM] in [ORT] ein." },
  { label: "Stellenangebot", emoji: "💼", text: "Wir suchen einen [POSITION] für unser Team in [STADT]. Wenn Sie [FÄHIGKEITEN] mitbringen, freuen wir uns auf Ihre Bewerbung." },
  { label: "Tipp des Tages", emoji: "💡", text: "Tipp des Tages: [TIPP]. Probieren Sie es aus und teilen Sie Ihre Erfahrungen!" },
  { label: "Firmenjubiläum", emoji: "🎉", text: "Heute feiern wir unser [ZAHL]-jähriges Firmenjubiläum. Danke an alle Kunden und Partner!" },
  { label: "Kundenstimme",   emoji: "⭐", text: "Unser Kunde sagt: '[ZITAT]'. Danke für das tolle Feedback!" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function localDatetimeValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultScheduled(): string {
  const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0);
  return localDatetimeValue(d);
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AICreatePost() {
  const accounts = useAccountsStore((s) => s.accounts);

  // Input state
  const [topic, setTopic]             = useState("");
  const [tone, setTone]               = useState<Tone>("professionell");
  const [hashtags, setHashtags]       = useState(true);
  const [mediaPath, setMediaPath]     = useState<string | null>(null);
  const [mediaName, setMediaName]     = useState<string | null>(null);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);

  // Generation state
  const [generated, setGenerated]     = useState<GeneratedContent[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  // Publish state
  const [postMode, setPostMode]       = useState<PostMode>("now");
  const [scheduledAt, setScheduledAt] = useState<string>(defaultScheduled());

  const connectedPlatforms = PLATFORMS.filter((p) =>
    accounts.some((a) => a.platform === p.id && a.status === "connected")
  );

  const togglePlatform = (id: string) =>
    setSelectedPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );

  // ── Generate (all or single platform) ──────────────────────────────────────

  const generateForPlatform = async (platform: string): Promise<void> => {
    setGenerated((prev) =>
      prev.map((g) => g.platform === platform ? { ...g, status: "generating", error: undefined } : g)
    );
    try {
      const result = await invoke<{ success: boolean; content: string; error?: string }>(
        "generate_ai_content",
        { platform, prompt: topic, tone, hashtags }
      );
      setGenerated((prev) =>
        prev.map((g) =>
          g.platform === platform
            ? { ...g, content: result.success ? result.content : "", status: result.success ? "ready" : "error", error: result.error }
            : g
        )
      );
    } catch (e: any) {
      setGenerated((prev) =>
        prev.map((g) => g.platform === platform ? { ...g, status: "error", error: e.message } : g)
      );
    }
  };

  const generateContent = async () => {
    if (!topic.trim() || selectedPlatforms.length === 0) return;
    setIsGenerating(true);
    setGenerated(selectedPlatforms.map((p) => ({ platform: p, content: "", status: "generating" as const })));
    await Promise.all(selectedPlatforms.map(generateForPlatform));
    setIsGenerating(false);
  };

  // ── Media picker ────────────────────────────────────────────────────────────

  const pickMedia = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "Bild/Video", extensions: ["jpg","jpeg","png","gif","mp4","mov","webp"] }],
      });
      if (selected && typeof selected === "string") {
        setMediaPath(selected);
        setMediaName(selected.split(/[/\\]/).pop() ?? selected);
      }
    } catch {
      toast.error("Datei konnte nicht geöffnet werden.");
    }
  };

  // ── Post all ────────────────────────────────────────────────────────────────

  const postAll = async () => {
    if (postMode === "schedule") {
      const isoAt = new Date(scheduledAt).toISOString();
      for (const item of generated) {
        if (item.status !== "ready") continue;
        const account = accounts.find((a) => a.platform === item.platform && a.status === "connected");
        if (!account) continue;
        try {
          await invoke("create_scheduled_post", {
            content: item.content,
            platforms: [item.platform],
            accountIds: [account.id],
            scheduledAt: isoAt,
          });
          setGenerated((prev) =>
            prev.map((g) => (g.platform === item.platform ? { ...g, status: "done" } : g))
          );
        } catch (e: any) {
          setGenerated((prev) =>
            prev.map((g) => (g.platform === item.platform ? { ...g, status: "error", error: e.message } : g))
          );
        }
      }
      toast.success(`Geplant für ${new Date(scheduledAt).toLocaleString("de-DE")}`);
      return;
    }

    for (const item of generated) {
      if (item.status !== "ready") continue;
      setGenerated((prev) =>
        prev.map((g) => (g.platform === item.platform ? { ...g, status: "posting" } : g))
      );
      try {
        const account = accounts.find((a) => a.platform === item.platform && a.status === "connected");
        if (!account) throw new Error("Kein verbundenes Konto");
        await invoke("post_content", {
          accountId: account.id,
          platform: item.platform,
          content: item.content,
          mediaPath: mediaPath ?? undefined,
        });
        setGenerated((prev) =>
          prev.map((g) => (g.platform === item.platform ? { ...g, status: "done" } : g))
        );
        toast.success(`Auf ${item.platform} veröffentlicht!`);
      } catch (e: any) {
        setGenerated((prev) =>
          prev.map((g) => (g.platform === item.platform ? { ...g, status: "error", error: e.message } : g))
        );
        toast.error(`Fehler bei ${item.platform}: ${e.message}`);
      }
    }
  };

  const readyCount = generated.filter((g) => g.status === "ready").length;

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto space-y-5">

      {/* ── Input card ── */}
      <div className="rounded-xl p-5 space-y-4" style={{ background: "var(--mantle)", border: "1px solid var(--surface0)" }}>

        {/* Templates */}
        <div>
          <p className="text-xs font-medium mb-2" style={{ color: "var(--overlay0)" }}>VORLAGE WÄHLEN</p>
          <div className="flex flex-wrap gap-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.label}
                onClick={() => setTopic(t.text)}
                className="px-3 py-1 rounded-full text-xs transition-all"
                style={{ background: "var(--surface0)", color: "var(--subtext1)", border: "1px solid var(--surface1)" }}
              >
                {t.emoji} {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Topic textarea */}
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: "var(--subtext1)" }}>
            Thema oder Idee
          </label>
          <textarea
            rows={3}
            placeholder="z.B. Wir haben heute unser 5-jähriges Jubiläum gefeiert..."
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            style={{
              background: "var(--surface0)", border: "1px solid var(--surface1)",
              borderRadius: 8, padding: "10px 14px", color: "var(--text)", width: "100%", resize: "none",
            }}
          />
        </div>

        {/* Tone + Hashtags + Media row */}
        <div className="flex flex-wrap gap-3 items-center">
          {/* Tone selector */}
          <div>
            <p className="text-xs font-medium mb-1.5" style={{ color: "var(--overlay0)" }}>TON</p>
            <div className="flex gap-1" style={{ background: "var(--surface0)", borderRadius: 8, padding: 3 }}>
              {TONES.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setTone(id)}
                  title={label}
                  style={{
                    display: "flex", alignItems: "center", gap: 4,
                    padding: "5px 10px", borderRadius: 6, fontSize: 12,
                    fontWeight: tone === id ? 600 : 400,
                    background: tone === id ? "var(--base)" : "transparent",
                    color: tone === id ? "var(--text)" : "var(--overlay1)",
                    border: "none", cursor: "pointer",
                    boxShadow: tone === id ? "0 1px 4px rgba(0,0,0,0.2)" : "none",
                    transition: "all 0.15s",
                  }}
                >
                  <Icon size={12} /> {label}
                </button>
              ))}
            </div>
          </div>

          {/* Hashtag toggle */}
          <div style={{ marginTop: 18 }}>
            <button
              onClick={() => setHashtags((v) => !v)}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "7px 12px", borderRadius: 8, fontSize: 12,
                background: hashtags ? "var(--blue)22" : "var(--surface0)",
                color: hashtags ? "var(--blue)" : "var(--overlay1)",
                border: `1px solid ${hashtags ? "var(--blue)44" : "var(--surface1)"}`,
                cursor: "pointer", transition: "all 0.15s",
              }}
            >
              <Hash size={13} /> Hashtags
            </button>
          </div>

          {/* Media picker */}
          <div style={{ marginTop: 18 }}>
            {mediaPath ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 8, background: "var(--surface0)", border: "1px solid var(--surface1)", fontSize: 12, color: "var(--subtext1)" }}>
                <Image size={13} style={{ color: "var(--green)", flexShrink: 0 }} />
                <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{mediaName}</span>
                <button onClick={() => { setMediaPath(null); setMediaName(null); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--overlay1)", padding: 0, display: "flex" }}>
                  <X size={12} />
                </button>
              </div>
            ) : (
              <button
                onClick={pickMedia}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "7px 12px", borderRadius: 8, fontSize: 12,
                  background: "var(--surface0)", color: "var(--overlay1)",
                  border: "1px solid var(--surface1)", cursor: "pointer", transition: "all 0.15s",
                }}
              >
                <Image size={13} /> Bild/Video
              </button>
            )}
          </div>
        </div>

        {/* Platform selector */}
        <div>
          <p className="text-xs font-medium mb-1.5" style={{ color: "var(--overlay0)" }}>PLATTFORMEN</p>
          {connectedPlatforms.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--overlay0)" }}>Keine verbundenen Konten. Bitte fügen Sie zuerst Konten hinzu.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {connectedPlatforms.map((p) => (
                <button
                  key={p.id}
                  onClick={() => togglePlatform(p.id)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                  style={{
                    background: selectedPlatforms.includes(p.id) ? p.color : "var(--surface0)",
                    color: selectedPlatforms.includes(p.id) ? "white" : "var(--subtext0)",
                    border: `1px solid ${selectedPlatforms.includes(p.id) ? p.color : "var(--surface1)"}`,
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Generate button */}
        <button
          onClick={generateContent}
          disabled={!topic.trim() || selectedPlatforms.length === 0 || isGenerating}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
          style={{ background: "var(--blue)", color: "var(--crust)" }}
        >
          {isGenerating ? <Loader size={15} className="animate-spin" /> : <Wand2 size={15} />}
          {isGenerating ? "KI generiert..." : "Inhalte generieren"}
        </button>
      </div>

      {/* ── Generated content ── */}
      {generated.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-medium" style={{ color: "var(--text)" }}>Generierte Inhalte</h3>

            {readyCount > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                {/* Jetzt / Planen */}
                <div style={{ display: "flex", background: "var(--surface0)", borderRadius: 10, padding: 3, gap: 2 }}>
                  {([
                    { id: "now",      icon: Send,     label: "Jetzt" },
                    { id: "schedule", icon: Calendar, label: "Planen" },
                  ] as const).map(({ id, icon: Icon, label }) => (
                    <button
                      key={id}
                      onClick={() => setPostMode(id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 5,
                        padding: "6px 12px", borderRadius: 8, fontSize: 12,
                        fontWeight: postMode === id ? 600 : 400,
                        background: postMode === id ? "var(--base)" : "transparent",
                        color: postMode === id ? "var(--text)" : "var(--overlay1)",
                        border: "none", cursor: "pointer",
                        boxShadow: postMode === id ? "0 1px 4px rgba(0,0,0,0.2)" : "none",
                      }}
                    >
                      <Icon size={12} /> {label}
                    </button>
                  ))}
                </div>

                {postMode === "schedule" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Clock size={13} style={{ color: "var(--overlay1)" }} />
                    <input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      min={localDatetimeValue(new Date())}
                      style={{
                        background: "var(--surface0)", border: "1px solid var(--surface1)",
                        borderRadius: 8, color: "var(--text)", padding: "5px 10px", fontSize: 12,
                      }}
                    />
                  </div>
                )}

                <button
                  onClick={postAll}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
                  style={{ background: postMode === "schedule" ? "var(--blue)" : "var(--green)", color: "var(--crust)" }}
                >
                  {postMode === "schedule" ? <Calendar size={14} /> : <Send size={14} />}
                  {postMode === "schedule" ? `Planen (${readyCount})` : `Alle veröffentlichen (${readyCount})`}
                </button>
              </div>
            )}
          </div>

          {generated.map((item) => {
            const platform = PLATFORMS.find((p) => p.id === item.platform)!;
            return (
              <div
                key={item.platform}
                className="rounded-xl p-4"
                style={{ background: "var(--mantle)", border: "1px solid var(--surface0)" }}
              >
                <div className="flex items-center justify-between mb-3">
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: platform.color + "20", color: platform.color }}
                  >
                    {platform.label}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <StatusBadge status={item.status} />
                    {(item.status === "ready" || item.status === "error") && (
                      <button
                        onClick={() => generateForPlatform(item.platform)}
                        title="Neu generieren"
                        style={{
                          display: "flex", alignItems: "center", gap: 4,
                          padding: "3px 8px", borderRadius: 6, fontSize: 11,
                          background: "var(--surface0)", color: "var(--overlay1)",
                          border: "1px solid var(--surface1)", cursor: "pointer",
                        }}
                      >
                        <RefreshCw size={11} /> Neu
                      </button>
                    )}
                  </div>
                </div>

                {item.status === "generating" && (
                  <div className="flex items-center gap-2" style={{ color: "var(--overlay0)" }}>
                    <Loader size={14} className="animate-spin" />
                    <span className="text-sm">KI schreibt...</span>
                  </div>
                )}

                {(item.status === "ready" || item.status === "posting" || item.status === "done") && (
                  <>
                    <textarea
                      rows={4}
                      value={item.content}
                      onChange={(e) =>
                        setGenerated((prev) =>
                          prev.map((g) =>
                            g.platform === item.platform ? { ...g, content: e.target.value } : g
                          )
                        )
                      }
                      style={{
                        background: "var(--surface0)", border: "1px solid var(--surface1)",
                        borderRadius: 8, padding: "10px 14px", color: "var(--text)",
                        width: "100%", resize: "vertical",
                      }}
                    />
                    <div style={{ fontSize: 11, color: "var(--overlay0)", marginTop: 4, textAlign: "right" }}>
                      {item.content.length} Zeichen
                    </div>
                  </>
                )}

                {item.status === "error" && (
                  <p className="text-sm" style={{ color: "var(--red)" }}>Fehler: {item.error}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: GeneratedContent["status"] }) {
  const map: Record<string, { label: string; color: string }> = {
    idle:       { label: "",               color: "var(--overlay0)" },
    generating: { label: "Generiert...",   color: "var(--yellow)"  },
    ready:      { label: "Bereit",         color: "var(--green)"   },
    posting:    { label: "Sendet...",      color: "var(--blue)"    },
    done:       { label: "Veröffentlicht", color: "var(--green)"   },
    error:      { label: "Fehler",         color: "var(--red)"     },
  };
  const { label, color } = map[status] ?? { label: "", color: "" };
  if (!label) return null;
  return (
    <span className="text-xs font-medium" style={{ color }}>
      {status === "done"  && <CheckCircle size={12} className="inline mr-1" />}
      {status === "error" && <XCircle     size={12} className="inline mr-1" />}
      {label}
    </span>
  );
}
