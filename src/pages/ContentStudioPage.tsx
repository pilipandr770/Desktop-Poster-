import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  Wand2, Image, User, Video, Mic, Send, Calendar, Loader,
  RefreshCw, ChevronRight, ChevronLeft, Clock, Check,
  Upload, X, Play, Volume2, Hash,
} from "lucide-react";
import { useAccountsStore } from "../store/accounts";
import toast from "react-hot-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

type StepId = "text" | "image" | "avatar" | "video" | "voice" | "publish";
type PostMode = "now" | "schedule";
type Tone = "professionell" | "casual" | "witzig" | "inspirierend";

interface GenState<T = string> {
  status: "idle" | "loading" | "done" | "error";
  result: T | null;
  error?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORMS = [
  { id: "instagram", label: "Instagram", color: "#E1306C" },
  { id: "facebook",  label: "Facebook",  color: "#1877F2" },
  { id: "linkedin",  label: "LinkedIn",  color: "#0A66C2" },
  { id: "twitter",   label: "Twitter/X", color: "#1DA1F2" },
  { id: "telegram",  label: "Telegram",  color: "#2AABEE" },
  { id: "email",     label: "E-Mail",    color: "#EA4335" },
];

const STEPS: { id: StepId; label: string; icon: React.ElementType; optional?: true }[] = [
  { id: "text",    label: "Text",     icon: Wand2   },
  { id: "image",   label: "Bild",     icon: Image,  optional: true },
  { id: "avatar",  label: "Avatar",   icon: User,   optional: true },
  { id: "video",   label: "Video",    icon: Video,  optional: true },
  { id: "voice",   label: "Stimme",   icon: Mic,    optional: true },
  { id: "publish", label: "Publizieren", icon: Send },
];

const ASPECT_RATIOS = [
  { id: "1:1",  label: "1:1 Feed",    hint: "Instagram / Facebook" },
  { id: "9:16", label: "9:16 Story",  hint: "Reels / Stories" },
  { id: "16:9", label: "16:9 Breit",  hint: "LinkedIn / Twitter" },
  { id: "4:5",  label: "4:5 Portrait",hint: "Instagram Portrait" },
];

const TONES: { id: Tone; label: string }[] = [
  { id: "professionell", label: "Professionell" },
  { id: "casual",        label: "Casual" },
  { id: "witzig",        label: "Witzig" },
  { id: "inspirierend",  label: "Inspirierend" },
];

function localDatetimeValue(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ContentStudioPage() {
  const accounts = useAccountsStore((s) => s.accounts);
  const [step, setStep]   = useState<StepId>("text");
  const stepIdx           = STEPS.findIndex((s) => s.id === step);

  // Text
  const [topic, setTopic]           = useState("");
  const [tone, setTone]             = useState<Tone>("professionell");
  const [hashtags, setHashtags]     = useState(true);
  const [platforms, setPlatforms]   = useState<string[]>([]);
  const [texts, setTexts]           = useState<Record<string, string>>({});
  const [textLoading, setTextLoading] = useState(false);

  // Image
  const [imagePrompt, setImagePrompt]     = useState("");
  const [aspectRatio, setAspectRatio]     = useState("1:1");
  const [imageProvider, setImageProvider] = useState("dalle3");
  const [imageGen, setImageGen]           = useState<GenState>({ status: "idle", result: null });

  // Avatar
  const [avatarText, setAvatarText]       = useState("");
  const [avatarProvider, setAvatarProvider] = useState("heygen");
  const [avatarId, setAvatarId]           = useState("");
  const [voiceId, setVoiceId]             = useState("");
  const [avatars, setAvatars]             = useState<{id:string;name:string}[]>([]);
  const [avatarGen, setAvatarGen]         = useState<GenState>({ status: "idle", result: null });

  // Video
  const [videoPrompt, setVideoPrompt]   = useState("");
  const [videoDuration, setVideoDuration] = useState(5);
  const [videoGen, setVideoGen]         = useState<GenState>({ status: "idle", result: null });

  // Voice
  const [voiceText, setVoiceText]         = useState("");
  const [voiceProvider, setVoiceProvider] = useState("elevenlabs");
  const [voiceVoiceId, setVoiceVoiceId]   = useState("");
  const [voices, setVoices]               = useState<{id:string;name:string}[]>([]);
  const [voiceGen, setVoiceGen]           = useState<GenState>({ status: "idle", result: null });

  // Publish
  const [postMode, setPostMode]     = useState<PostMode>("now");
  const defaultSched = () => { const d = new Date(); d.setDate(d.getDate()+1); d.setHours(10,0,0,0); return localDatetimeValue(d); };
  const [scheduledAt, setScheduledAt] = useState(defaultSched());

  const connectedPlatforms = PLATFORMS.filter((p) =>
    accounts.some((a) => a.platform === p.id && a.status === "connected")
  );

  // Sync derived prompts when topic changes
  useEffect(() => {
    if (topic) {
      setImagePrompt(topic);
      setVideoPrompt(topic);
    }
  }, [topic]);

  // Sync avatar/voice text from generated text
  useEffect(() => {
    const firstText = Object.values(texts)[0] ?? "";
    if (firstText) {
      setAvatarText((v) => v || firstText.slice(0, 500));
      setVoiceText((v) => v || firstText.slice(0, 1000));
    }
  }, [texts]);

  // Load avatars / voices when changing step
  useEffect(() => {
    if (step === "avatar" && avatars.length === 0) {
      invoke<any>("list_avatars", { provider: avatarProvider })
        .then((r) => { if (r.success) setAvatars(r.avatars || []); })
        .catch(() => {});
    }
    if (step === "voice" && voices.length === 0) {
      invoke<any>("list_voices", { provider: voiceProvider })
        .then((r) => { if (r.success) setVoices(r.voices || []); })
        .catch(() => {});
    }
  }, [step, avatarProvider, voiceProvider]);

  // ── Text generation ──────────────────────────────────────────────────────────

  const generateText = async () => {
    if (!topic.trim() || platforms.length === 0) return;
    setTextLoading(true);
    const next: Record<string, string> = {};
    for (const platform of platforms) {
      try {
        const r = await invoke<any>("generate_ai_content", { platform, prompt: topic, tone, hashtags });
        if (r.success) next[platform] = r.content;
      } catch { /* continue */ }
    }
    setTexts(next);
    setTextLoading(false);
  };

  // ── Image generation ─────────────────────────────────────────────────────────

  const generateImage = async () => {
    setImageGen({ status: "loading", result: null });
    try {
      const r = await invoke<any>("generate_image", {
        prompt: imagePrompt, provider: imageProvider, aspectRatio,
      });
      if (r.success) setImageGen({ status: "done", result: r.path });
      else setImageGen({ status: "error", result: null, error: r.error });
    } catch (e: any) {
      setImageGen({ status: "error", result: null, error: e.message });
    }
  };

  // ── Avatar generation ────────────────────────────────────────────────────────

  const generateAvatar = async () => {
    setAvatarGen({ status: "loading", result: null });
    try {
      const r = await invoke<any>("generate_avatar", {
        text: avatarText, provider: avatarProvider,
        avatarId: avatarId || undefined, voiceId: voiceId || undefined,
      });
      if (r.success) setAvatarGen({ status: "done", result: r.path });
      else setAvatarGen({ status: "error", result: null, error: r.error });
    } catch (e: any) {
      setAvatarGen({ status: "error", result: null, error: e.message });
    }
  };

  // ── Video generation ─────────────────────────────────────────────────────────

  const generateVideo = async () => {
    setVideoGen({ status: "loading", result: null });
    try {
      const r = await invoke<any>("generate_video", {
        prompt: videoPrompt,
        imagePath: imageGen.result || undefined,
        duration: videoDuration,
        ratio: aspectRatio === "9:16" ? "720:1280" : "1280:720",
      });
      if (r.success) setVideoGen({ status: "done", result: r.path });
      else setVideoGen({ status: "error", result: null, error: r.error });
    } catch (e: any) {
      setVideoGen({ status: "error", result: null, error: e.message });
    }
  };

  // ── Voice generation ─────────────────────────────────────────────────────────

  const generateVoice = async () => {
    setVoiceGen({ status: "loading", result: null });
    try {
      const r = await invoke<any>("generate_voice", {
        text: voiceText, provider: voiceProvider,
        voiceId: voiceVoiceId || undefined,
      });
      if (r.success) setVoiceGen({ status: "done", result: r.path });
      else setVoiceGen({ status: "error", result: null, error: r.error });
    } catch (e: any) {
      setVoiceGen({ status: "error", result: null, error: e.message });
    }
  };

  // ── Publish ──────────────────────────────────────────────────────────────────

  const publish = async () => {
    const mediaPath = videoGen.result || imageGen.result || undefined;

    if (postMode === "schedule") {
      const isoAt = new Date(scheduledAt).toISOString();
      for (const [platform, content] of Object.entries(texts)) {
        const account = accounts.find((a) => a.platform === platform && a.status === "connected");
        if (!account) continue;
        try {
          await invoke("create_scheduled_post", {
            content, platforms: [platform], accountIds: [account.id], scheduledAt: isoAt,
          });
        } catch (e: any) { toast.error(`${platform}: ${e.message}`); }
      }
      toast.success(`Geplant für ${new Date(scheduledAt).toLocaleString("de-DE")}`);
      return;
    }

    for (const [platform, content] of Object.entries(texts)) {
      const account = accounts.find((a) => a.platform === platform && a.status === "connected");
      if (!account) continue;
      try {
        await invoke("post_content", { accountId: account.id, platform, content, mediaPath });
        toast.success(`✓ ${platform}`);
      } catch (e: any) { toast.error(`${platform}: ${e.message}`); }
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* Step indicator */}
      <div style={{
        display: "flex", alignItems: "center", padding: "14px 20px",
        borderBottom: "1.5px solid var(--surface0)", background: "var(--mantle)",
        gap: 4, flexShrink: 0, overflowX: "auto",
      }}>
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const active = s.id === step;
          const done = STEPS.findIndex((x) => x.id === step) > i;
          return (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button
                onClick={() => setStep(s.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 12px", borderRadius: 8, fontSize: 12,
                  fontWeight: active ? 700 : 400,
                  background: active ? "var(--blue)22" : done ? "var(--green)12" : "transparent",
                  color: active ? "var(--blue)" : done ? "var(--green)" : "var(--overlay1)",
                  border: `1px solid ${active ? "var(--blue)55" : done ? "var(--green)33" : "transparent"}`,
                  cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.15s",
                }}
              >
                {done ? <Check size={12} /> : <Icon size={12} />}
                {s.label}
                {s.optional && !done && <span style={{ fontSize: 9, color: "var(--overlay0)" }}>opt.</span>}
              </button>
              {i < STEPS.length - 1 && <ChevronRight size={12} style={{ color: "var(--surface1)", flexShrink: 0 }} />}
            </div>
          );
        })}
      </div>

