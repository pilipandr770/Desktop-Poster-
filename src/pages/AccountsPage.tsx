import { useState, useEffect } from "react";
import {
  Plus, Trash2, CheckCircle, Loader,
  Instagram, Facebook, Linkedin, Twitter, Mail,
  MessageCircle, Bot, ExternalLink, ChevronDown, ChevronUp,
  Clock, Circle
} from "lucide-react";
import { useAccountsStore, type Platform } from "../store/accounts";
import toast from "react-hot-toast";

// ── Platform definitions ────────────────────────────────────────────────────

const PLATFORMS = [
  {
    id: "instagram" as Platform,
    label: "Instagram",
    color: "#E1306C",
    gradient: "linear-gradient(135deg, #E1306C, #833AB4)",
    icon: Instagram,
    fields: [
      { key: "username", label: "Benutzername", type: "text",     placeholder: "z.B. andrii.photo (kein @)" },
      { key: "password", label: "Passwort",     type: "password", placeholder: "Instagram-Passwort" },
    ],
    note: "⚠️ Benutzername eingeben — keine E-Mail-Adresse",
    helpLinks: [],
  },
  {
    id: "facebook" as Platform,
    label: "Facebook",
    color: "#1877F2",
    gradient: "linear-gradient(135deg, #1877F2, #0a4da6)",
    icon: Facebook,
    fields: [
      { key: "username", label: "E-Mail oder Telefon", type: "text",     placeholder: "email@example.com" },
      { key: "password", label: "Passwort",             type: "password", placeholder: "Facebook-Passwort" },
    ],
    note: "",
    helpLinks: [],
  },
  {
    id: "whatsapp" as Platform,
    label: "WhatsApp",
    color: "#25D366",
    gradient: "linear-gradient(135deg, #25D366, #128C7E)",
    icon: MessageCircle,
    fields: [],
    note: "",
    helpLinks: [],
    comingSoon: true,
  },
  {
    id: "linkedin" as Platform,
    label: "LinkedIn",
    color: "#0A66C2",
    gradient: "linear-gradient(135deg, #0A66C2, #004182)",
    icon: Linkedin,
    fields: [
      { key: "email",    label: "E-Mail",   type: "text",     placeholder: "email@example.com" },
      { key: "password", label: "Passwort", type: "password", placeholder: "LinkedIn-Passwort" },
    ],
    note: "Verwendet inoffizielles API — kein offizieller Key nötig",
    helpLinks: [],
  },
  {
    id: "twitter" as Platform,
    label: "Twitter / X",
    color: "#1DA1F2",
    gradient: "linear-gradient(135deg, #1DA1F2, #0d6eaf)",
    icon: Twitter,
    fields: [
      { key: "api_key",       label: "API Key",              type: "text",     placeholder: "Consumer Key" },
      { key: "api_secret",    label: "API Secret",           type: "password", placeholder: "Consumer Secret" },
      { key: "access_token",  label: "Access Token",         type: "text",     placeholder: "Access Token" },
      { key: "access_secret", label: "Access Token Secret",  type: "password", placeholder: "Token Secret" },
    ],
    note: "Kostenloser Basic-Zugang reicht für Posts",
    helpLinks: [
      { label: "API Keys erstellen → developer.twitter.com", url: "https://developer.twitter.com/en/portal/dashboard" },
    ],
  },
  {
    id: "telegram" as Platform,
    label: "Telegram",
    color: "#2AABEE",
    gradient: "linear-gradient(135deg, #2AABEE, #1a7bbf)",
    icon: Bot,
    fields: [
      { key: "phone",    label: "Telefonnummer", type: "text",     placeholder: "+49 160 000 0000" },
      { key: "api_id",   label: "API ID",        type: "text",     placeholder: "12345678" },
      { key: "api_hash", label: "API Hash",      type: "password", placeholder: "32-stelliger Hash" },
    ],
    note: "API ID und Hash aus my.telegram.org/apps",
    helpLinks: [
      { label: "API ID & Hash erstellen → my.telegram.org", url: "https://my.telegram.org/apps" },
    ],
  },
  {
    id: "email" as Platform,
    label: "E-Mail (IMAP/SMTP)",
    color: "#EA4335",
    gradient: "linear-gradient(135deg, #EA4335, #c5221f)",
    icon: Mail,
    fields: [
      { key: "email",     label: "E-Mail-Adresse", type: "text",     placeholder: "ihre@email.de" },
      { key: "password",  label: "Passwort / App-Passwort", type: "password", placeholder: "••••••••" },
      { key: "imap_host", label: "IMAP-Server",    type: "text",     placeholder: "imap.gmail.com" },
      { key: "smtp_host", label: "SMTP-Server",    type: "text",     placeholder: "smtp.gmail.com" },
    ],
    note: "Bei Gmail: App-Passwort verwenden (2FA aktiviert)",
    helpLinks: [
      { label: "Gmail App-Passwort erstellen", url: "https://myaccount.google.com/apppasswords" },
    ],
  },
];

