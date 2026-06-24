import { useState, useEffect, useRef } from "react";
import {
  Plus, Trash2, CheckCircle, Loader,
  Instagram, Facebook, Linkedin, Twitter, Mail,
  MessageCircle, Bot, ExternalLink, ChevronDown, ChevronUp,
  Clock, Circle, RefreshCw, LogOut
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useAccountsStore, type Platform } from "../store/accounts";

const openExternal = (url: string) =>
  invoke("open_external_url", { url }).catch(() => {
    // fallback: try window.open (works in dev browser mode)
    window.open(url, "_blank");
  });
import toast from "react-hot-toast";

// ── WhatsApp QR flow ─────────────────────────────────────────────────────────
function WhatsAppConnect({ onConnected }: { onConnected: (phone: string) => void }) {
  const [step, setStep] = useState<"idle" | "checking" | "no-node" | "downloading" | "setup-deps" | "starting" | "qr" | "connected" | "error">("checking");
  const [nodeVersion, setNodeVersion] = useState<string | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [downloadProgress, setDownloadProgress] = useState("");
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
    }).catch(() => setStep("no-node"));
  }, []);

  const stopPoll = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };

  const startConnect = async () => {
    setStep("setup-deps");
    setErrorMsg("");
    try {
      await invoke("setup_whatsapp_deps");
      setStep("starting");
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
    setStep("downloading");
    setDownloadProgress("Node.js wird heruntergeladen (~30 MB)…");
    try {
      await invoke<string>("download_nodejs");
      setDownloadProgress("Fertig!");
      const ver = await invoke<string | null>("check_nodejs");
      if (ver) { setNodeVersion(ver); setStep("idle"); }
      else setStep("no-node");
    } catch (e: any) {
      setStep("no-node");
      toast.error("Download fehlgeschlagen: " + String(e).slice(0, 80));
    }
  };

  const recheckNode = async () => {
    setStep("checking");
    try {
      const ver = await invoke<string | null>("check_nodejs");
      if (ver) { setNodeVersion(ver); setStep("idle"); }
      else setStep("no-node");
    } catch {
      setStep("no-node");
    }
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
            WhatsApp benötigt Node.js. Wird automatisch heruntergeladen.
          </p>
        </div>
      </div>
      <button onClick={installNode}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "10px 0", borderRadius: 10, background: "linear-gradient(135deg, #25D366, #128C7E)", color: "white", fontWeight: 600, fontSize: 13, border: "none", cursor: "pointer", boxShadow: "0 4px 15px #25D36640", marginBottom: 8 }}>
        <Plus size={15} /> Node.js automatisch installieren (~30 MB)
      </button>
      <button onClick={recheckNode}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", padding: "8px 0", borderRadius: 8, background: "var(--surface0)", color: "var(--subtext1)", border: "none", cursor: "pointer", fontSize: 12, marginBottom: 6 }}>
        <RefreshCw size={12} /> Bereits installiert? Erneut prüfen
      </button>
      <p style={{ color: "var(--overlay0)", fontSize: 11, textAlign: "center" }}>
        Nach manueller Installation: App neu starten, dann "Erneut prüfen"
      </p>
    </div>
  );

  if (step === "downloading") return (
    <div style={{ padding: "14px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px", borderRadius: 10, background: "var(--green)12", border: "1px solid var(--green)30" }}>
        <Loader size={16} className="animate-spin" style={{ color: "var(--green)", flexShrink: 0 }} />
        <div>
          <p style={{ color: "var(--text)", fontWeight: 600, fontSize: 13 }}>Node.js wird installiert…</p>
          <p style={{ color: "var(--overlay1)", fontSize: 12, marginTop: 3 }}>{downloadProgress}</p>
        </div>
      </div>
      <p style={{ color: "var(--overlay0)", fontSize: 11, textAlign: "center" }}>
        Bitte warten — kein Browser, kein Passwort erforderlich.
      </p>
    </div>
  );

  if (step === "setup-deps") return (
    <div style={{ padding: "14px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px", borderRadius: 10, background: "var(--green)12", border: "1px solid var(--green)30" }}>
        <Loader size={16} className="animate-spin" style={{ color: "var(--green)", flexShrink: 0 }} />
        <div>
          <p style={{ color: "var(--text)", fontWeight: 600, fontSize: 13 }}>WhatsApp-Pakete werden installiert…</p>
          <p style={{ color: "var(--overlay1)", fontSize: 12, marginTop: 3 }}>Einmalig ~1-2 Minuten, danach sofort bereit.</p>
        </div>
      </div>
    </div>
  );

  if (step === "starting") return (
    <div style={{ padding: "14px", display: "flex", alignItems: "center", gap: 10, color: "var(--subtext0)", fontSize: 13 }}>
      <Loader size={14} className="animate-spin" /> WhatsApp wird gestartet…
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

  if (step === "error") {
    const isNodeError = errorMsg.includes("Node") || errorMsg.includes("node");
    return (
      <div style={{ padding: "12px 14px" }}>
        {isNodeError ? (
          <>
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
            <button onClick={recheckNode}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", padding: "8px 0", borderRadius: 8, background: "var(--surface0)", color: "var(--subtext1)", border: "none", cursor: "pointer", fontSize: 12 }}>
              <RefreshCw size={13} /> Bereits installiert? Prüfen
            </button>
          </>
        ) : (
          <>
            <p style={{ color: "var(--red)", fontSize: 12, marginBottom: 8 }}>
              ⚠️ {errorMsg.slice(0, 120)}
            </p>
            <button onClick={startConnect} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "white", background: "#25D366", border: "none", cursor: "pointer", padding: "8px 16px", borderRadius: 8, fontWeight: 600 }}>
              <RefreshCw size={13} /> Erneut versuchen
            </button>
          </>
        )}
      </div>
    );
  }

  if (step === "qr" || (step as string) === "starting") return (
    <div style={{ padding: "14px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      {(step as string) === "starting" || !qrImage ? (
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
    useLinkedInCookie: true,
  },
  {
    id: "twitter" as Platform,
    label: "Twitter / X",
    color: "#1DA1F2",
    gradient: "linear-gradient(135deg, #1DA1F2, #0d6eaf)",
    icon: Twitter,
    fields: [],
    note: "✅ OAuth 2.0 — kein API-Key nötig, Browser-Login",
    helpLinks: [],
    useTwitterOAuth: true,
  },
  {
    id: "telegram" as Platform,
    label: "Telegram",
    color: "#2AABEE",
    gradient: "linear-gradient(135deg, #2AABEE, #1a7bbf)",
    icon: Bot,
    fields: [
      { key: "phone", label: "Telefonnummer", type: "text", placeholder: "+49 160 000 0000" },
    ],
    note: "✅ Nur Telefonnummer — Bestätigungscode wird per Telegram gesendet",
    helpLinks: [],
  },
  {
    id: "gmail" as Platform,
    label: "Gmail (Google-Konto)",
    color: "#EA4335",
    gradient: "linear-gradient(135deg, #EA4335, #FBBC05)",
    icon: Mail,
    fields: [],
    note: "✅ OAuth 2.0 — kein Passwort, kein App-Passwort nötig",
    helpLinks: [],
    useGoogleOAuth: true,
  },
  {
    id: "email" as Platform,
    label: "E-Mail (IMAP/SMTP)",
    color: "#7287fd",
    gradient: "linear-gradient(135deg, #7287fd, #4a5ebe)",
    icon: Mail,
    fields: [
      { key: "email",    label: "E-Mail-Adresse",           type: "text",     placeholder: "ihre@email.de" },
      { key: "password", label: "Passwort / App-Passwort",  type: "password", placeholder: "••••••••" },
    ],
    note: "Server wird automatisch erkannt · Outlook, Yahoo, GMX, web.de, etc.",
    helpLinks: [],
  },
];

// ── LinkedIn Connect Component ───────────────────────────────────────────────

function LinkedInConnect({
  isConnecting,
  color,
  gradient,
  onConnect,
}: {
  isConnecting: boolean;
  color: string;
  gradient: string;
  onConnect: (creds: Record<string, string>) => void;
}) {
  const [mode, setMode] = useState<"password" | "cookie">("cookie");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [liAt, setLiAt] = useState("");
  const [jsessionId, setJsessionId] = useState("");

  const handleSubmit = () => {
    if (mode === "cookie") {
      if (!liAt.trim()) { toast.error("Bitte li_at Cookie eingeben"); return; }
      if (!jsessionId.trim()) { toast.error("Bitte JSESSIONID Cookie eingeben (für Posts-Abruf benötigt)"); return; }
      const creds: Record<string,string> = { li_at: liAt.trim(), jsessionid: jsessionId.trim() };
      onConnect(creds);
    } else {
      if (!email.trim() || !password.trim()) { toast.error("Bitte E-Mail und Passwort eingeben"); return; }
      onConnect({ email: email.trim(), password: password.trim() });
    }
  };

  return (
    <div className="px-4 pb-4 space-y-3" style={{ background: "var(--mantle)" }}>
      <div style={{ height: 1, background: "var(--surface0)" }} />

      {/* Mode switcher */}
      <div className="flex gap-2">
        {(["cookie", "password"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={{
              background: mode === m ? color : "var(--surface0)",
              color: mode === m ? "white" : "var(--overlay1)",
              border: `1px solid ${mode === m ? color : "var(--surface1)"}`,
            }}
          >
            {m === "cookie" ? "🍪 Browser-Cookie (empfohlen)" : "🔑 E-Mail / Passwort"}
          </button>
        ))}
      </div>

      {mode === "cookie" ? (
        <>
          <div className="text-xs py-2 px-3 rounded-lg space-y-1"
            style={{ background: "var(--blue)15", color: "var(--blue)", borderLeft: "3px solid var(--blue)" }}>
            <p className="font-semibold">So erhalten Sie den Cookie:</p>
            <ol className="list-decimal list-inside space-y-0.5 text-xs" style={{ color: "var(--subtext0)" }}>
              <li>Öffnen Sie <strong>linkedin.com</strong> im Browser und melden Sie sich an</li>
              <li>Drücken Sie <strong>F12</strong> → Tab <strong>Application</strong> (Chrome) oder <strong>Storage</strong> (Firefox)</li>
              <li>Klicken Sie auf <strong>Cookies → linkedin.com</strong></li>
              <li>Kopieren Sie den Wert von <strong>li_at</strong></li>
            </ol>
          </div>
          {[
            { label: "li_at Cookie-Wert", placeholder: "AQE...", val: liAt, set: setLiAt },
            { label: "JSESSIONID Cookie-Wert", placeholder: 'ajax:123456789...', val: jsessionId, set: setJsessionId },
          ].map((f) => (
            <div key={f.label}>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--subtext0)" }}>{f.label}</label>
              <input
                type="password"
                placeholder={f.placeholder}
                value={f.val}
                onChange={(e) => f.set(e.target.value)}
                style={{ background: "var(--surface0)", border: "1px solid var(--surface1)", borderRadius: 8, padding: "8px 12px", color: "var(--text)", width: "100%", fontSize: 13, outline: "none" }}
                onFocus={(e) => (e.target.style.borderColor = color)}
                onBlur={(e) => (e.target.style.borderColor = "var(--surface1)")}
              />
            </div>
          ))}
        </>
      ) : (
        <>
          <div className="text-xs py-2 px-3 rounded-lg"
            style={{ background: "var(--yellow)15", color: "var(--yellow)", borderLeft: "3px solid var(--yellow)" }}>
            LinkedIn blockiert manchmal automatische Logins. Bei Fehler bitte Browser-Cookie verwenden.
          </div>
          {[
            { key: "email", label: "E-Mail", type: "text", placeholder: "email@example.com", val: email, set: setEmail },
            { key: "password", label: "Passwort", type: "password", placeholder: "LinkedIn-Passwort", val: password, set: setPassword },
          ].map((f) => (
            <div key={f.key}>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--subtext0)" }}>{f.label}</label>
              <input
                type={f.type}
                placeholder={f.placeholder}
                value={f.val}
                onChange={(e) => f.set(e.target.value)}
                style={{ background: "var(--surface0)", border: "1px solid var(--surface1)", borderRadius: 8, padding: "8px 12px", color: "var(--text)", width: "100%", fontSize: 13, outline: "none" }}
                onFocus={(e) => (e.target.style.borderColor = color)}
                onBlur={(e) => (e.target.style.borderColor = "var(--surface1)")}
              />
            </div>
          ))}
        </>
      )}

      <button
        onClick={handleSubmit}
        disabled={isConnecting}
        className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
        style={{ background: gradient, color: "white", boxShadow: isConnecting ? "none" : `0 4px 15px ${color}40` }}
      >
        {isConnecting ? <><Loader size={15} className="animate-spin" /> Verbinde…</> : <><Plus size={15} /> Verbinden</>}
      </button>
    </div>
  );
}

