import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Send, Inbox, Users, Settings, Key,
  Instagram, Facebook, MessageCircle, Linkedin,
  Twitter, Mail, Bot, Circle, Zap, LogOut, Download
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useAccountsStore } from "../store/accounts";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

const navItems = [
  { to: "/",         icon: Send,    label: "Crossposting",  end: true },
  { to: "/inbox",    icon: Inbox,   label: "Posteingang"             },
  { to: "/accounts", icon: Users,   label: "Konten"                  },
  { to: "/settings", icon: Settings,label: "Einstellungen"           },
];

const platformIcons: Record<string, React.FC<any>> = {
  instagram: Instagram,
  facebook:  Facebook,
  whatsapp:  MessageCircle,
  linkedin:  Linkedin,
  twitter:   Twitter,
  telegram:  Bot,
  email:     Mail,
};

const platformColors: Record<string, string> = {
  instagram: "#E1306C",
  facebook:  "#1877F2",
  whatsapp:  "#25D366",
  linkedin:  "#0A66C2",
  twitter:   "#1DA1F2",
  telegram:  "#2AABEE",
  email:     "#EA4335",
};

export default function Layout() {
  const accounts = useAccountsStore((s) => s.accounts);
  const fetchAccounts = useAccountsStore((s) => s.fetchAccounts);
  const connected = accounts.filter((a) => a.status === "connected");
  const navigate = useNavigate();
  const [showWelcome, setShowWelcome] = useState(false);

  // Load accounts on mount, show welcome if none connected
  useEffect(() => {
    fetchAccounts().then(() => {
      const hasAccounts = useAccountsStore.getState().accounts.length > 0;
      const dismissed = localStorage.getItem("welcome_dismissed");
      if (!hasAccounts && !dismissed) setShowWelcome(true);
    });
  }, []);

  // Check for updates once on startup (silent unless update available)
  useEffect(() => {
    invoke<{ available: boolean; latest_version?: string }>("check_for_updates")
      .then((info) => {
        if (info.available) {
          toast.success(
            `Update ${info.latest_version ?? ""} verfügbar — Einstellungen öffnen`,
            { duration: 8000 }
          );
        }
      })
      .catch(() => {}); // Silently ignore network errors
  }, []);

  return (
    <div style={{ display: "flex", height: "100%", width: "100%", background: "var(--crust)" }}>
      {/* ── Sidebar ── */}
      <aside style={{
        display: "flex",
        flexDirection: "column",
        width: 220,
        minWidth: 220,
        flexShrink: 0,
        background: "var(--mantle)",
        borderRight: "1.5px solid var(--surface0)",
        height: "100%",
      }}>

        {/* Logo */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "18px 16px",
          borderBottom: "1.5px solid var(--surface0)",
        }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: "linear-gradient(135deg, var(--blue), var(--mauve))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            boxShadow: "0 4px 12px color-mix(in srgb, var(--blue) 30%, transparent)",
          }}>
            <Zap size={18} color="#11111b" strokeWidth={2.5} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)", letterSpacing: "-0.01em" }}>
              CrossPost
            </div>
            <div style={{ fontSize: 11, color: "var(--overlay0)", marginTop: 1 }}>
              Desktop v0.2
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ display: "flex", flexDirection: "column", padding: "10px 10px", flex: 1, gap: 2 }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", color: "var(--overlay0)", textTransform: "uppercase", padding: "8px 8px 6px" }}>
            Navigation
          </div>
          {navItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Connected accounts */}
        {connected.length > 0 && (
          <div style={{ padding: "12px 10px", borderTop: "1.5px solid var(--surface0)" }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", color: "var(--overlay0)", textTransform: "uppercase", padding: "0 6px 8px" }}>
              Verbundene Konten
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {connected.map((account) => {
                const Icon = platformIcons[account.platform] || Circle;
                const color = platformColors[account.platform] || "var(--text)";
                return (
                  <div key={account.id} style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "7px 8px",
                    borderRadius: 8,
                    background: "var(--surface0)",
                  }}>
                    <div style={{
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      background: color + "22",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}>
                      <Icon size={13} style={{ color }} />
                    </div>
                    <span style={{ fontSize: 12, color: "var(--subtext1)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {account.display_name}
                    </span>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)", flexShrink: 0 }} />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Bottom: License + Quit */}
        <div style={{ padding: "8px 10px", borderTop: "1.5px solid var(--surface0)", display: "flex", flexDirection: "column", gap: 2 }}>
          <NavLink
            to="/license"
            className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
            style={{ fontSize: 12, color: "var(--overlay0)" }}
          >
            <Key size={14} />
            Lizenz
          </NavLink>
          <button
            onClick={() => invoke("plugin:process|exit", { code: 0 }).catch(() => window.close())}
            className="nav-link"
            style={{ fontSize: 12, color: "var(--overlay0)", width: "100%", textAlign: "left", border: "none", cursor: "pointer" }}
          >
            <LogOut size={14} />
            Beenden
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main style={{ flex: 1, overflow: "hidden", background: "var(--base)", height: "100%", display: "flex", flexDirection: "column" }}>
        <Outlet />
      </main>

      {/* ── Welcome overlay ── */}
      {showWelcome && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 100,
          background: "rgba(17,17,27,0.85)", backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "var(--mantle)", border: "1.5px solid var(--surface1)",
            borderRadius: 20, padding: "40px 48px", maxWidth: 480, width: "90%",
            boxShadow: "0 24px 80px rgba(0,0,0,0.5)", textAlign: "center",
          }}>
            <div style={{
              width: 64, height: 64, borderRadius: 18, margin: "0 auto 20px",
              background: "linear-gradient(135deg, var(--blue), var(--mauve))",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 8px 24px color-mix(in srgb, var(--blue) 40%, transparent)",
            }}>
              <Zap size={30} color="#11111b" strokeWidth={2.5} />
            </div>

            <h2 style={{ color: "var(--text)", fontSize: 22, fontWeight: 700, margin: "0 0 8px" }}>
              Willkommen bei CrossPost Desktop
            </h2>
            <p style={{ color: "var(--subtext0)", fontSize: 14, lineHeight: 1.6, margin: "0 0 28px" }}>
              Verbinden Sie Ihre Social-Media-Konten und starten Sie mit dem Crossposting auf allen Plattformen gleichzeitig.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
              {[
                { num: "1", text: 'Konto verbinden unter "Konten"', action: () => { navigate("/accounts"); dismiss(); } },
                { num: "2", text: 'Lizenz aktivieren unter "Lizenz"', action: () => { navigate("/license"); dismiss(); } },
                { num: "3", text: "Ersten Beitrag veröffentlichen", action: () => { dismiss(); } },
              ].map(({ num, text, action }) => (
                <button
                  key={num}
                  onClick={action}
                  style={{
                    display: "flex", alignItems: "center", gap: 14,
                    padding: "12px 16px", borderRadius: 12, textAlign: "left",
                    background: "var(--surface0)", border: "1px solid var(--surface1)",
                    cursor: "pointer", transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface1)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "var(--surface0)")}
                >
                  <span style={{
                    width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                    background: "var(--blue)", color: "#11111b",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, fontWeight: 700,
                  }}>{num}</span>
                  <span style={{ color: "var(--text)", fontSize: 14 }}>{text}</span>
                </button>
              ))}
            </div>

            <button
              onClick={dismiss}
              style={{ color: "var(--overlay0)", fontSize: 13, background: "none", border: "none", cursor: "pointer" }}
            >
              Überspringen
            </button>
          </div>
        </div>
      )}
    </div>
  );

  function dismiss() {
    localStorage.setItem("welcome_dismissed", "1");
    setShowWelcome(false);
  }
}
