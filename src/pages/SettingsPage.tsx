import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Save, Eye, EyeOff, Code2, RefreshCw, Download, CheckCircle } from "lucide-react";
import toast from "react-hot-toast";

interface Settings {
  ai_provider: "anthropic" | "openai" | "gemini" | "our";
  ai_use_own: boolean;
  ai_own_key: string;
  human_delay_min: string;
  human_delay_max: string;
  auto_reply_enabled: boolean;
  notifications_enabled: boolean;
  start_minimized: boolean;
}

interface UpdateInfo {
  available: boolean;
  current_version: string;
  latest_version: string | null;
  notes: string | null;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    ai_provider: "anthropic",
    ai_use_own: false,
    ai_own_key: "",
    human_delay_min: "2.5",
    human_delay_max: "8.0",
    auto_reply_enabled: false,
    notifications_enabled: true,
    start_minimized: false,
  });
  const [showKey, setShowKey] = useState(false);
  const [metaSecret, setMetaSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [savingSecret, setSavingSecret] = useState(false);
  const [saving, setSaving] = useState(false);

  // Updater state
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [installingUpdate, setInstallingUpdate] = useState(false);

  useEffect(() => {
    invoke<Settings>("get_settings").then(setSettings).catch(console.error);
    // Auto-check for updates on page open (silent)
    checkUpdates(true);
  }, []);

  const checkUpdates = async (silent = false) => {
    setCheckingUpdate(true);
    try {
      const info = await invoke<UpdateInfo>("check_for_updates");
      setUpdateInfo(info);
      if (!silent && !info.available) {
        toast.success(`✓ Aktuelle Version ${info.current_version} — kein Update verfügbar`);
      }
    } catch (e: any) {
      if (!silent) toast.error(`Update-Prüfung fehlgeschlagen: ${e}`);
    } finally {
      setCheckingUpdate(false);
    }
  };

  const installUpdate = async () => {
    setInstallingUpdate(true);
    toast("⬇️ Update wird heruntergeladen und installiert…", { duration: 10000 });
    try {
      await invoke("install_update");
      // App restarts automatically after this
    } catch (e: any) {
      toast.error(`Installation fehlgeschlagen: ${e}`);
      setInstallingUpdate(false);
    }
  };

  const saveMetaSecret = async () => {
    if (!metaSecret.trim()) return;
    setSavingSecret(true);
    try {
      await invoke("save_setting", { key: "meta_app_secret", value: metaSecret.trim() });
      toast.success("Meta App Secret gespeichert");
      setMetaSecret("");
    } catch (e: any) {
      toast.error(`Fehler: ${e}`);
    } finally {
      setSavingSecret(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await invoke("update_settings", { settings });
      toast.success("Einstellungen gespeichert");
    } catch (e: any) {
      toast.error(`Fehler: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const set = (key: keyof Settings, value: any) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div
        className="px-6 py-4 border-b shrink-0"
        style={{ borderColor: "var(--surface0)" }}
      >
        <h1 className="text-lg font-semibold" style={{ color: "var(--text)" }}>
          Einstellungen
        </h1>
      </div>

      <div className="p-6 space-y-6 max-w-2xl">

        {/* Updates */}
        <section>
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: "var(--subtext0)" }}>
            <RefreshCw size={14} />
            UPDATES
          </h2>
          <div
            className="rounded-xl p-5 space-y-3"
            style={{ background: "var(--mantle)", border: "1px solid var(--surface0)" }}
          >
            {updateInfo && (
              <div
                className="flex items-start gap-3 p-3 rounded-lg"
                style={{
                  background: updateInfo.available ? "var(--green)15" : "var(--surface0)",
                  border: `1px solid ${updateInfo.available ? "var(--green)40" : "var(--surface1)"}`,
                }}
              >
                {updateInfo.available ? (
                  <Download size={16} style={{ color: "var(--green)", marginTop: 1, flexShrink: 0 }} />
                ) : (
                  <CheckCircle size={16} style={{ color: "var(--green)", marginTop: 1, flexShrink: 0 }} />
                )}
                <div className="flex-1 min-w-0">
                  {updateInfo.available ? (
                    <>
                      <p className="text-sm font-semibold" style={{ color: "var(--green)" }}>
                        Neue Version verfügbar: {updateInfo.latest_version}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--overlay1)" }}>
                        Aktuelle Version: {updateInfo.current_version}
                      </p>
                      {updateInfo.notes && (
                        <p className="text-xs mt-1.5 leading-relaxed" style={{ color: "var(--overlay0)" }}>
                          {updateInfo.notes.slice(0, 200)}{updateInfo.notes.length > 200 ? "…" : ""}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm" style={{ color: "var(--text)" }}>
                      ✓ Aktuelle Version: <strong>{updateInfo.current_version}</strong> — Sie haben die neueste Version
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => checkUpdates(false)}
                disabled={checkingUpdate}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                style={{ background: "var(--surface1)", color: "var(--text)" }}
              >
                <RefreshCw size={14} className={checkingUpdate ? "animate-spin" : ""} />
                {checkingUpdate ? "Prüfe…" : "Auf Updates prüfen"}
              </button>

              {updateInfo?.available && (
                <button
                  onClick={installUpdate}
                  disabled={installingUpdate}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                  style={{ background: "var(--green)", color: "var(--crust)" }}
                >
                  <Download size={14} />
                  {installingUpdate ? "Installiert…" : `Update auf ${updateInfo.latest_version} installieren`}
                </button>
              )}
            </div>
          </div>
        </section>

        {/* AI Settings */}
        <section>
          <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--subtext0)" }}>
            KI-EINSTELLUNGEN
          </h2>
          <div
            className="rounded-xl p-5 space-y-4"
            style={{ background: "var(--mantle)", border: "1px solid var(--surface0)" }}
          >
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: "var(--text)" }}>
                KI-Anbieter
              </label>
              <select
                value={settings.ai_provider}
                onChange={(e) => set("ai_provider", e.target.value)}
              >
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="openai">OpenAI (GPT-4)</option>
                <option value="gemini">Google Gemini</option>
                <option value="our">CrossPost KI (günstiger, unser Service)</option>
              </select>
            </div>

            {settings.ai_provider !== "our" && (
              <>
                <div className="flex items-center gap-3">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.ai_use_own}
                      onChange={(e) => set("ai_use_own", e.target.checked)}
                      className="sr-only peer"
                    />
                    <div
                      className="w-10 h-5 rounded-full peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:rounded-full after:w-4 after:h-4 after:transition-all"
                      style={{
                        background: settings.ai_use_own ? "var(--blue)" : "var(--surface1)",
                      }}
                    />
                  </label>
                  <span className="text-sm" style={{ color: "var(--text)" }}>
                    Eigenen API-Schlüssel verwenden (günstiger)
                  </span>
                </div>

                {settings.ai_use_own && (
                  <div>
                    <label className="block text-sm mb-1" style={{ color: "var(--subtext0)" }}>
                      API-Schlüssel
                    </label>
                    <div className="relative">
                      <input
                        type={showKey ? "text" : "password"}
                        placeholder="sk-..."
                        value={settings.ai_own_key}
                        onChange={(e) => set("ai_own_key", e.target.value)}
                        style={{ paddingRight: 40 }}
                      />
                      <button
                        onClick={() => setShowKey(!showKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2"
                        style={{ color: "var(--overlay0)" }}
                      >
                        {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        {/* Human-like behavior */}
        <section>
          <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--subtext0)" }}>
            MENSCHLICHES VERHALTEN (Anti-Spam-Schutz)
          </h2>
          <div
            className="rounded-xl p-5 space-y-4"
            style={{ background: "var(--mantle)", border: "1px solid var(--surface0)" }}
          >
            <p className="text-xs" style={{ color: "var(--overlay0)" }}>
              Zufällige Verzögerungen zwischen Aktionen simulieren menschliches Verhalten
              und schützen vor Plattform-Sperren.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm mb-1" style={{ color: "var(--subtext0)" }}>
                  Min. Verzögerung (Sekunden)
                </label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  step="0.5"
                  value={settings.human_delay_min}
                  onChange={(e) => set("human_delay_min", e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm mb-1" style={{ color: "var(--subtext0)" }}>
                  Max. Verzögerung (Sekunden)
                </label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  step="0.5"
                  value={settings.human_delay_max}
                  onChange={(e) => set("human_delay_max", e.target.value)}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Auto-reply */}
        <section>
          <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--subtext0)" }}>
            AUTOMATISCHE ANTWORTEN
          </h2>
          <div
            className="rounded-xl p-5 space-y-3"
            style={{ background: "var(--mantle)", border: "1px solid var(--surface0)" }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                  KI-Automatik-Antworten aktivieren
                </p>
                <p className="text-xs mt-0.5" style={{ color: "var(--overlay0)" }}>
                  Nur auf eingehende Nachrichten — kein Spam
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.auto_reply_enabled}
                onChange={(e) => set("auto_reply_enabled", e.target.checked)}
              />
            </div>
          </div>
        </section>

        {/* App settings */}
        <section>
          <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--subtext0)" }}>
            APP-EINSTELLUNGEN
          </h2>
          <div
            className="rounded-xl p-5 space-y-3"
            style={{ background: "var(--mantle)", border: "1px solid var(--surface0)" }}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm" style={{ color: "var(--text)" }}>Benachrichtigungen</p>
              <input
                type="checkbox"
                checked={settings.notifications_enabled}
                onChange={(e) => set("notifications_enabled", e.target.checked)}
              />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm" style={{ color: "var(--text)" }}>Minimiert starten</p>
              <input
                type="checkbox"
                checked={settings.start_minimized}
                onChange={(e) => set("start_minimized", e.target.checked)}
              />
            </div>
          </div>
        </section>

        {/* Meta Developer Settings */}
        <section>
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: "var(--subtext0)" }}>
            <Code2 size={14} />
            ENTWICKLER — META API
          </h2>
          <div
            className="rounded-xl p-5 space-y-4"
            style={{ background: "var(--mantle)", border: "1px solid var(--surface0)" }}
          >
            <p className="text-xs" style={{ color: "var(--overlay0)" }}>
              App ID: <code style={{ color: "var(--yellow)" }}>1696429314893660</code>
              {" "}— einmalig das App Secret eintragen (aus Meta Developer Portal → Einstellungen → Grundlegendes).
            </p>
            <div>
              <label className="block text-sm mb-1" style={{ color: "var(--subtext0)" }}>
                Meta App Secret
              </label>
              <div className="relative">
                <input
                  type={showSecret ? "text" : "password"}
                  placeholder="Aus Meta Developer Portal kopieren..."
                  value={metaSecret}
                  onChange={(e) => setMetaSecret(e.target.value)}
                  style={{ paddingRight: 40 }}
                />
                <button
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: "var(--overlay0)" }}
                >
                  {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <button
              onClick={saveMetaSecret}
              disabled={savingSecret || !metaSecret.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
              style={{ background: "var(--blue)", color: "var(--crust)" }}
            >
              <Save size={14} />
              {savingSecret ? "Speichert..." : "App Secret speichern"}
            </button>
          </div>
        </section>

        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium"
          style={{ background: "var(--blue)", color: "var(--crust)" }}
        >
          <Save size={15} />
          {saving ? "Wird gespeichert..." : "Einstellungen speichern"}
        </button>
      </div>
    </div>
  );
}
