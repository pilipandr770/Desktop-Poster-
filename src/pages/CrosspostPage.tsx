import { useState } from "react";
import { Send, Repeat, Wand2 } from "lucide-react";
import MirrorPost from "../components/Crosspost/MirrorPost";
import AICreatePost from "../components/Crosspost/AICreatePost";

type Mode = "mirror" | "ai";

export default function CrosspostPage() {
  const [mode, setMode] = useState<Mode>("mirror");

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-4 border-b shrink-0"
        style={{ borderColor: "var(--surface0)" }}
      >
        <div>
          <h1 className="text-lg font-semibold" style={{ color: "var(--text)" }}>
            Crossposting
          </h1>
          <p className="text-sm" style={{ color: "var(--overlay0)" }}>
            Inhalte auf allen Plattformen gleichzeitig veröffentlichen
          </p>
        </div>

        {/* Mode switcher */}
        <div
          className="flex rounded-lg p-1"
          style={{ background: "var(--surface0)" }}
        >
          <button
            onClick={() => setMode("mirror")}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all"
            style={{
              background: mode === "mirror" ? "var(--base)" : "transparent",
              color: mode === "mirror" ? "var(--text)" : "var(--overlay0)",
            }}
          >
            <Repeat size={15} />
            Spiegeln
          </button>
          <button
            onClick={() => setMode("ai")}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all"
            style={{
              background: mode === "ai" ? "var(--base)" : "transparent",
              color: mode === "ai" ? "var(--text)" : "var(--overlay0)",
            }}
          >
            <Wand2 size={15} />
            KI erstellen
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {mode === "mirror" ? <MirrorPost /> : <AICreatePost />}
      </div>
    </div>
  );
}
