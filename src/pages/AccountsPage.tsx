import { useState, useEffect } from "react";
import { Plus, Trash2, CheckCircle, XCircle, Loader, Instagram, Facebook, Linkedin, Twitter, Mail, MessageCircle, Bot } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useAccountsStore, type Platform } from "../store/accounts";
import toast from "react-hot-toast";

// Platforms using Meta OAuth (no manual credential entry)
const META_OAUTH_PLATFORMS = ["instagram", "facebook"];

const PLATFORMS_CONFIG = [
  {
    id: "instagram" as Platform,
    label: "Instagram",
    color: "#E1306C",
    icon: Instagram,
    oauthOnly: true,
    fields: [],
    note: "Verbindung über Meta OAuth — Sie werden zu Facebook weitergeleitet",
  },
  {
    id: "facebook" as Platform,
    label: "Facebook",
    color: "#1877F2",
    icon: Facebook,
    oauthOnly: true,
    fields: [],
    note: "Verbindung über Meta OAuth — erfordert eine Facebook-Seite",
  },
  {
    id: "whatsapp" as Platform,
    label: "WhatsApp",
    color: "#25D366",
    icon: MessageCircle,
    fields: [
      { key: "phone", label: "Telefonnummer (mit +49...)", type: "text" },
    ],
    note: "QR-Code wird nach dem Verbinden angezeigt",
  },
  {
    id: "linkedin" as Platform,
    label: "LinkedIn",
    color: "#0A66C2",
    icon: Linkedin,
    fields: [
      { key: "email", label: "E-Mail", type: "text" },
      { key: "password", label: "Passwort", type: "password" },
    ],
  },
  {
    id: "twitter" as Platform,
    label: "Twitter / X",
    color: "#1DA1F2",
    icon: Twitter,
    fields: [
      { key: "api_key",      label: "API Key",           type: "text" },
      { key: "api_secret",   label: "API Secret",        type: "password" },
      { key: "access_token", label: "Access Token",      type: "text" },
      { key: "access_secret",label: "Access Token Secret",type: "password" },
    ],
    note: "API-Schlüssel von developer.twitter.com",
  },
  {
    id: "telegram" as Platform,
    label: "Telegram",
    color: "#2AABEE",
    icon: Bot,
    fields: [
      { key: "phone",    label: "Telefonnummer",  type: "text" },
      { key: "api_id",   label: "API ID",         type: "text" },
      { key: "api_hash", label: "API Hash",       type: "password" },
    ],
    note: "API-Zugangsdaten von my.telegram.org",
  },
  {
    id: "email" as Platform,
    label: "E-Mail",
    color: "#EA4335",
    icon: Mail,
    fields: [
      { key: "email",      label: "E-Mail-Adresse",  type: "text" },
      { key: "password",   label: "Passwort",        type: "password" },
      { key: "imap_host",  label: "IMAP-Server",     type: "text", placeholder: "imap.gmail.com" },
      { key: "smtp_host",  label: "SMTP-Server",     type: "text", placeholder: "smtp.gmail.com" },
    ],
  },
];

