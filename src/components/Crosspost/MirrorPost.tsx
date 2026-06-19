import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Repeat, Upload, Send, Loader, Image, X } from "lucide-react";
import { useAccountsStore, type Platform } from "../../store/accounts";
import toast from "react-hot-toast";

const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram", facebook: "Facebook", whatsapp: "WhatsApp",
  linkedin: "LinkedIn", twitter: "Twitter/X", telegram: "Telegram", email: "E-Mail",
};

const PLATFORM_COLORS: Record<string, string> = {
  instagram: "#E1306C", facebook: "#1877F2", whatsapp: "#25D366",
  linkedin: "#0A66C2", twitter: "#1DA1F2", telegram: "#2AABEE", email: "#EA4335",
};

export default function MirrorPost() {
  const accounts = useAccountsStore((s) => s.accounts);
  const connected = accounts.filter((a) => a.status === "connected");

  const [sourceAccount, setSourceAccount] = useState("");
  const [targetAccounts, setTargetAccounts] = useState<string[]>([]);
  const [content, setContent] = useState("");
  const [mediaPath, setMediaPath] = useState("");
  const [posting, setPosting] = useState(false);
  const [results, setResults] = useState<Record<string, "idle" | "posting" | "done" | "error">>({});

  const toggleTarget = (id: string) => {
    setTargetAccounts((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  };

  const handlePost = async () => {
    if (!content.trim() || targetAccounts.length === 0) return;

    setPosting(true);
    const newResults: typeof results = {};
    targetAccounts.forEach((id) => (newResults[id] = "posting"));
    setResults(newResults);

    for (const accountId of targetAccounts) {
      try {
        await invoke("post_content", {
          accountId,
          content,
          mediaPath: mediaPath || null,
        });
        setResults((prev) => ({ ...prev, [accountId]: "done" }));
        const acc = accounts.find((a) => a.id === accountId);
        toast.success(`✓ ${acc?.display_name}`);
      } catch (e: any) {
        setResults((prev) => ({ ...prev, [accountId]: "error" }));
        const acc = accounts.find((a) => a.id === accountId);
        toast.error(`✗ ${acc?.display_name}: ${e}`);
      }
    }

    setPosting(false);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Content input */}
      <div
        className="rounded-xl p-5"
        style={{ background: "var(--mantle)", border: "1px solid var(--surface0)" }}
      >
        <label className="block text-sm font-medium mb-2" style={{ color: "var(--subtext1)" }}>
          Inhalt
        </label>
        <textarea
          rows={5}
          placeholder="Was möchten Sie veröffentlichen?"
          value={content}
          onChange={(e) => setContent(e.target.value)}
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

        {/* Character counters */}
        <div className="flex gap-4 mt-2">
          {["twitter", "instagram", "linkedin"].map((p) => {
            const limits: Record<string, number> = { twitter: 280, instagram: 2200, linkedin: 3000 };
            const limit = limits[p];
            const over = content.length > limit;
            return (
              <span
                key={p}
                className="text-xs"
                style={{ color: over ? "var(--red)" : "var(--overlay0)" }}
              >
                {PLATFORM_LABELS[p]}: {content.length}/{limit}
              </span>
            );
          })}
        </div>

        {/* Media */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <button
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
            style={{ background: "var(--surface0)", color: "var(--subtext0)" }}
            onClick={async () => {
              try {
                const selected = await openDialog({
                  multiple: false,
                  filters: [
                    {
                      name: "Medien",
                      extensions: ["jpg", "jpeg", "png", "gif", "webp", "mp4", "mov", "avi"],
                    },
                  ],
                });
                if (selected) {
                  setMediaPath(selected as string);
                }
              } catch (e) {
                toast.error("Datei-Dialog fehlgeschlagen");
              }
            }}
          >
            <Image size={13} />
            Bild/Video hinzufügen
          </button>
          {mediaPath && (
            <div className="flex items-center gap-1">
              <span className="text-xs" style={{ color: "var(--green)" }}>
                ✓ {(mediaPath as string).split(/[/\\]/).pop()}
              </span>
              <button
                onClick={() => setMediaPath("")}
                className="p-0.5 rounded"
                style={{ color: "var(--overlay0)" }}
              >
                <X size={11} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Target selection */}
      <div
        className="rounded-xl p-5"
        style={{ background: "var(--mantle)", border: "1px solid var(--surface0)" }}
      >
        <label className="block text-sm font-medium mb-3" style={{ color: "var(--subtext1)" }}>
          Veröffentlichen auf
        </label>

        {connected.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--overlay0)" }}>
            Keine verbundenen Konten. Bitte fügen Sie Konten unter "Konten" hinzu.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {connected.map((account) => {
              const isSelected = targetAccounts.includes(account.id);
              const color = PLATFORM_COLORS[account.platform] || "var(--blue)";
              const status = results[account.id];

              return (
                <button
                  key={account.id}
                  onClick={() => !posting && toggleTarget(account.id)}
                  disabled={posting}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all"
                  style={{
                    background: isSelected ? color + "20" : "var(--surface0)",
                    border: `1px solid ${isSelected ? color : "var(--surface1)"}`,
                    opacity: posting ? 0.8 : 1,
                  }}
                >
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: color }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate" style={{ color: "var(--text)" }}>
                      {account.display_name}
                    </p>
                    <p className="text-xs" style={{ color: "var(--overlay0)" }}>
                      {PLATFORM_LABELS[account.platform]}
                    </p>
                  </div>
                  {status === "posting" && <Loader size={13} className="animate-spin shrink-0" style={{ color: "var(--blue)" }} />}
                  {status === "done" && <span className="text-xs shrink-0" style={{ color: "var(--green)" }}>✓</span>}
                  {status === "error" && <span className="text-xs shrink-0" style={{ color: "var(--red)" }}>✗</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Post button */}
      <button
        onClick={handlePost}
        disabled={!content.trim() || targetAccounts.length === 0 || posting}
        className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold disabled:opacity-40 transition-all"
        style={{ background: "var(--blue)", color: "var(--crust)" }}
      >
        {posting ? (
          <Loader size={16} className="animate-spin" />
        ) : (
          <Send size={16} />
        )}
        {posting
          ? `Veröffentliche auf ${targetAccounts.length} Plattformen...`
          : `Auf ${targetAccounts.length} Plattformen veröffentlichen`}
      </button>
    </div>
  );
}
