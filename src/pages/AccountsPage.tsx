import { useState, useEffect, useRef } from "react";
import {
  Plus, Trash2, CheckCircle, Loader,
  Instagram, Facebook, Linkedin, Twitter, Mail,
  MessageCircle, Bot, ExternalLink, ChevronDown, ChevronUp,
  Clock, Circle, RefreshCw, LogOut
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useAccountsStore, type Platform } from "../store/accounts";
import toast from "react-hot-toast";

// ── WhatsApp QR flow ─────────────────────────────────────────────────────────
function WhatsAppConnect({ onConnected }: { onConnected: (phone: string) => void }) {
  const [step, setStep] = useState<"idle" | "checking" | "no-node" | "installing" | "starting" | "qr" | "connected" | "error">("checking");
  const [nodeVersion, setNodeVersion] = useState<string | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [installMethod, setInstallMethod] = useState<"winget" | "browser" | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check Node.js on mount
  useEffect(() => {
    invoke<string | null>("check_nodejs").then((ver) => {
      if (ver) {
        setNodeVersion(ver);
        setStep("idle");
      } else {
        setStep("no-node");
      }
    });
  }, []);

  const stopPoll = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };

  const startConnect = async () => {
    setStep("starting");
    setErrorMsg("");
    try {
      await invoke("start_whatsapp_sidecar");
      // wait a moment for server to start
      await new Promise(r => setTimeout(r, 1500));
      await invoke<any>("whatsapp_call", { method: "POST", path: "/instance/init", body: null });
      setStep("qr");
      // Poll for QR / connection
      pollRef.current = setInterval(async () => {
        try {
          const res = await invoke<any>("whatsapp_call", { method: "GET", path: "/instance/qr", body: null });
          if (res.connected) {
            stopPoll();
            const status = await invoke<any>("whatsapp_call", { method: "GET", path: "/instance/status", body: null });
            setPhone(status.phone || "WhatsApp");
            setStep("connected");
            onConnected(status.phone || "WhatsApp");
          } else if (res.qr) {
            setQrImage(res.qr);
          }
        } catch { /* server not ready yet */ }
      }, 2000);
    } catch (e: any) {
      setStep("error");
      setErrorMsg(String(e));
    }
  };

  const logout = async () => {
    stopPoll();
    try {
      await invoke("whatsapp_call", { method: "POST", path: "/instance/logout", body: null });
      await invoke("stop_whatsapp_sidecar");
    } catch { /* ok */ }
    setStep("idle");
    setQrImage(null);
    setPhone(null);
  };

  useEffect(() => () => stopPoll(), []);

  const installNode = async () => {
    setStep("installing");
    try {
      const method = await invoke<string>("install_nodejs");
      setInstallMethod(method === "winget" ? "winget" : "browser");
    } catch (e) {
      setStep("no-node");
      toast.error("Installation fehlgeschlagen. Bitte manuell installieren: nodejs.org");
    }
  };

  const recheckNode = async () => {
    setStep("checking");
    const ver = await invoke<string | null>("check_nodejs");
    if (ver) { setNodeVersion(ver); setStep("idle"); }
    else setStep(installMethod ? "installing" : "no-node");
  };

  if (step === "checking") return (
    <div style={{ padding: "14px", display: "flex", alignItems: "center", gap: 8, color: "var(--subtext0)", fontSize: 13 }}>
      <Loader size={14} className="animate-spin" /> Node.js wird geprüft…
    </div>
  );

  if (step === "no-node") return (
    <div style={{ padding: "14px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px", borderRadius: 10, background: "var(--yellow)15", border: "1px solid var(--yellow)40", marginBottom: 12 }}>
        <span style={{ fontSize: 18 }}>⚠️</span>
        <div>
          <p style={{ color: "var(--yellow)", fontWeight: 600, fontSize: 13 }}>Node.js nicht gefunden</p>
          <p style={{ color: "var(--overlay1)", fontSize: 12, marginTop: 2 }}>
            WhatsApp benötigt Node.js (kostenlos, von nodejs.org).
          </p>
        </div>
      </div>
      <button onClick={installNode}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "10px 0", borderRadius: 10, background: "linear-gradient(135deg, #25D366, #128C7E)", color: "white", fontWeight: 600, fontSize: 13, border: "none", cursor: "pointer", boxShadow: "0 4px 15px #25D36640", marginBottom: 8 }}>
        <Plus size={15} /> Node.js automatisch installieren
      </button>
      <p style={{ color: "var(--overlay0)", fontSize: 11, textAlign: "center" }}>
        Verwendet Windows winget — oder öffnet nodejs.org als Fallback
      </p>
    </div>
  );

  if (step === "installing") return (
    <div style={{ padding: "14px" }}>
      {installMethod === "winget" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text)", fontSize: 13 }}>
            <Loader size={14} className="animate-spin" style={{ color: "var(--green)" }} />
            <span><b>Node.js wird installiert</b> (winget läuft im Hintergrund…)</span>
          </div>
          <p style={{ color: "var(--overlay1)", fontSize: 12 }}>
            Die Installation dauert ca. 1–2 Minuten. Klicken Sie danach auf "Prüfen".
          </p>
          <button onClick={recheckNode}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, background: "var(--surface0)", color: "var(--text)", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            <RefreshCw size={13} /> Node.js prüfen
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text)", fontSize: 13 }}>
            <ExternalLink size={14} style={{ color: "var(--blue)" }} />
            <span>Browser geöffnet → <b>nodejs.org</b></span>
          </div>
          <p style={{ color: "var(--overlay1)", fontSize: 12 }}>
            Laden Sie Node.js LTS herunter, installieren Sie es, und klicken Sie danach auf "Prüfen".
          </p>
          <button onClick={recheckNode}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, background: "var(--surface0)", color: "var(--text)", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            <RefreshCw size={13} /> Node.js prüfen
          </button>
        </div>
      )}
    </div>
  );

  if (step === "connected") return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px" }}>
      <CheckCircle size={18} style={{ color: "var(--green)" }} />
      <div style={{ flex: 1 }}>
        <p style={{ color: "var(--text)", fontSize: 13, fontWeight: 600 }}>Verbunden</p>
        <p style={{ color: "var(--overlay0)", fontSize: 12 }}>{phone}</p>
      </div>
      <button onClick={logout} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--red)", background: "none", border: "none", cursor: "pointer", padding: "6px 10px", borderRadius: 6 }}>
        <LogOut size={13} /> Abmelden
      </button>
    </div>
  );

  if (step === "error") return (
    <div style={{ padding: "12px 14px" }}>
      <p style={{ color: "var(--red)", fontSize: 12, marginBottom: 8 }}>
        ⚠️ {errorMsg.includes("Node") ? "Node.js nicht gefunden. Bitte installieren: nodejs.org" : errorMsg.slice(0, 120)}
      </p>
      <button onClick={startConnect} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "white", background: "#25D366", border: "none", cursor: "pointer", padding: "8px 16px", borderRadius: 8, fontWeight: 600 }}>
        <RefreshCw size={13} /> Erneut versuchen
      </button>
    </div>
  );

  if (step === "qr" || step === "starting") return (
    <div style={{ padding: "14px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      {step === "starting" || !qrImage ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--subtext0)", fontSize: 13 }}>
          <Loader size={16} className="animate-spin" />
          WhatsApp-Server wird gestartet…
        </div>
      ) : (
        <>
          <p style={{ color: "var(--text)", fontSize: 13, fontWeight: 600 }}>QR-Code mit WhatsApp scannen</p>
          <p style={{ color: "var(--overlay1)", fontSize: 12, textAlign: "center" }}>
            Öffnen Sie WhatsApp → Einstellungen → Verknüpfte Geräte → Gerät hinzufügen
          </p>
          <img src={qrImage} alt="WhatsApp QR Code"
            style={{ width: 220, height: 220, borderRadius: 12, border: "3px solid #25D366", background: "white", padding: 4 }} />
          <p style={{ color: "var(--overlay0)", fontSize: 11 }}>QR-Code aktualisiert sich automatisch</p>
        </>
      )}
    </div>
  );

  return (
    <div style={{ padding: "14px" }}>
      <p style={{ color: "var(--overlay1)", fontSize: 12, marginBottom: 10 }}>
        Verbinden Sie Ihr WhatsApp über QR-Code — kein separater Account nötig.
      </p>
      {nodeVersion && (
        <p style={{ color: "var(--overlay0)", fontSize: 11, marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
          <CheckCircle size={11} style={{ color: "var(--green)" }} /> Node.js {nodeVersion} ✓
        </p>
      )}
      <button onClick={startConnect}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "10px 0", borderRadius: 10, background: "linear-gradient(135deg, #25D366, #128C7E)", color: "white", fontWeight: 600, fontSize: 13, border: "none", cursor: "pointer", boxShadow: "0 4px 15px #25D36640" }}>
        <MessageCircle size={15} /> Mit WhatsApp verbinden
      </button>
    </div>
  );
}