export default function AccountsPage() {
  const { accounts, fetchAccounts, addAccount, removeAccount } = useAccountsStore();
  const [connecting, setConnecting] = useState<Platform | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});

  useEffect(() => { fetchAccounts(); }, []);

  const handleMetaOAuth = async (platform: Platform) => {
    try {
      setConnecting(platform);
      toast("Browser wird geöffnet — bitte bei Meta anmelden...", { icon: "🌐" });
      const result: any = await invoke("start_meta_oauth", { platform });
      if (result?.success) {
        await fetchAccounts();
        toast.success(`${result.account.display_name} erfolgreich verbunden!`);
      }
    } catch (e: any) {
      toast.error(`OAuth Fehler: ${e}`);
    } finally {
      setConnecting(null);
    }
  };

  const handleConnect = async (platform: Platform) => {
    if (META_OAUTH_PLATFORMS.includes(platform)) {
      return handleMetaOAuth(platform);
    }
    try {
      setConnecting(platform);
      const creds: Record<string, string> = {};
      const config = PLATFORMS_CONFIG.find((p) => p.id === platform);
      config?.fields.forEach((f) => {
        creds[f.key] = formData[`${platform}_${f.key}`] || "";
      });
      await addAccount(platform, creds);
      toast.success(`${platform} erfolgreich verbunden!`);
      setConnecting(null);
      setFormData({});
    } catch (e: any) {
      toast.error(`Verbindungsfehler: ${e}`);
      setConnecting(null);
    }
  };

  const handleRemove = async (id: string, name: string) => {
    if (!confirm(`Konto "${name}" wirklich entfernen?`)) return;
    await removeAccount(id);
    toast.success("Konto entfernt");
  };

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div
        className="px-6 py-4 border-b shrink-0"
        style={{ borderColor: "var(--surface0)" }}
      >
        <h1 className="text-lg font-semibold" style={{ color: "var(--text)" }}>
          Konten verwalten
        </h1>
        <p className="text-sm" style={{ color: "var(--overlay0)" }}>
          Alle Zugangsdaten werden verschlüsselt lokal gespeichert
        </p>
      </div>

      <div className="p-6 space-y-4">
        {/* Connected accounts */}
        {accounts.length > 0 && (
          <div>
            <h2 className="text-sm font-medium mb-3" style={{ color: "var(--subtext0)" }}>
              VERBUNDENE KONTEN
            </h2>
            <div className="space-y-2">
              {accounts.map((account) => {
                const config = PLATFORMS_CONFIG.find((p) => p.id === account.platform);
                const Icon = config?.icon || Plus;
                const color = config?.color || "var(--text)";
                return (
                  <div
                    key={account.id}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl"
                    style={{ background: "var(--mantle)", border: "1px solid var(--surface0)" }}
                  >
                    <Icon size={18} style={{ color }} />
                    <div className="flex-1">
                      <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                        {account.display_name}
                      </p>
                      <p className="text-xs" style={{ color: "var(--overlay0)" }}>
                        {account.platform} · {account.username || ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {account.status === "connected" && (
                        <CheckCircle size={16} style={{ color: "var(--green)" }} />
                      )}
                      {account.status === "error" && (
                        <XCircle size={16} style={{ color: "var(--red)" }} />
                      )}
                      {account.status === "connecting" && (
                        <Loader size={16} className="animate-spin" style={{ color: "var(--blue)" }} />
                      )}
                      <button
                        onClick={() => handleRemove(account.id, account.display_name)}
                        className="p-1.5 rounded-lg hover:opacity-80 transition-all"
                        style={{ color: "var(--overlay0)" }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Add new account */}
        <div>
          <h2 className="text-sm font-medium mb-3" style={{ color: "var(--subtext0)" }}>
            KONTO HINZUFÜGEN
          </h2>
          <div className="grid grid-cols-1 gap-4">
            {PLATFORMS_CONFIG.map((platform) => {
              const Icon = platform.icon;
              const isConnecting = connecting === platform.id;
              const alreadyConnected = accounts.some(
                (a) => a.platform === platform.id && a.status === "connected"
              );

              return (
                <div
                  key={platform.id}
                  className="rounded-xl p-4"
                  style={{ background: "var(--mantle)", border: "1px solid var(--surface0)" }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Icon size={18} style={{ color: platform.color }} />
                    <span className="font-medium text-sm" style={{ color: "var(--text)" }}>
                      {platform.label}
                    </span>
                    {alreadyConnected && (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: "var(--green)20", color: "var(--green)" }}
                      >
                        Verbunden
                      </span>
                    )}
                  </div>

                  {platform.note && (
                    <p className="text-xs mb-3" style={{ color: "var(--overlay0)" }}>
                      ℹ️ {platform.note}
                    </p>
                  )}

                  {platform.fields.length > 0 && (
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      {platform.fields.map((field) => (
                        <div key={field.key}>
                          <label className="block text-xs mb-1" style={{ color: "var(--subtext0)" }}>
                            {field.label}
                          </label>
                          <input
                            type={field.type}
                            placeholder={"placeholder" in field ? (field as any).placeholder : ""}
                            value={formData[`${platform.id}_${field.key}`] || ""}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                [`${platform.id}_${field.key}`]: e.target.value,
                              }))
                            }
                            style={{
                              background: "var(--surface0)",
                              border: "1px solid var(--surface1)",
                              borderRadius: 6,
                              padding: "6px 10px",
                              color: "var(--text)",
                              width: "100%",
                              fontSize: 13,
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={() => handleConnect(platform.id)}
                    disabled={isConnecting}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                    style={{ background: platform.color, color: "white" }}
                  >
                    {isConnecting ? (
                      <Loader size={14} className="animate-spin" />
                    ) : (
                      <Plus size={14} />
                    )}
                    {isConnecting
                      ? "Verbinde..."
                      : (platform as any).oauthOnly
                      ? "Mit Meta anmelden →"
                      : "Verbinden"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Privacy notice */}
        <div
          className="rounded-xl p-4 flex items-start gap-3"
          style={{ background: "var(--surface0)50", border: "1px solid var(--surface0)" }}
        >
          <span className="text-lg">🔒</span>
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
              Datenschutz: Ihre Daten bleiben auf Ihrem Computer
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--overlay0)" }}>
              Alle Zugangsdaten werden mit AES-256 verschlüsselt lokal gespeichert.
              Kein Cloud-Zugriff. DSGVO-konform.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
