import { useState } from "react";
import { Wand2, Send, Loader, CheckCircle, XCircle } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useAccountsStore } from "../../store/accounts";
import toast from "react-hot-toast";

const PLATFORMS = [
  { id: "instagram", label: "Instagram", color: "#E1306C" },
  { id: "facebook",  label: "Facebook",  color: "#1877F2" },
  { id: "linkedin",  label: "LinkedIn",  color: "#0A66C2" },
  { id: "twitter",   label: "Twitter/X", color: "#1DA1F2" },
  { id: "telegram",  label: "Telegram",  color: "#2AABEE" },
  { id: "email",     label: "E-Mail",    color: "#EA4335" },
];

interface GeneratedContent {
  platform: string;
  content: string;
  status: "idle" | "generating" | "ready" | "posting" | "done" | "error";
  error?: string;
}

export default function AICreatePost() {
  const accounts = useAccountsStore((s) => s.accounts);
  const [topic, setTopic] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [generated, setGenerated] = useState<GeneratedContent[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const connectedPlatforms = PLATFORMS.filter((p) =>
    accounts.some((a) => a.platform === p.id && a.status === "connected")
  );

  const togglePlatform = (id: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const generateContent = async () => {
    if (!topic.trim() || selectedPlatforms.length === 0) return;

    setIsGenerating(true);
    const initial = selectedPlatforms.map((p) => ({
      platform: p,
      content: "",
      status: "generating" as const,
    }));
    setGenerated(initial);

    for (const platform of selectedPlatforms) {
      try {
        const result = await invoke<{ success: boolean; content: string; error?: string }>(
          "generate_ai_content",
          { platform, prompt: topic }
        );

        setGenerated((prev) =>
          prev.map((g) =>
            g.platform === platform
              ? {
                  ...g,
                  content: result.success ? result.content : "",
                  status: result.success ? "ready" : "error",
                  error: result.error,
                }
              : g
          )
        );
      } catch (e: any) {
        setGenerated((prev) =>
          prev.map((g) =>
            g.platform === platform
              ? { ...g, status: "error", error: e.message }
              : g
          )
        );
      }
    }

    setIsGenerating(false);
  };

  const postAll = async () => {
    for (const item of generated) {
      if (item.status !== "ready") continue;

      setGenerated((prev) =>
        prev.map((g) => (g.platform === item.platform ? { ...g, status: "posting" } : g))
      );

      try {
        const account = accounts.find(
          (a) => a.platform === item.platform && a.status === "connected"
        );
        if (!account) throw new Error("Kein verbundenes Konto");

        await invoke("post_content", {
          accountId: account.id,
          platform: item.platform,
          content: item.content,
        });

        setGenerated((prev) =>
          prev.map((g) => (g.platform === item.platform ? { ...g, status: "done" } : g))
        );
        toast.success(`Auf ${item.platform} veröffentlicht!`);
      } catch (e: any) {
        setGenerated((prev) =>
          prev.map((g) =>
            g.platform === item.platform ? { ...g, status: "error", error: e.message } : g
          )
        );
        toast.error(`Fehler bei ${item.platform}: ${e.message}`);
      }
    }
  };

  const readyCount = generated.filter((g) => g.status === "ready").length;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Topic input */}
      <div
        className="rounded-xl p-5"
        style={{ background: "var(--mantle)", border: "1px solid var(--surface0)" }}
      >
        <label className="block text-sm font-medium mb-2" style={{ color: "var(--subtext1)" }}>
          Thema oder Idee
        </label>
        <textarea
          rows={3}
          placeholder="z.B. Wir haben heute unser 5-jähriges Jubiläum gefeiert..."
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          style={{
            background: "var(--surface0)",
            border: "1px solid var(--surface1)",
            borderRadius: 8,
            padding: "10px 14px",
            color: "var(--text)",
            width: "100%",
            resize: "none",
          }}
        />

        {/* Platform selector */}
        <div className="mt-4">
          <p className="text-xs font-medium mb-2" style={{ color: "var(--overlay0)" }}>
            PLATTFORMEN AUSWÄHLEN
          </p>
          {connectedPlatforms.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--overlay0)" }}>
              Keine verbundenen Konten. Bitte fügen Sie zuerst Konten hinzu.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {connectedPlatforms.map((p) => (
                <button
                  key={p.id}
                  onClick={() => togglePlatform(p.id)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                  style={{
                    background: selectedPlatforms.includes(p.id)
                      ? p.color
                      : "var(--surface0)",
                    color: selectedPlatforms.includes(p.id)
                      ? "white"
                      : "var(--subtext0)",
                    border: `1px solid ${selectedPlatforms.includes(p.id) ? p.color : "var(--surface1)"}`,
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={generateContent}
          disabled={!topic.trim() || selectedPlatforms.length === 0 || isGenerating}
          className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
          style={{ background: "var(--blue)", color: "var(--crust)" }}
        >
          {isGenerating ? <Loader size={15} className="animate-spin" /> : <Wand2 size={15} />}
          {isGenerating ? "KI generiert..." : "Inhalte generieren"}
        </button>
      </div>

      {/* Generated content */}
      {generated.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium" style={{ color: "var(--text)" }}>
              Generierte Inhalte
            </h3>
            {readyCount > 0 && (
              <button
                onClick={postAll}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: "var(--green)", color: "var(--crust)" }}
              >
                <Send size={14} />
                Alle veröffentlichen ({readyCount})
              </button>
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
                  <StatusBadge status={item.status} />
                </div>

                {item.status === "generating" && (
                  <div className="flex items-center gap-2" style={{ color: "var(--overlay0)" }}>
                    <Loader size={14} className="animate-spin" />
                    <span className="text-sm">KI schreibt...</span>
                  </div>
                )}

                {(item.status === "ready" || item.status === "posting" || item.status === "done") && (
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
                      background: "var(--surface0)",
                      border: "1px solid var(--surface1)",
                      borderRadius: 8,
                      padding: "10px 14px",
                      color: "var(--text)",
                      width: "100%",
                      resize: "vertical",
                    }}
                  />
                )}

                {item.status === "error" && (
                  <p className="text-sm" style={{ color: "var(--red)" }}>
                    Fehler: {item.error}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: GeneratedContent["status"] }) {
  const map = {
    idle:       { label: "",              color: "var(--overlay0)" },
    generating: { label: "Generiert...", color: "var(--yellow)" },
    ready:      { label: "Bereit",       color: "var(--green)" },
    posting:    { label: "Sendet...",    color: "var(--blue)" },
    done:       { label: "Veröffentlicht", color: "var(--green)" },
    error:      { label: "Fehler",       color: "var(--red)" },
  };

  const { label, color } = map[status];
  if (!label) return null;

  return (
    <span className="text-xs font-medium" style={{ color }}>
      {status === "done" && <CheckCircle size={12} className="inline mr-1" />}
      {status === "error" && <XCircle size={12} className="inline mr-1" />}
      {label}
    </span>
  );
}
