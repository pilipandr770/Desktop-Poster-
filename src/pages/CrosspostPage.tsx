import { useState } from "react";
import { Repeat, Wand2, Clock, GitBranch } from "lucide-react";
import MirrorPost from "../components/Crosspost/MirrorPost";
import AICreatePost from "../components/Crosspost/AICreatePost";
import PostHistory from "../components/Crosspost/PostHistory";
import PipelinePost from "../components/Crosspost/PipelinePost";

type Mode = "mirror" | "ai" | "pipeline" | "history";

export default function CrosspostPage() {
  const [mode, setMode] = useState<Mode>("mirror");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div className="page-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1>Crossposting</h1>
          <p>Inhalte auf allen Plattformen gleichzeitig veröffentlichen</p>
        </div>

        {/* Mode switcher */}
        <div style={{
          display: "flex",
          background: "var(--surface0)",
          borderRadius: 10,
          padding: 3,
          gap: 2,
        }}>
          {([
            { id: "mirror",   icon: Repeat,      label: "Spiegeln"     },
            { id: "ai",       icon: Wand2,       label: "KI erstellen" },
            { id: "pipeline", icon: GitBranch,   label: "Pipeline"     },
            { id: "history",  icon: Clock,       label: "Verlauf"      },
          ] as const).map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setMode(id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "8px 14px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: mode === id ? 600 : 400,
                background: mode === id ? "var(--base)" : "transparent",
                color: mode === id ? "var(--text)" : "var(--overlay1)",
                transition: "all 0.15s",
                border: "none",
                cursor: "pointer",
                boxShadow: mode === id ? "0 1px 4px rgba(0,0,0,0.25)" : "none",
              }}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="page-body">
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          {mode === "mirror"   && <MirrorPost />}
          {mode === "ai"       && <AICreatePost />}
          {mode === "pipeline" && <PipelinePost />}
          {mode === "history"  && <PostHistory />}
        </div>
      </div>
    </div>
  );
}