// ── Platform definitions ────────────────────────────────────────────────────

const PLATFORMS = [
  {
    id: "instagram" as Platform,
    label: "Instagram",
    color: "#E1306C",
    gradient: "linear-gradient(135deg, #E1306C, #833AB4)",
    icon: Instagram,
    fields: [],
    note: "✅ Offizielle Meta OAuth — kein Passwort gespeichert",
    helpLinks: [],
    useMetaOAuth: true,
  },
  {
    id: "facebook" as Platform,
    label: "Facebook",
    color: "#1877F2",
    gradient: "linear-gradient(135deg, #1877F2, #0a4da6)",
    icon: Facebook,
    fields: [],
    note: "✅ Offizielle Meta OAuth — erfordert eine Facebook-Seite",
    helpLinks: [],
    useMetaOAuth: true,
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

  // Telegram two-step OTP flow
  const [tgStep, setTgStep] = useState<"idle" | "code_sent">("idle");
  const [tgCodeHash, setTgCodeHash] = useState("");
  const [tgCode, setTgCode] = useState("");
  const [tgVerifying, setTgVerifying] = useState(false);

  useEffect(() => { fetchAccounts(); }, []);

  const handleMetaOAuth = async (platform: Platform) => {
    try {
      setConnecting(platform);
      toast("🌐 Browser wird geöffnet — bitte bei Meta anmelden...", { duration: 6000 });
      const result: any = await invoke("start_meta_oauth", { platform });
      if (result?.success) {
        await fetchAccounts();
        toast.success(`✓ ${result.account.display_name} erfolgreich verbunden!`);
        setExpanded(null);
      }
    } catch (e: any) {
      toast.error(`OAuth Fehler: ${String(e).slice(0, 120)}`);
    } finally {
      setConnecting(null);
    }
  };

  const handleConnect = async (platform: Platform) => {
    const cfg = PLATFORMS.find((p) => p.id === platform)!;
    if ((cfg as any).useMetaOAuth) {
      return handleMetaOAuth(platform);
    }
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

  const handleTelegramConnect = async () => {
    const creds = {
      phone: formData["telegram_phone"]?.trim() || "",
      api_id: formData["telegram_api_id"]?.trim() || "",
      api_hash: formData["telegram_api_hash"]?.trim() || "",
    };
    if (!creds.phone || !creds.api_id || !creds.api_hash) {
      toast.error("Bitte alle Telegram-Felder ausfüllen");
      return;
    }
    try {
      setConnecting("telegram");
      const res = await invoke<any>("send_to_sidecar", {
        command: { action: "connect", platform: "telegram", params: { credentials: creds } },
      });
      if (res.success) {
        // Session already authorized — just add to DB
        await addAccount("telegram", creds);
        toast.success("✓ Telegram erfolgreich verbunden!");
        setExpanded(null);
        setTgStep("idle");
      } else if (res.error === "code_required") {
        setTgCodeHash(res.phone_code_hash || "");
        setTgStep("code_sent");
        toast("📱 Code wurde per Telegram gesendet. Bitte eingeben.", { duration: 5000 });
      } else {
        toast.error(String(res.error).slice(0, 150));
      }
    } catch (e: any) {
      toast.error(String(e).slice(0, 150));
    } finally {
      setConnecting(null);
    }
  };

  const handleTelegramVerify = async () => {
    const creds = {
      phone: formData["telegram_phone"]?.trim() || "",
      api_id: formData["telegram_api_id"]?.trim() || "",
      api_hash: formData["telegram_api_hash"]?.trim() || "",
    };
    if (!tgCode.trim()) {
      toast.error("Bitte den Code eingeben");
      return;
    }
    try {
      setTgVerifying(true);
      const res = await invoke<any>("send_to_sidecar", {
        command: {
          action: "verify_code",
          platform: "telegram",
          params: { credentials: creds, code: tgCode.trim(), phone_code_hash: tgCodeHash },
        },
      });
      if (res.success) {
        await addAccount("telegram", creds);
        toast.success("✓ Telegram erfolgreich verbunden!");
        setExpanded(null);
        setTgStep("idle");
        setTgCode("");
      } else {
        toast.error(String(res.error || "Falscher Code").slice(0, 150));
      }
    } catch (e: any) {
      toast.error(String(e).slice(0, 150));
    } finally {
      setTgVerifying(false);
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
                onClick={() => setExpanded(isExpanded ? null : platform.id)}
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
                    {platform.id === "whatsapp" && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1"
                        style={{ background: "var(--green)22", color: "var(--green)" }}>
                        <MessageCircle size={10} /> QR-Code
                      </span>
                    )}
                  </div>
                  {platform.note && !isExpanded && (
                    <p className="text-xs mt-0.5" style={{ color: "var(--overlay0)" }}>{platform.note}</p>
                  )}
                </div>

                <ChevronUp size={16} style={{ color: "var(--overlay1)", display: isExpanded ? "block" : "none" }} />
                <ChevronDown size={16} style={{ color: "var(--overlay1)", display: isExpanded ? "none" : "block" }} />
              </button>

              {/* Expanded form */}
              {isExpanded && platform.id === "whatsapp" && (
                <div style={{ background: "var(--mantle)", borderTop: "1px solid var(--surface0)" }}>
                  <WhatsAppConnect onConnected={(phone) => {
                    toast.success(`✓ WhatsApp verbunden: ${phone}`);
                    setExpanded(null);
                  }} />
                </div>
              )}
              {isExpanded && platform.id !== "whatsapp" && platform.id !== "telegram" && (
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
                    ) : (platform as any).useMetaOAuth ? (
                      <><Plus size={15} /> Mit Meta anmelden →</>
                    ) : (
                      <><Plus size={15} /> Verbinden</>
                    )}
                  </button>
                </div>
              )}

              {/* Telegram two-step flow */}
              {isExpanded && platform.id === "telegram" && (
                <div className="px-4 pb-4 space-y-3" style={{ background: "var(--mantle)" }}>
                  <div style={{ height: 1, background: "var(--surface0)" }} />

                  <p className="text-xs py-2 px-3 rounded-lg"
                    style={{ background: "var(--yellow)15", color: "var(--yellow)", borderLeft: "3px solid var(--yellow)" }}>
                    API ID und Hash aus my.telegram.org/apps
                  </p>

                  <div className="flex flex-col gap-1.5">
                    <a href="https://my.telegram.org/apps" target="_blank" rel="noreferrer"
                      className="flex items-center gap-2 text-xs hover:underline" style={{ color: "var(--blue)" }}>
                      <ExternalLink size={11} /> API ID &amp; Hash erstellen → my.telegram.org
                    </a>
                  </div>

                  {tgStep === "idle" && (
                    <>
                      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr" }}>
                        {[
                          { key: "phone", label: "Telefonnummer", type: "text", placeholder: "+49 160 000 0000" },
                          { key: "api_id", label: "API ID", type: "text", placeholder: "12345678" },
                          { key: "api_hash", label: "API Hash", type: "password", placeholder: "32-stelliger Hash" },
                        ].map((f) => (
                          <div key={f.key}>
                            <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--subtext0)" }}>
                              {f.label}
                            </label>
                            <input
                              type={f.type}
                              placeholder={f.placeholder}
                              value={formData[`telegram_${f.key}`] || ""}
                              onChange={(e) => setFormData((p) => ({ ...p, [`telegram_${f.key}`]: e.target.value }))}
                              style={{ background: "var(--surface0)", border: "1px solid var(--surface1)", borderRadius: 8, padding: "8px 12px", color: "var(--text)", width: "100%", fontSize: 13, outline: "none" }}
                              onFocus={(e) => (e.target.style.borderColor = "#2AABEE")}
                              onBlur={(e) => (e.target.style.borderColor = "var(--surface1)")}
                            />
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={handleTelegramConnect}
                        disabled={connecting === "telegram"}
                        className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                        style={{ background: "linear-gradient(135deg, #2AABEE, #1a7bbf)", color: "white", boxShadow: "0 4px 15px #2AABEE40" }}
                      >
                        {connecting === "telegram"
                          ? <><Loader size={15} className="animate-spin" /> Sende Code…</>
                          : <><Plus size={15} /> Code senden</>}
                      </button>
                    </>
                  )}

                  {tgStep === "code_sent" && (
                    <>
                      <div style={{ padding: "10px 14px", borderRadius: 10, background: "var(--green)15", border: "1px solid var(--green)40", display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 18 }}>📱</span>
                        <p style={{ color: "var(--green)", fontSize: 13, fontWeight: 600 }}>
                          Bestätigungscode wurde per Telegram gesendet!
                        </p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--subtext0)" }}>
                          6-stelliger Code aus Telegram
                        </label>
                        <input
                          type="text"
                          placeholder="12345"
                          maxLength={6}
                          value={tgCode}
                          onChange={(e) => setTgCode(e.target.value.replace(/\D/g, ""))}
                          autoFocus
                          style={{ background: "var(--surface0)", border: "2px solid #2AABEE", borderRadius: 8, padding: "10px 12px", color: "var(--text)", width: "100%", fontSize: 18, outline: "none", textAlign: "center", letterSpacing: 4 }}
                        />
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={() => { setTgStep("idle"); setTgCode(""); }}
                          style={{ flex: 1, padding: "8px", borderRadius: 8, background: "var(--surface0)", color: "var(--text)", border: "none", cursor: "pointer", fontSize: 13 }}
                        >
                          Zurück
                        </button>
                        <button
                          onClick={handleTelegramVerify}
                          disabled={tgVerifying || tgCode.length < 5}
                          className="flex items-center justify-center gap-2 disabled:opacity-50"
                          style={{ flex: 2, padding: "8px", borderRadius: 8, background: "linear-gradient(135deg, #2AABEE, #1a7bbf)", color: "white", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
                        >
                          {tgVerifying ? <><Loader size={13} className="animate-spin" /> Prüfe…</> : <><CheckCircle size={13} /> Bestätigen</>}
                        </button>
                      </div>
                    </>
                  )}
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
