import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Key, CheckCircle, XCircle, Loader } from "lucide-react";
import toast from "react-hot-toast";

interface LicenseInfo {
  token: string | null;
  plan: string | null;
  valid_until: string | null;
  is_valid: boolean;
}

const PLANS = [
  {
    id: "solo",
    name: "Solo",
    price: "€29/Monat",
    features: ["1 Konto pro Plattform", "KI-Crossposting", "Posteingang", "7 Plattformen"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "€79/Monat",
    features: ["3 Konten pro Plattform", "KI-Inhaltserstellung", "Geplante Posts", "Prioritäts-Support"],
    popular: true,
  },
  {
    id: "agency",
    name: "Agentur",
    price: "€199/Monat",
    features: ["10 Konten pro Plattform", "White-Label", "API-Zugang", "Dedicated Support"],
  },
];

export default function LicensePage() {
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [inputToken, setInputToken] = useState("");
  const [activating, setActivating] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    invoke<LicenseInfo>("check_license")
      .then(setLicense)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const activate = async () => {
    if (!inputToken.trim()) return;
    setActivating(true);
    try {
      const result = await invoke<LicenseInfo>("activate_license", { token: inputToken });
      setLicense(result);
      toast.success("Lizenz erfolgreich aktiviert!");
      setInputToken("");
    } catch (e: any) {
      toast.error(`Ungültige Lizenz: ${e}`);
    } finally {
      setActivating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader className="animate-spin" style={{ color: "var(--blue)" }} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="px-6 py-4 border-b" style={{ borderColor: "var(--surface0)" }}>
        <h1 className="text-lg font-semibold" style={{ color: "var(--text)" }}>Lizenz</h1>
      </div>

      <div className="p-6 space-y-6 max-w-2xl">
        {/* Current status */}
        <div
          className="rounded-xl p-5"
          style={{ background: "var(--mantle)", border: "1px solid var(--surface0)" }}
        >
          <div className="flex items-center gap-3 mb-4">
            {license?.is_valid ? (
              <CheckCircle size={20} style={{ color: "var(--green)" }} />
            ) : (
              <XCircle size={20} style={{ color: "var(--red)" }} />
            )}
            <div>
              <p className="font-medium" style={{ color: "var(--text)" }}>
                {license?.is_valid
                  ? `Aktiv — ${license.plan?.toUpperCase()} Plan`
                  : "Keine aktive Lizenz"}
              </p>
              {license?.valid_until && (
                <p className="text-xs" style={{ color: "var(--overlay0)" }}>
                  Gültig bis: {new Date(license.valid_until).toLocaleDateString("de-DE")}
                </p>
              )}
            </div>
          </div>

          {/* Activate */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Lizenzschlüssel eingeben..."
              value={inputToken}
              onChange={(e) => setInputToken(e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              onClick={activate}
              disabled={!inputToken.trim() || activating}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
              style={{ background: "var(--blue)", color: "var(--crust)", whiteSpace: "nowrap" }}
            >
              {activating ? <Loader size={14} className="animate-spin" /> : <Key size={14} />}
              Aktivieren
            </button>
          </div>
        </div>

        {/* Plans */}
        <div>
          <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--subtext0)" }}>
            PLÄNE
          </h2>
          <div className="grid grid-cols-3 gap-4">
            {PLANS.map((plan) => (
              <div
                key={plan.id}
                className="rounded-xl p-4 relative"
                style={{
                  background: "var(--mantle)",
                  border: `1px solid ${plan.popular ? "var(--blue)" : "var(--surface0)"}`,
                }}
              >
                {plan.popular && (
                  <div
                    className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-xs font-semibold"
                    style={{ background: "var(--blue)", color: "var(--crust)" }}
                  >
                    Beliebt
                  </div>
                )}
                <p className="font-semibold text-sm" style={{ color: "var(--text)" }}>
                  {plan.name}
                </p>
                <p className="text-lg font-bold mt-1" style={{ color: "var(--blue)" }}>
                  {plan.price}
                </p>
                <ul className="mt-3 space-y-1.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-1.5 text-xs" style={{ color: "var(--subtext0)" }}>
                      <span style={{ color: "var(--green)" }}>✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <a
                  href="https://andrii-it.de/crosspost"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block mt-4 text-center py-2 rounded-lg text-xs font-medium"
                  style={{
                    background: plan.popular ? "var(--blue)" : "var(--surface0)",
                    color: plan.popular ? "var(--crust)" : "var(--subtext1)",
                  }}
                >
                  Jetzt kaufen
                </a>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