      {/* Step content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", maxWidth: 760, width: "100%" }}>

        {/* ── TEXT ── */}
        {step === "text" && (
          <div className="space-y-4">
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>📝 Inhalt erstellen</h2>
            <div style={{ background: "var(--mantle)", border: "1px solid var(--surface0)", borderRadius: 12, padding: 18 }} className="space-y-4">
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--overlay0)", display: "block", marginBottom: 6 }}>THEMA / IDEE</label>
                <textarea rows={3} value={topic} onChange={(e) => setTopic(e.target.value)}
                  placeholder="z.B. Wir haben heute unser 5-jähriges Jubiläum gefeiert…"
                  style={{ background: "var(--surface0)", border: "1px solid var(--surface1)", borderRadius: 8, padding: "10px 14px", color: "var(--text)", width: "100%", resize: "none" }} />
              </div>

              {/* Tone */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--overlay0)", display: "block", marginBottom: 6 }}>TON</label>
                <div style={{ display: "flex", gap: 6 }}>
                  {TONES.map((t) => (
                    <button key={t.id} onClick={() => setTone(t.id)}
                      style={{ padding: "5px 12px", borderRadius: 99, fontSize: 12,
                        background: tone === t.id ? "var(--blue)" : "var(--surface0)",
                        color: tone === t.id ? "var(--crust)" : "var(--subtext0)",
                        border: "none", cursor: "pointer", fontWeight: tone === t.id ? 600 : 400 }}>
                      {t.label}
                    </button>
                  ))}
                  <button onClick={() => setHashtags((v) => !v)}
                    style={{ padding: "5px 12px", borderRadius: 99, fontSize: 12, display: "flex", alignItems: "center", gap: 4,
                      background: hashtags ? "var(--blue)22" : "var(--surface0)",
                      color: hashtags ? "var(--blue)" : "var(--overlay1)",
                      border: `1px solid ${hashtags ? "var(--blue)44" : "var(--surface1)"}`, cursor: "pointer" }}>
                    <Hash size={11} /> Hashtags
                  </button>
                </div>
              </div>

              {/* Platforms */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--overlay0)", display: "block", marginBottom: 6 }}>PLATTFORMEN</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {connectedPlatforms.map((p) => {
                    const sel = platforms.includes(p.id);
                    return (
                      <button key={p.id}
                        onClick={() => setPlatforms((prev) => sel ? prev.filter((x) => x !== p.id) : [...prev, p.id])}
                        style={{ padding: "5px 14px", borderRadius: 99, fontSize: 12, fontWeight: sel ? 600 : 400,
                          background: sel ? p.color : "var(--surface0)", color: sel ? "white" : "var(--subtext0)",
                          border: `1px solid ${sel ? p.color : "var(--surface1)"}`, cursor: "pointer" }}>
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button onClick={generateText} disabled={!topic.trim() || platforms.length === 0 || textLoading}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                  background: "var(--blue)", color: "var(--crust)", border: "none", cursor: "pointer", opacity: (!topic.trim() || platforms.length === 0) ? 0.5 : 1 }}>
                {textLoading ? <Loader size={14} className="animate-spin" /> : <Wand2 size={14} />}
                {textLoading ? "Generiert…" : "Texte generieren"}
              </button>
            </div>

