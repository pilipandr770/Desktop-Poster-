import { NavLink, Outlet } from "react-router-dom";
import {
  Send, Inbox, Users, Settings, Key,
  Instagram, Facebook, MessageCircle, Linkedin,
  Twitter, Mail, Bot, Circle, Zap
} from "lucide-react";
import { useAccountsStore } from "../store/accounts";

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
  const connected = accounts.filter((a) => a.status === "connected");

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
              Desktop v0.1
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

        {/* License */}
        <div style={{ padding: "8px 10px", borderTop: "1.5px solid var(--surface0)" }}>
          <NavLink
            to="/license"
            className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
            style={{ fontSize: 12, color: "var(--overlay0)" }}
          >
            <Key size={14} />
            Lizenz
          </NavLink>
        </div>
      </aside>

      {/* ── Main ── */}
      <main style={{ flex: 1, overflow: "hidden", background: "var(--base)", height: "100%", display: "flex", flexDirection: "column" }}>
        <Outlet />
      </main>
    </div>
  );
}
