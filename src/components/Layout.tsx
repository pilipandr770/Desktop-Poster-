import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Send, Inbox, Users, Settings,
  Instagram, Facebook, MessageCircle, Linkedin,
  Twitter, Mail, Bot, Circle, Zap, LogOut,
  ChevronUp, RefreshCw, Download, ExternalLink,
  CheckCircle, AlertCircle, Loader, Crown
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useAccountsStore } from "../store/accounts";
import { useEffect, useState, useRef } from "react";
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

// ── Account Panel ─────────────────────────────────────────────────────────────

type UpdateStatus = "idle" | "checking" | "available" | "up_to_date" | "error";

interface LicenseInfo {
  is_valid: boolean;
  plan: string | null;
  valid_until: string | null;
  message: string;
}

interface UpdateInfo {
  available: boolean;
  latest_version?: string;
}

function AccountPanel() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle");
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const plan = license?.plan?.toLowerCase() ?? "solo";
  const planLabel = plan === "agency" ? "Agency" : plan === "pro" ? "Pro" : "Solo";
  const planColor = plan === "agency" ? "var(--mauve)" : plan === "pro" ? "var(--blue)" : "var(--overlay1)";
  const planBg    = plan === "agency" ? "var(--mauve)22" : plan === "pro" ? "var(--blue)22" : "var(--surface1)";

  // Load license once on mount
  useEffect(() => {
    invoke<LicenseInfo>("check_license")
      .then(setLicense)
      .catch(() => setLicense({ is_valid: false, plan: null, valid_until: null, message: "" }));
  }, []);

  // Check for updates once on mount (silent unless available)
  useEffect(() => {
    setUpdateStatus("checking");
    invoke<UpdateInfo>("check_for_updates")
      .then((info) => {
        if (info.available) {
          setUpdateStatus("available");
          setLatestVersion(info.latest_version ?? null);
          toast.success(
            `Update ${info.latest_version ?? ""} verfügbar`,
            { duration: 8000 }
          );
        } else {
          setUpdateStatus("up_to_date");
        }
      })
      .catch(() => setUpdateStatus("error"));
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleCheckUpdates = () => {
    setUpdateStatus("checking");
    invoke<UpdateInfo>("check_for_updates")
      .then((info) => {
        if (info.available) {
          setUpdateStatus("available");
          setLatestVersion(info.latest_version ?? null);
        } else {
          setUpdateStatus("up_to_date");
          toast("Alles aktuell!", { icon: "✅", duration: 3000 });
        }
      })
      .catch(() => {
        setUpdateStatus("error");
        toast.error("Verbindungsfehler beim Update-Check");
      });
  };

  const validUntilStr = license?.valid_until
    ? new Date(license.valid_until).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })
    : null;

  // Avatar initials derived from plan
  const avatarLetter = planLabel[0].toUpperCase();

  return (
    <div ref={panelRef} style={{ position: "relative" }}>
      {/* ── Floating Panel ── */}
      {open && (
        <div style={{
          position: "absolute",
          bottom: "calc(100% + 8px)",
          left: 0,
          right: 0,
          background: "var(--mantle)",
          border: "1.5px solid var(--surface1)",
          borderRadius: 14,
          boxShadow: "0 -8px 32px rgba(0,0,0,0.4)",
          overflow: "hidden",
          zIndex: 200,
        }}>
          {/* Plan header */}
          <div style={{
            padding: "14px 16px 12px",
            borderBottom: "1px solid var(--surface0)",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 11, flexShrink: 0,
              background: `linear-gradient(135deg, ${planColor}, ${planColor}88)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, fontWeight: 700, color: "#11111b",
            }}>
              {avatarLetter}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>
                  CrossPost {planLabel}
                </span>
                {license?.is_valid && (
                  <CheckCircle size={13} style={{ color: "var(--green)" }} />
                )}
              </div>
              {validUntilStr && (
                <span style={{ fontSize: 11, color: "var(--overlay0)" }}>
                  Lizenz gültig bis {validUntilStr}
                </span>
              )}
              {!license?.is_valid && (
                <span style={{ fontSize: 11, color: "var(--yellow)" }}>
                  Keine aktive Lizenz
                </span>
              )}
            </div>
          </div>

          {/* Update section */}
          <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--surface0)" }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {updateStatus === "checking" && (
                  <Loader size={13} style={{ color: "var(--blue)", flexShrink: 0 }} className="animate-spin" />
                )}
                {updateStatus === "available" && (
                  <Download size={13} style={{ color: "var(--green)", flexShrink: 0 }} />
                )}
                {updateStatus === "up_to_date" && (
                  <CheckCircle size={13} style={{ color: "var(--green)", flexShrink: 0 }} />
                )}
                {(updateStatus === "idle" || updateStatus === "error") && (
                  <RefreshCw size={13} style={{ color: "var(--overlay1)", flexShrink: 0 }} />
                )}
                <span style={{ fontSize: 12, color: "var(--subtext0)" }}>
                  {updateStatus === "checking" && "Suche nach Updates…"}
                  {updateStatus === "available" && `Update ${latestVersion ?? ""} verfügbar`}
                  {updateStatus === "up_to_date" && "App ist aktuell"}
                  {updateStatus === "idle" && "Updates prüfen"}
                  {updateStatus === "error" && "Update-Check fehlgeschlagen"}
                </span>
              </div>
              {updateStatus !== "checking" && (
                <button
                  onClick={handleCheckUpdates}
                  style={{
                    fontSize: 11, padding: "3px 8px", borderRadius: 6,
                    background: updateStatus === "available" ? "var(--green)22" : "var(--surface1)",
                    color: updateStatus === "available" ? "var(--green)" : "var(--overlay1)",
                    border: "none", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap",
                  }}
                >
                  {updateStatus === "available" ? "Einstellungen öffnen" : "Prüfen"}
                </button>
              )}
            </div>
          </div>

          {/* Actions */}
          <div style={{ padding: "6px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
            <button
              onClick={() => { setOpen(false); navigate("/license"); }}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                width: "100%", padding: "8px 10px", borderRadius: 8,
                background: "none", border: "none", cursor: "pointer",
                fontSize: 13, color: "var(--subtext1)", textAlign: "left",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface0)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              <Crown size={14} style={{ color: planColor }} />
              Lizenz &amp; Plan
            </button>

            {plan !== "agency" && (
              <button
                onClick={() => {
                  setOpen(false);
                  invoke("open_external_url", { url: "https://pilipandr770.github.io/Desktop-Poster-/#pricing" })
                    .catch(() => {});
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  width: "100%", padding: "8px 10px", borderRadius: 8,
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 13, color: "var(--mauve)", textAlign: "left",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--mauve)11")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              >
                <ExternalLink size={14} />
                {plan === "pro" ? "Auf Agency upgraden" : "Plan upgraden"}
              </button>
            )}

            <div style={{ height: 1, background: "var(--surface0)", margin: "4px 2px" }} />

            <button
              onClick={() => invoke("plugin:process|exit", { code: 0 }).catch(() => window.close())}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                width: "100%", padding: "8px 10px", borderRadius: 8,
                background: "none", border: "none", cursor: "pointer",
                fontSize: 13, color: "var(--overlay1)", textAlign: "left",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface0)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              <LogOut size={14} />
              Beenden
            </button>
          </div>
        </div>
      )}

      {/* ── Chip trigger ── */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          width: "100%", padding: "10px 12px",
          background: open ? "var(--surface0)" : "none",
          border: "none", cursor: "pointer", borderRadius: 10,
          transition: "background 0.15s",
        }}
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.background = "var(--surface0)"; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = "none"; }}
      >
        {/* Avatar */}
        <div style={{
          width: 32, height: 32, borderRadius: 9, flexShrink: 0,
          background: `linear-gradient(135deg, ${planColor}, ${planColor}88)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, fontWeight: 700, color: "#11111b",
        }}>
          {avatarLetter}
        </div>

        <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", lineHeight: 1.2 }}>
            CrossPost {planLabel}
          </div>
          <div style={{ fontSize: 10, color: updateStatus === "available" ? "var(--green)" : "var(--overlay0)", display: "flex", alignItems: "center", gap: 3, marginTop: 1 }}>
            {updateStatus === "available" && <Download size={9} />}
            {updateStatus === "available" ? "Update verfügbar" : license?.is_valid ? "Lizenz aktiv" : "Kein Lizenz"}
          </div>
        </div>

        <ChevronUp
          size={14}
          style={{
            color: "var(--overlay1)",
            transition: "transform 0.2s",
            transform: open ? "rotate(0deg)" : "rotate(180deg)",
          }}
        />
      </button>
    </div>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────────

export default function Layout() {
  const accounts = useAccountsStore((s) => s.accounts);
  const fetchAccounts = useAccountsStore((s) => s.fetchAccounts);
  const connected = accounts.filter((a) => a.status === "connected");
  const navigate = useNavigate();
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    fetchAccounts().then(() => {
      const hasAccounts = useAccountsStore.getState().accounts.length > 0;
      const dismissed = localStorage.getItem("welcome_dismissed");
      if (!hasAccounts && !dismissed) setShowWelcome(true);
    });
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
              Desktop v0.4
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

        {/* Account Panel (bottom-left) */}
        <div style={{ padding: "8px 10px", borderTop: "1.5px solid var(--surface0)" }}>
          <AccountPanel />
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
                { num: "2", text: 'Lizenz aktivieren (unten links)', action: () => { dismiss(); } },
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