            {/* Generated texts */}
            {Object.entries(texts).map(([platform, content]) => {
              const p = PLATFORMS.find((x) => x.id === platform)!;
              return (
                <div key={platform} style={{ background: "var(--mantle)", border: "1px solid var(--surface0)", borderRadius: 12, padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: p.color + "22", color: p.color }}>{p.label}</span>
                    <button onClick={async () => {
                      const r = await invoke<any>("generate_ai_content", { platform, prompt: topic, tone, hashtags });
                      if (r.success) setTexts((prev) => ({ ...prev, [platform]: r.content }));
                    }} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, padding: "3px 8px", borderRadius: 6,
                      background: "var(--surface0)", color: "var(--overlay1)", border: "1px solid var(--surface1)", cursor: "pointer" }}>
                      <RefreshCw size={11} /> Neu
                    </button>
                  </div>
                  <textarea rows={4} value={content}
                    onChange={(e) => setTexts((prev) => ({ ...prev, [platform]: e.target.value }))}
                    style={{ width: "100%", background: "var(--surface0)", border: "1px solid var(--surface1)", borderRadius: 8, padding: "10px 12px", color: "var(--text)", resize: "vertical" }} />
                  <div style={{ fontSize: 11, color: "var(--overlay0)", textAlign: "right", marginTop: 4 }}>{content.length} Zeichen</div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── IMAGE ── */}
        {step === "image" && (
          <div className="space-y-4">
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>🖼️ Bild generieren</h2>
            <div style={{ background: "var(--mantle)", border: "1px solid var(--surface0)", borderRadius: 12, padding: 18 }} className="space-y-4">
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--overlay0)", display: "block", marginBottom: 6 }}>BILD-BESCHREIBUNG (PROMPT)</label>
                <textarea rows={3} value={imagePrompt} onChange={(e) => setImagePrompt(e.target.value)}
                  placeholder="Professionelles Foto von…"
                  style={{ width: "100%", background: "var(--surface0)", border: "1px solid var(--surface1)", borderRadius: 8, padding: "10px 14px", color: "var(--text)", resize: "none" }} />
              </div>

              {/* Provider */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--overlay0)", display: "block", marginBottom: 6 }}>ANBIETER</label>
                <div style={{ display: "flex", gap: 2, background: "var(--surface0)", borderRadius: 8, padding: 3 }}>
                  {[["dalle3","DALL-E 3"],["imagen3","Imagen 3"],["sdxl","SDXL"]].map(([id, label]) => (
                    <button key={id} onClick={() => setImageProvider(id)}
                      style={{ flex: 1, padding: "5px 10px", borderRadius: 6, fontSize: 12,
                        background: imageProvider === id ? "var(--base)" : "transparent",
                        color: imageProvider === id ? "var(--text)" : "var(--overlay1)",
                        border: "none", cursor: "pointer", fontWeight: imageProvider === id ? 600 : 400 }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Aspect ratio */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--overlay0)", display: "block", marginBottom: 6 }}>BILDFORMAT</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
                  {ASPECT_RATIOS.map((ar) => (
                    <button key={ar.id} onClick={() => setAspectRatio(ar.id)}
                      style={{ padding: "8px 10px", borderRadius: 8, textAlign: "center",
                        background: aspectRatio === ar.id ? "var(--blue)22" : "var(--surface0)",
                        border: `1px solid ${aspectRatio === ar.id ? "var(--blue)" : "var(--surface1)"}`,
                        cursor: "pointer" }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: aspectRatio === ar.id ? "var(--blue)" : "var(--text)" }}>{ar.label}</div>
                      <div style={{ fontSize: 10, color: "var(--overlay0)", marginTop: 2 }}>{ar.hint}</div>
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={generateImage} disabled={!imagePrompt.trim() || imageGen.status === "loading"}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                  background: "var(--blue)", color: "var(--crust)", border: "none", cursor: "pointer", opacity: !imagePrompt.trim() ? 0.5 : 1 }}>
                {imageGen.status === "loading" ? <Loader size={14} className="animate-spin" /> : <Image size={14} />}
                {imageGen.status === "loading" ? "Bild wird erstellt…" : "Bild generieren"}
              </button>
            </div>

            {imageGen.status === "done" && imageGen.result && (
              <div style={{ background: "var(--mantle)", border: "1px solid var(--green)44", borderRadius: 12, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ fontSize: 12, color: "var(--green)" }}>✓ Bild generiert</span>
                  <button onClick={generateImage} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, padding: "3px 8px", borderRadius: 6, background: "var(--surface0)", color: "var(--overlay1)", border: "1px solid var(--surface1)", cursor: "pointer" }}>
                    <RefreshCw size={11} /> Neu
                  </button>
                </div>
                <img src={`asset://localhost/${imageGen.result.replace(/\\/g, "/")}`}
                  alt="Generiertes Bild"
                  style={{ width: "100%", maxHeight: 400, objectFit: "contain", borderRadius: 8, background: "var(--surface0)" }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
                <p style={{ fontSize: 11, color: "var(--overlay0)", marginTop: 6, wordBreak: "break-all" }}>{imageGen.result}</p>
              </div>
            )}
            {imageGen.status === "error" && (
              <div style={{ padding: 12, borderRadius: 10, background: "var(--red)18", border: "1px solid var(--red)33" }}>
                <p style={{ fontSize: 13, color: "var(--red)" }}>Fehler: {imageGen.error}</p>
                <p style={{ fontSize: 11, color: "var(--overlay0)", marginTop: 4 }}>API-Key in Einstellungen prüfen.</p>
              </div>
            )}
          </div>
        )}

        {/* ── AVATAR ── */}
        {step === "avatar" && (
          <div className="space-y-4">
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>🧑 Avatar-Video (Talking Head)</h2>
            <div style={{ background: "var(--mantle)", border: "1px solid var(--surface0)", borderRadius: 12, padding: 18 }} className="space-y-4">

              {/* Provider */}
              <div style={{ display: "flex", gap: 2, background: "var(--surface0)", borderRadius: 8, padding: 3 }}>
                {[["heygen","HeyGen"],["did","D-ID"]].map(([id, label]) => (
                  <button key={id} onClick={() => setAvatarProvider(id)}
                    style={{ flex: 1, padding: "5px 10px", borderRadius: 6, fontSize: 12,
                      background: avatarProvider === id ? "var(--base)" : "transparent",
                      color: avatarProvider === id ? "var(--text)" : "var(--overlay1)",
                      border: "none", cursor: "pointer", fontWeight: avatarProvider === id ? 600 : 400 }}>
                    {label}
                  </button>
                ))}
              </div>

              {/* Avatar selector */}
              {avatars.length > 0 && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--overlay0)", display: "block", marginBottom: 6 }}>AVATAR AUSWÄHLEN</label>
                  <select value={avatarId} onChange={(e) => setAvatarId(e.target.value)}>
                    <option value="">Standard-Avatar</option>
                    {avatars.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              )}

              {/* Text */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--overlay0)", display: "block", marginBottom: 6 }}>SPRECHTEXT</label>
                <textarea rows={4} value={avatarText} onChange={(e) => setAvatarText(e.target.value)}
                  placeholder="Text den der Avatar sprechen soll…"
                  style={{ width: "100%", background: "var(--surface0)", border: "1px solid var(--surface1)", borderRadius: 8, padding: "10px 14px", color: "var(--text)", resize: "none" }} />
                <div style={{ fontSize: 11, color: "var(--overlay0)", textAlign: "right", marginTop: 2 }}>{avatarText.length} Zeichen</div>
              </div>

              <button onClick={generateAvatar} disabled={!avatarText.trim() || avatarGen.status === "loading"}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                  background: "var(--pink)", color: "white", border: "none", cursor: "pointer", opacity: !avatarText.trim() ? 0.5 : 1 }}>
                {avatarGen.status === "loading" ? <Loader size={14} className="animate-spin" /> : <User size={14} />}
                {avatarGen.status === "loading" ? "Avatar wird erstellt… (1–3 Min)" : "Avatar-Video erstellen"}
              </button>
            </div>

            {avatarGen.status === "done" && (
              <div style={{ padding: 12, borderRadius: 10, background: "var(--green)12", border: "1px solid var(--green)33" }}>
                <p style={{ fontSize: 13, color: "var(--green)" }}>✓ Avatar-Video bereit</p>
                <p style={{ fontSize: 11, color: "var(--overlay0)", marginTop: 4, wordBreak: "break-all" }}>{avatarGen.result}</p>
              </div>
            )}
            {avatarGen.status === "error" && (
              <div style={{ padding: 12, borderRadius: 10, background: "var(--red)18", border: "1px solid var(--red)33" }}>
                <p style={{ fontSize: 13, color: "var(--red)" }}>{avatarGen.error}</p>
              </div>
            )}
          </div>
        )}

        {/* ── VIDEO ── */}
        {step === "video" && (
          <div className="space-y-4">
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>🎬 Video generieren (Runway Gen-3)</h2>
            <div style={{ background: "var(--mantle)", border: "1px solid var(--surface0)", borderRadius: 12, padding: 18 }} className="space-y-4">

              {imageGen.result && (
                <div style={{ padding: 10, borderRadius: 8, background: "var(--blue)12", border: "1px solid var(--blue)33", fontSize: 12, color: "var(--blue)" }}>
                  ✓ Generiertes Bild als Ausgangsbild für Video verwendet
                </div>
              )}

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--overlay0)", display: "block", marginBottom: 6 }}>VIDEO-PROMPT</label>
                <textarea rows={3} value={videoPrompt} onChange={(e) => setVideoPrompt(e.target.value)}
                  placeholder="Beschreibe die Bewegung/Animation im Video…"
                  style={{ width: "100%", background: "var(--surface0)", border: "1px solid var(--surface1)", borderRadius: 8, padding: "10px 14px", color: "var(--text)", resize: "none" }} />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--overlay0)", display: "block", marginBottom: 6 }}>DAUER</label>
                <div style={{ display: "flex", gap: 6 }}>
                  {[5, 10].map((d) => (
                    <button key={d} onClick={() => setVideoDuration(d)}
                      style={{ padding: "6px 16px", borderRadius: 8, fontSize: 13,
                        background: videoDuration === d ? "var(--blue)22" : "var(--surface0)",
                        border: `1px solid ${videoDuration === d ? "var(--blue)" : "var(--surface1)"}`,
                        color: videoDuration === d ? "var(--blue)" : "var(--text)", cursor: "pointer" }}>
                      {d}s
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={generateVideo} disabled={!videoPrompt.trim() || videoGen.status === "loading"}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                  background: "var(--peach)", color: "white", border: "none", cursor: "pointer", opacity: !videoPrompt.trim() ? 0.5 : 1 }}>
                {videoGen.status === "loading" ? <Loader size={14} className="animate-spin" /> : <Video size={14} />}
                {videoGen.status === "loading" ? "Video wird erstellt… (1–3 Min)" : "Video generieren"}
              </button>
            </div>

            {videoGen.status === "done" && (
              <div style={{ padding: 12, borderRadius: 10, background: "var(--green)12", border: "1px solid var(--green)33" }}>
                <p style={{ fontSize: 13, color: "var(--green)" }}>✓ Video bereit</p>
                <p style={{ fontSize: 11, color: "var(--overlay0)", marginTop: 4, wordBreak: "break-all" }}>{videoGen.result}</p>
              </div>
            )}
            {videoGen.status === "error" && (
              <div style={{ padding: 12, borderRadius: 10, background: "var(--red)18", border: "1px solid var(--red)33" }}>
                <p style={{ fontSize: 13, color: "var(--red)" }}>{videoGen.error}</p>
              </div>
            )}
          </div>
        )}

        {/* ── VOICE ── */}
        {step === "voice" && (
          <div className="space-y-4">
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>🎙️ Sprachsynthese</h2>
            <div style={{ background: "var(--mantle)", border: "1px solid var(--surface0)", borderRadius: 12, padding: 18 }} className="space-y-4">

              <div style={{ display: "flex", gap: 2, background: "var(--surface0)", borderRadius: 8, padding: 3 }}>
                {[["elevenlabs","ElevenLabs"],["openai","OpenAI TTS"],["google","Google TTS"]].map(([id, label]) => (
                  <button key={id} onClick={() => setVoiceProvider(id)}
                    style={{ flex: 1, padding: "5px 10px", borderRadius: 6, fontSize: 12,
                      background: voiceProvider === id ? "var(--base)" : "transparent",
                      color: voiceProvider === id ? "var(--text)" : "var(--overlay1)",
                      border: "none", cursor: "pointer", fontWeight: voiceProvider === id ? 600 : 400 }}>
                    {label}
                  </button>
                ))}
              </div>

              {voices.length > 0 && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--overlay0)", display: "block", marginBottom: 6 }}>STIMME</label>
                  <select value={voiceVoiceId} onChange={(e) => setVoiceVoiceId(e.target.value)}>
                    <option value="">Standard-Stimme</option>
                    {voices.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--overlay0)", display: "block", marginBottom: 6 }}>SPRECHTEXT</label>
                <textarea rows={5} value={voiceText} onChange={(e) => setVoiceText(e.target.value)}
                  style={{ width: "100%", background: "var(--surface0)", border: "1px solid var(--surface1)", borderRadius: 8, padding: "10px 14px", color: "var(--text)", resize: "vertical" }} />
              </div>

              <button onClick={generateVoice} disabled={!voiceText.trim() || voiceGen.status === "loading"}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                  background: "var(--mauve)", color: "white", border: "none", cursor: "pointer", opacity: !voiceText.trim() ? 0.5 : 1 }}>
                {voiceGen.status === "loading" ? <Loader size={14} className="animate-spin" /> : <Mic size={14} />}
                {voiceGen.status === "loading" ? "Sprache wird generiert…" : "Sprachausgabe generieren"}
              </button>
            </div>

            {voiceGen.status === "done" && (
              <div style={{ padding: 12, borderRadius: 10, background: "var(--green)12", border: "1px solid var(--green)33" }}>
                <p style={{ fontSize: 13, color: "var(--green)" }}>✓ Audio bereit</p>
                <p style={{ fontSize: 11, color: "var(--overlay0)", marginTop: 4, wordBreak: "break-all" }}>{voiceGen.result}</p>
              </div>
            )}
            {voiceGen.status === "error" && (
              <div style={{ padding: 12, borderRadius: 10, background: "var(--red)18", border: "1px solid var(--red)33" }}>
                <p style={{ fontSize: 13, color: "var(--red)" }}>{voiceGen.error}</p>
              </div>
            )}
          </div>
        )}

        {/* ── PUBLISH ── */}
        {step === "publish" && (
          <div className="space-y-4">
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>🚀 Zusammenfassung & Publizieren</h2>

            {/* Summary */}
            <div style={{ background: "var(--mantle)", border: "1px solid var(--surface0)", borderRadius: 12, padding: 16 }} className="space-y-3">
              {[
                { label: "Texte", value: `${Object.keys(texts).length} Plattformen`, done: Object.keys(texts).length > 0 },
                { label: "Bild", value: imageGen.result ? "Generiert" : "Nicht generiert", done: !!imageGen.result },
                { label: "Avatar", value: avatarGen.result ? "Generiert" : "Nicht generiert", done: !!avatarGen.result },
                { label: "Video", value: videoGen.result ? "Generiert" : "Nicht generiert", done: !!videoGen.result },
                { label: "Stimme", value: voiceGen.result ? "Generiert" : "Nicht generiert", done: !!voiceGen.result },
              ].map((item) => (
                <div key={item.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "8px 12px", borderRadius: 8, background: "var(--surface0)" }}>
                  <span style={{ fontSize: 13, color: "var(--text)" }}>{item.label}</span>
                  <span style={{ fontSize: 12, color: item.done ? "var(--green)" : "var(--overlay0)" }}>
                    {item.done ? "✓ " : "○ "}{item.value}
                  </span>
                </div>
              ))}
            </div>

            {Object.keys(texts).length === 0 && (
              <div style={{ padding: 12, borderRadius: 10, background: "var(--yellow)18", border: "1px solid var(--yellow)44" }}>
                <p style={{ fontSize: 13, color: "var(--yellow)" }}>⚠️ Bitte zuerst Texte im Schritt "Text" generieren.</p>
              </div>
            )}

            {/* Mode selector */}
            {Object.keys(texts).length > 0 && (
              <div style={{ background: "var(--mantle)", border: "1px solid var(--surface0)", borderRadius: 12, padding: 16 }} className="space-y-4">
                <div style={{ display: "flex", gap: 2, background: "var(--surface0)", borderRadius: 8, padding: 3 }}>
                  {([["now","⚡ Jetzt"],["schedule","📅 Planen"]] as const).map(([id, label]) => (
                    <button key={id} onClick={() => setPostMode(id)}
                      style={{ flex: 1, padding: "7px 12px", borderRadius: 7, fontSize: 13,
                        background: postMode === id ? "var(--base)" : "transparent",
                        color: postMode === id ? "var(--text)" : "var(--overlay1)",
                        border: "none", cursor: "pointer", fontWeight: postMode === id ? 700 : 400 }}>
                      {label}
                    </button>
                  ))}
                </div>

                {postMode === "schedule" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Clock size={14} style={{ color: "var(--overlay1)" }} />
                    <input type="datetime-local" value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      min={localDatetimeValue(new Date())}
                      style={{ background: "var(--surface0)", border: "1px solid var(--surface1)", borderRadius: 8,
                        color: "var(--text)", padding: "6px 12px", fontSize: 13 }} />
                  </div>
                )}

                <button onClick={publish}
                  disabled={Object.keys(texts).length === 0}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 24px", borderRadius: 10, fontSize: 14, fontWeight: 700,
                    background: postMode === "schedule" ? "var(--blue)" : "var(--green)", color: "var(--crust)",
                    border: "none", cursor: "pointer", width: "100%", justifyContent: "center" }}>
                  {postMode === "schedule" ? <Calendar size={16} /> : <Send size={16} />}
                  {postMode === "schedule"
                    ? `Planen — ${new Date(scheduledAt).toLocaleString("de-DE")}`
                    : `Alle ${Object.keys(texts).length} Plattformen veröffentlichen`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation bar */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "12px 24px", borderTop: "1.5px solid var(--surface0)",
        background: "var(--mantle)", flexShrink: 0,
      }}>
        <button
          onClick={() => stepIdx > 0 && setStep(STEPS[stepIdx - 1].id)}
          disabled={stepIdx === 0}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 8, fontSize: 13,
            background: "var(--surface0)", color: stepIdx === 0 ? "var(--overlay0)" : "var(--text)",
            border: "none", cursor: stepIdx === 0 ? "default" : "pointer" }}>
          <ChevronLeft size={14} /> Zurück
        </button>
        <span style={{ fontSize: 12, color: "var(--overlay0)" }}>
          {stepIdx + 1} / {STEPS.length} — {STEPS[stepIdx].label}
        </span>
        <button
          onClick={() => stepIdx < STEPS.length - 1 && setStep(STEPS[stepIdx + 1].id)}
          disabled={stepIdx === STEPS.length - 1}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
            background: stepIdx === STEPS.length - 1 ? "var(--surface0)" : "var(--blue)",
            color: stepIdx === STEPS.length - 1 ? "var(--overlay0)" : "var(--crust)",
            border: "none", cursor: stepIdx === STEPS.length - 1 ? "default" : "pointer" }}>
          Weiter <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