// ── Component ───────────────────────────────────────────────────────────────

function LinkedInCookieUpdate({ accountId, color, onDone }: { accountId: string; color: string; onDone: () => void }) {
  const [liAt, setLiAt] = useState("");
  const [jsessionId, setJsessionId] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!liAt.trim()) { toast.error("Bitte li_at eingeben"); return; }
    if (!jsessionId.trim()) { toast.error("Bitte JSESSIONID eingeben"); return; }
    setSaving(true);
    try {
      await invoke("update_account_credentials", {
        id: accountId,
        credentials: { li_at: liAt.trim(), jsessionid: jsessionId.trim() },
      });
      toast.success("✓ LinkedIn Cookies aktualisiert!");
      onDone();
    } catch (e: any) {
      toast.error(String(e).slice(0, 150));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: "10px 12px", background: "var(--surface0)", borderRadius: 8, display: "flex", flexDirection: "column", gap: 8 }}>
      <p style={{ fontSize: 11, color: "var(--subtext0)", margin: 0 }}>
        F12 → Application → Cookies → linkedin.com → Werte kopieren:
      </p>
      {[
        { label: "li_at", val: liAt, set: setLiAt, placeholder: "AQE..." },
        { label: "JSESSIONID", val: jsessionId, set: setJsessionId, placeholder: "ajax:..." },
      ].map((f) => (
        <div key={f.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: "var(--overlay1)", minWidth: 80 }}>{f.label}</span>
          <input
            type="password"
            placeholder={f.placeholder}
            value={f.val}
            onChange={(e) => f.set(e.target.value)}
            style={{ flex: 1, background: "var(--base)", border: `1px solid ${color}40`, borderRadius: 6, padding: "5px 8px", color: "var(--text)", fontSize: 12, outline: "none" }}
            onFocus={(e) => (e.target.style.borderColor = color)}
            onBlur={(e) => (e.target.style.borderColor = `${color}40`)}
          />
        </div>
      ))}
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={onDone} style={{ flex: 1, padding: "5px", borderRadius: 6, background: "var(--base)", color: "var(--overlay1)", border: "none", cursor: "pointer", fontSize: 12 }}>
          Abbrechen
        </button>
        <button onClick={handleSave} disabled={saving} style={{ flex: 2, padding: "5px", borderRadius: 6, background: color, color: "#fff", border: "none", cursor: saving ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600, opacity: saving ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
          {saving ? <><Loader size={11} style={{ animation: "spin 1s linear infinite" }} /> Speichern…</> : "Cookies speichern"}
        </button>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function AccountsPage() {
  const { accounts, fetchAccounts, addAccount, removeAccount } = useAccountsStore();
  const [connecting, setConnecting] = useState<Platform | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Platform | null>("instagram");
  const [updatingCookies, setUpdatingCookies] = useState<string | null>(null);
  const [plan, setPlan] = useState<string>("solo");

  // Telegram two-step OTP flow
  const [tgStep, setTgStep] = useState<"idle" | "code_sent" | "2fa">("idle");
  const [tgCodeHash, setTgCodeHash] = useState("");
  const [tgCode, setTgCode] = useState("");
  const [tg2fa, setTg2fa] = useState("");
  const [tgCodeType, setTgCodeType] = useState("");
  const [tgVerifying, setTgVerifying] = useState(false);

  useEffect(() => {
    fetchAccounts();
    invoke<{ plan?: string }>("check_license")
      .then((s) => { if (s.plan) setPlan(s.plan.toLowerCase()); })
      .catch(() => {});
  }, []);

  const maxPerPlatform = plan === "agency" ? 10 : plan === "pro" ? 3 : 1;

  const handleTwitterOAuth = async () => {
    try {
      setConnecting("twitter");
      toast("🌐 Browser wird geöffnet — bitte bei Twitter / X anmelden...", { duration: 8000 });
      const result: any = await invoke("start_twitter_oauth");
      if (result?.success) {
        await fetchAccounts();
        toast.success(`✓ @${result.account.username || result.account.display_name} erfolgreich verbunden!`);
        setExpanded(null);
      }
    } catch (e: any) {
      const msg = String(e);
      if (msg.includes("Client ID")) {
        toast.error("Twitter Client ID fehlt. Bitte in Einstellungen → Entwickler eintragen.", { duration: 8000 });
      } else {
        toast.error(`Twitter OAuth Fehler: ${msg.slice(0, 120)}`, { duration: 6000 });
      }
    } finally {
      setConnecting(null);
    }
  };

  const handleGoogleOAuth = async () => {
    try {
      setConnecting("gmail");
      toast("🌐 Browser wird geöffnet — bitte mit Google-Konto anmelden...", { duration: 8000 });
      const result: any = await invoke("start_google_oauth");
      if (result?.success) {
        await fetchAccounts();
        toast.success(`✓ ${result.account.display_name} (${result.account.username}) erfolgreich verbunden!`);
        setExpanded(null);
      }
    } catch (e: any) {
      const msg = String(e);
      if (msg.includes("Client ID")) {
        toast.error("Google Client ID fehlt. Bitte in Einstellungen → Entwickler eintragen.", { duration: 8000 });
      } else {
        toast.error(`Google OAuth Fehler: ${msg.slice(0, 120)}`, { duration: 6000 });
      }
    } finally {
      setConnecting(null);
    }
  };

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
    if ((cfg as any).useTwitterOAuth) {
      return handleTwitterOAuth();
    }
    if ((cfg as any).useGoogleOAuth) {
      return handleGoogleOAuth();
    }
    const creds: Record<string, string> = {};
    cfg.fields.forEach((f) => {
      // Primary: React state. Fallback: read from DOM input (handles clipboard paste in WebView2)
      let val = formData[`${platform}_${f.key}`]?.trim() || "";
      if (!val) {
        const inp = document.querySelector<HTMLInputElement>(`input[placeholder="${f.placeholder}"]`);
        val = inp?.value?.trim() || "";
        if (val) setFormData((prev) => ({ ...prev, [`${platform}_${f.key}`]: val }));
      }
      creds[f.key] = val;
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
      let friendly = msg.slice(0, 200);
      if (msg.includes("challenge_required") || msg.includes("checkpoint"))
        friendly = "Instagram erfordert Sicherheitsüberprüfung. Bitte im Browser einloggen und erneut versuchen.";
      else if (msg.includes("App-Passwort") || msg.includes("App-Passwörter"))
        friendly = msg; // already friendly from Python
      else if (msg.includes("AUTHENTICATIONFAILED") || msg.includes("Invalid credentials"))
        friendly = "Falsches Passwort. Bei Gmail bitte ein App-Passwort verwenden (Google-Konto → Sicherheit → App-Passwörter).";
      else if (msg.includes("bad_password") || msg.includes("wrong password"))
        friendly = "Falsches Passwort oder Benutzername.";
      else if (msg.includes("two_factor") || msg.includes("2FA"))
        friendly = "Zwei-Faktor aktiv — bitte App-Passwort verwenden.";
      else if (msg.includes("rate") || msg.includes("429"))
        friendly = "Zu viele Versuche. Bitte 10 Minuten warten.";
      else if (msg.includes("Connection refused") || msg.includes("Network"))
        friendly = "Verbindung fehlgeschlagen. Bitte Serveradresse und Internetverbindung prüfen.";
      toast.error(friendly, { duration: 6000 });
      setConnecting(null);
    }
  };

  const handleTelegramConnect = async () => {
    const creds = {
      phone: formData["telegram_phone"]?.trim() || "",
    };
    if (!creds.phone) {
      toast.error("Bitte Telefonnummer eingeben");
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
        setTgCodeType(res.code_type || "");
        setTgStep("code_sent");
        const isSms = (res.code_type || "").includes("Sms");
        toast(isSms ? "📱 Code wurde per SMS gesendet." : "📱 Code wurde in der Telegram-App gesendet — schauen Sie auf Ihrem Telefon nach.", { duration: 8000 });
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
        setTg2fa("");
      } else if (res.error === "2fa_required") {
        setTgStep("2fa");
        toast("🔐 Zwei-Faktor-Passwort erforderlich.", { duration: 5000 });
      } else {
        toast.error(String(res.error || "Falscher Code").slice(0, 150));
      }
    } catch (e: any) {
      toast.error(String(e).slice(0, 150));
    } finally {
      setTgVerifying(false);
    }
  };

  const handleTelegram2FA = async () => {
    const creds = {
      phone: formData["telegram_phone"]?.trim() || "",
    };
    if (!tg2fa.trim()) { toast.error("Bitte das 2FA-Passwort eingeben"); return; }
    try {
      setTgVerifying(true);
      const res = await invoke<any>("send_to_sidecar", {
        command: {
          action: "verify_2fa",
          platform: "telegram",
          params: { credentials: creds, password: tg2fa.trim() },
        },
      });
      if (res.success) {
        await addAccount("telegram", creds);
        toast.success("✓ Telegram erfolgreich verbunden!");
        setExpanded(null);
        setTgStep("idle");
        setTgCode("");
        setTg2fa("");
      } else {
        toast.error(String(res.error || "Falsches Passwort").slice(0, 150));
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
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold" style={{ color: "var(--text)" }}>Konten verwalten</h1>
          <span className="text-xs px-2.5 py-1 rounded-full font-semibold uppercase tracking-wide"
            style={{
              background: plan === "agency" ? "var(--mauve)22" : plan === "pro" ? "var(--blue)22" : "var(--surface1)",
              color: plan === "agency" ? "var(--mauve)" : plan === "pro" ? "var(--blue)" : "var(--overlay1)",
              border: `1px solid ${plan === "agency" ? "var(--mauve)44" : plan === "pro" ? "var(--blue)44" : "var(--surface2)"}`,
            }}>
            {plan} · {maxPerPlatform}/Plattform
          </span>
        </div>
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
                  <div key={account.id} style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  <div
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
                    {account.platform === "linkedin" && (
                      <button
                        onClick={() => setUpdatingCookies(updatingCookies === account.id ? null : account.id)}
                        title="Cookie aktualisieren"
                        style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#0A66C2", background: "#0A66C222", border: "none", cursor: "pointer", padding: "3px 7px", borderRadius: 5, fontWeight: 600 }}
                      >
                        <RefreshCw size={11} /> Cookie
                      </button>
                    )}
                    <button
                      onClick={() => { if (confirm(`"${account.display_name}" entfernen?`)) removeAccount(account.id).then(() => toast("Entfernt")); }}
                      className="p-1 rounded opacity-40 hover:opacity-100 transition-all"
                      style={{ color: "var(--red)" }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  {account.platform === "linkedin" && updatingCookies === account.id && (
                    <div style={{ padding: "0 10px 10px 10px", background: "var(--surface0)", borderRadius: "0 0 8px 8px" }}>
                      <LinkedInCookieUpdate
                        accountId={account.id}
                        color="#0A66C2"
                        onDone={() => { setUpdatingCookies(null); fetchAccounts(); }}
                      />
                    </div>
                  )}
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
          const platformCount = accounts.filter((a) => a.platform === platform.id).length;
          const atLimit = platformCount >= maxPerPlatform;

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
                    {maxPerPlatform > 1 && (
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{
                          background: atLimit ? "var(--red)22" : "var(--surface1)",
                          color: atLimit ? "var(--red)" : "var(--overlay0)",
                        }}>
                        {platformCount}/{maxPerPlatform}
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
              {isExpanded && platform.id === "linkedin" && (
                <LinkedInConnect
                  isConnecting={isConnecting}
                  color={platform.color}
                  gradient={platform.gradient}
                  onConnect={async (creds) => {
                    try {
                      setConnecting("linkedin");
                      await addAccount("linkedin", creds);
                      toast.success("✓ LinkedIn erfolgreich verbunden!");
                      setExpanded(null);
                    } catch (e: any) {
                      toast.error(String(e).slice(0, 200), { duration: 7000 });
                    } finally {
                      setConnecting(null);
                    }
                  }}
                />
              )}
              {isExpanded && platform.id !== "whatsapp" && platform.id !== "telegram" && platform.id !== "linkedin" && (
                <div className="px-4 pb-4 space-y-3" style={{ background: "var(--mantle)" }}>
                  {/* Divider */}
                  <div style={{ height: 1, background: "var(--surface0)" }} />

                  {platform.note && (
                    <p className="text-xs py-2 px-3 rounded-lg"
                      style={{
                        background: (platform as any).useMetaOAuth || (platform as any).useTwitterOAuth ? "var(--green)12" : "var(--yellow)15",
                        color: (platform as any).useMetaOAuth || (platform as any).useTwitterOAuth ? "var(--green)" : "var(--yellow)",
                        borderLeft: `3px solid ${(platform as any).useMetaOAuth || (platform as any).useTwitterOAuth ? "var(--green)" : "var(--yellow)"}`,
                      }}>
                      {platform.note}
                    </p>
                  )}

                  {/* Help links */}
                  {platform.helpLinks.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      {platform.helpLinks.map((link) => (
                        <button
                          key={link.url}
                          onClick={() => openExternal(link.url)}
                          className="flex items-center gap-2 text-xs hover:underline"
                          style={{ color: "var(--blue)", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}
                        >
                          <ExternalLink size={11} />
                          {link.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Fields grid (hidden for OAuth-only platforms) */}
                  {platform.fields.length > 0 && (
                    <div className={`grid gap-3 ${platform.fields.length > 2 ? "grid-cols-2" : "grid-cols-1"}`}>
                      {platform.fields.map((field) => (
                        <div key={field.key}>
                          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--subtext0)" }}>
                            {field.label}
                          </label>
                          <input
                            type={field.type}
                            placeholder={field.placeholder}
                            defaultValue=""
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
                  )}

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
                    ) : (platform as any).useTwitterOAuth ? (
                      <><Twitter size={15} /> Mit Twitter / X verbinden →</>
                    ) : (platform as any).useGoogleOAuth ? (
                      <><Mail size={15} /> Mit Google anmelden →</>
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
                    style={{ background: "var(--green)12", color: "var(--green)", borderLeft: "3px solid var(--green)" }}>
                    Nur Telefonnummer nötig — Code kommt per Telegram
                  </p>

                  {tgStep === "idle" && (
                    <>
                      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr" }}>
                        {[
                          { key: "phone", label: "Telefonnummer", type: "text", placeholder: "+49 160 000 0000" },
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
                      <p className="text-xs" style={{ color: "var(--overlay1)" }}>
                        {tgCodeType.includes("Sms")
                          ? "📩 Code wurde per SMS gesendet"
                          : "📱 Öffnen Sie Telegram auf Ihrem Telefon → Chat von \"Telegram\" → 5-stelliger Zahlencode"}
                      </p>
                      <div>
                        <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--subtext0)" }}>
                          5-stelliger Code aus Telegram
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

                  {tgStep === "2fa" && (
                    <>
                      <div style={{ padding: "10px 14px", borderRadius: 10, background: "var(--blue)15", border: "1px solid var(--blue)40", display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 18 }}>🔐</span>
                        <p style={{ color: "var(--blue)", fontSize: 13, fontWeight: 600 }}>
                          Zwei-Faktor-Authentifizierung aktiv
                        </p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--subtext0)" }}>
                          Telegram Cloud-Passwort (2FA)
                        </label>
                        <input
                          type="password"
                          placeholder="Ihr Telegram-Passwort"
                          value={tg2fa}
                          onChange={(e) => setTg2fa(e.target.value)}
                          autoFocus
                          style={{ background: "var(--surface0)", border: "2px solid #2AABEE", borderRadius: 8, padding: "10px 12px", color: "var(--text)", width: "100%", fontSize: 14, outline: "none" }}
                        />
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={() => { setTgStep("idle"); setTg2fa(""); }}
                          style={{ flex: 1, padding: "8px", borderRadius: 8, background: "var(--surface0)", color: "var(--text)", border: "none", cursor: "pointer", fontSize: 13 }}
                        >
                          Zurück
                        </button>
                        <button
                          onClick={handleTelegram2FA}
                          disabled={tgVerifying || !tg2fa.trim()}
                          className="flex items-center justify-center gap-2 disabled:opacity-50"
                          style={{ flex: 2, padding: "8px", borderRadius: 8, background: "linear-gradient(135deg, #2AABEE, #1a7bbf)", color: "white", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
                        >
                          {tgVerifying ? <><Loader size={13} className="animate-spin" /> Prüfe…</> : <><CheckCircle size={13} /> Anmelden</>}
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