// ── Component ───────────────────────────────────────────────────────────────

export default function AccountsPage() {
  const { accounts, fetchAccounts, addAccount, removeAccount } = useAccountsStore();
  const [connecting, setConnecting] = useState<Platform | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Platform | null>("instagram");

  useEffect(() => { fetchAccounts(); }, []);

  const handleConnect = async (platform: Platform) => {
    const cfg = PLATFORMS.find((p) => p.id === platform)!;
    const creds: Record<string, string> = {};
    cfg.fields.forEach((f) => {
      creds[f.key] = formData[`${platform}_${f.key}`]?.trim() || "";
    });

    const empty = cfg.fields.find((f) => !creds[f.key]);
    if (empty) {
      toast.error(`Bitte "${empty.label}" ausfüllen`);
      return;
    }

    try {
      setConnecting(platform);
      await addAccount(platform, creds);
      toast.success(`✓ ${cfg.label} erfolgreich verbunden!`);
      setConnecting(null);
      setExpanded(null);
      setFormData((prev) => {
        const next = { ...prev };
        cfg.fields.forEach((f) => delete next[`${platform}_${f.key}`]);
        return next;
      });
    } catch (e: any) {
      const msg = String(e);
      let friendly = msg.slice(0, 150);
      if (msg.includes("challenge_required") || msg.includes("checkpoint"))
        friendly = "Instagram erfordert Sicherheitsüberprüfung. Bitte im Browser einloggen und erneut versuchen.";
      else if (msg.includes("bad_password") || msg.includes("Invalid") || msg.includes("wrong"))
        friendly = "Falsches Passwort oder Benutzername.";
      else if (msg.includes("two_factor") || msg.includes("2FA"))
        friendly = "Zwei-Faktor aktiv — bitte App-Passwort verwenden.";
      else if (msg.includes("rate") || msg.includes("429"))
        friendly = "Zu viele Versuche. Bitte 10 Minuten warten.";
      toast.error(friendly);
      setConnecting(null);
    }
  };

  const connectedIds = new Set(accounts.filter((a) => a.status === "connected").map((a) => a.platform));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", background: "var(--base)" }}>
      {/* Header */}
      <div
        className="px-6 py-4 shrink-0 border-b"
        style={{ background: "var(--mantle)", borderColor: "var(--surface0)" }}
      >
        <h1 className="text-xl font-bold" style={{ color: "var(--text)" }}>Konten verwalten</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--overlay1)" }}>
          Zugangsdaten werden verschlüsselt lokal gespeichert · kein Cloud-Zugriff
        </p>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10, alignItems: "stretch" }}>

        {/* Connected accounts bar */}
        {accounts.length > 0 && (
          <div
            className="rounded-xl p-4"
            style={{ background: "var(--mantle)", border: "1px solid var(--surface0)" }}
          >
            <p className="text-xs font-semibold mb-3 tracking-wider" style={{ color: "var(--overlay1)" }}>
              VERBUNDENE KONTEN ({accounts.length})
            </p>
            <div className="flex flex-col gap-2">
              {accounts.map((account) => {
                const cfg = PLATFORMS.find((p) => p.id === account.platform);
                const Icon = cfg?.icon || Circle;
                return (
                  <div
                    key={account.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
                    style={{ background: "var(--surface0)" }}
                  >
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: cfg?.color + "22" }}
                    >
                      <Icon size={14} style={{ color: cfg?.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "var(--text)" }}>
                        {account.display_name}
                      </p>
                      <p className="text-xs" style={{ color: "var(--overlay0)" }}>
                        {account.platform}{account.username ? ` · @${account.username}` : ""}
                      </p>
                    </div>
                    <CheckCircle size={15} style={{ color: "var(--green)" }} />
                    <button
                      onClick={() => { if (confirm(`"${account.display_name}" entfernen?`)) removeAccount(account.id).then(() => toast("Entfernt")); }}
                      className="p-1 rounded opacity-40 hover:opacity-100 transition-all"
                      style={{ color: "var(--red)" }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Platform cards */}
        <p className="text-xs font-semibold tracking-wider px-1" style={{ color: "var(--overlay0)" }}>
          KONTO HINZUFÜGEN
        </p>

        {PLATFORMS.map((platform) => {
          const isExpanded = expanded === platform.id;
          const isConnecting = connecting === platform.id;
          const isConnected = connectedIds.has(platform.id);
          const Icon = platform.icon;

          return (
            <div
              key={platform.id}
              className="rounded-xl overflow-hidden"
              style={{ width: "100%", border: `1px solid ${isExpanded ? platform.color + "60" : "var(--surface0)"}`, transition: "border-color 0.2s" }}
            >
              {/* Card header */}
              <button
                style={{ display: "flex", width: "100%", alignItems: "center", gap: 12, padding: "10px 14px", textAlign: "left", background: "var(--mantle)" }}
                onClick={() => !platform.comingSoon && setExpanded(isExpanded ? null : platform.id)}
                disabled={!!platform.comingSoon}
              >
                {/* Icon with gradient bg */}
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: platform.gradient }}
                >
                  <Icon size={17} color="white" />
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm" style={{ color: "var(--text)" }}>
                      {platform.label}
                    </span>
                    {isConnected && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ background: "var(--green)22", color: "var(--green)" }}>
                        Verbunden
                      </span>
                    )}
                    {platform.comingSoon && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1"
                        style={{ background: "var(--yellow)22", color: "var(--yellow)" }}>
                        <Clock size={10} /> In Entwicklung
                      </span>
                    )}
                  </div>
                  {platform.note && !isExpanded && (
                    <p className="text-xs mt-0.5" style={{ color: "var(--overlay0)" }}>{platform.note}</p>
                  )}
                </div>

                {!platform.comingSoon && (
                  isExpanded ? <ChevronUp size={16} style={{ color: "var(--overlay1)" }} />
                             : <ChevronDown size={16} style={{ color: "var(--overlay1)" }} />
                )}
              </button>

              {/* Expanded form */}
              {isExpanded && !platform.comingSoon && (
                <div className="px-4 pb-4 space-y-3" style={{ background: "var(--mantle)" }}>
                  {/* Divider */}
                  <div style={{ height: 1, background: "var(--surface0)" }} />

                  {platform.note && (
                    <p className="text-xs py-2 px-3 rounded-lg"
                      style={{ background: "var(--yellow)15", color: "var(--yellow)", borderLeft: `3px solid var(--yellow)` }}>
                      {platform.note}
                    </p>
                  )}

                  {/* Help links */}
                  {platform.helpLinks.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      {platform.helpLinks.map((link) => (
                        <a
                          key={link.url}
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 text-xs hover:underline"
                          style={{ color: "var(--blue)" }}
                        >
                          <ExternalLink size={11} />
                          {link.label}
                        </a>
                      ))}
                    </div>
                  )}

                  {/* Fields grid */}
                  <div className={`grid gap-3 ${platform.fields.length > 2 ? "grid-cols-2" : "grid-cols-1"}`}>
                    {platform.fields.map((field) => (
                      <div key={field.key}>
                        <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--subtext0)" }}>
                          {field.label}
                        </label>
                        <input
                          type={field.type}
                          placeholder={field.placeholder}
                          value={formData[`${platform.id}_${field.key}`] || ""}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, [`${platform.id}_${field.key}`]: e.target.value }))
                          }
                          style={{
                            background: "var(--surface0)",
                            border: "1px solid var(--surface1)",
                            borderRadius: 8,
                            padding: "8px 12px",
                            color: "var(--text)",
                            width: "100%",
                            fontSize: 13,
                            outline: "none",
                          }}
                          onFocus={(e) => (e.target.style.borderColor = platform.color)}
                          onBlur={(e) => (e.target.style.borderColor = "var(--surface1)")}
                        />
                      </div>
                    ))}
                  </div>

                  {/* Connect button */}
                  <button
                    onClick={() => handleConnect(platform.id)}
                    disabled={isConnecting}
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                    style={{
                      background: platform.gradient,
                      color: "white",
                      boxShadow: isConnecting ? "none" : `0 4px 15px ${platform.color}40`,
                    }}
                  >
                    {isConnecting ? (
                      <><Loader size={15} className="animate-spin" /> Verbinde…</>
                    ) : (
                      <><Plus size={15} /> Verbinden</>
                    )}
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {/* Privacy footer */}
        <div
          className="rounded-xl p-4 flex items-center gap-3"
          style={{ background: "var(--surface0)44", border: "1px solid var(--surface0)" }}
        >
          <span style={{ fontSize: 20 }}>🔒</span>
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
              Ihre Daten bleiben auf Ihrem Computer
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--overlay0)" }}>
              AES-256 verschlüsselt · kein Cloud-Zugriff · DSGVO-konform
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
