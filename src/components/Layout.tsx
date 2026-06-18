import { NavLink, Outlet } from "react-router-dom";
import {
  Send, Inbox, Users, Settings, Key,
  Instagram, Facebook, MessageCircle, Linkedin,
  Twitter, Mail, Bot, Circle
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
  const connectedAccounts = accounts.filter((a) => a.status === "connected");

  return (
    <div className="flex h-full" style={{ background: "var(--crust)" }}>
      {/* ── Sidebar ── */}
      <aside
        className="flex flex-col w-56 shrink-0 border-r"
        style={{
          background: "var(--mantle)",
          borderColor: "var(--surface0)",
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-3 px-4 py-5 border-b"
          style={{ borderColor: "var(--surface0)" }}
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold"
            style={{ background: "var(--blue)", color: "var(--crust)" }}
          >
            CP
          </div>
          <div>
            <div className="font-semibold text-sm" style={{ color: "var(--text)" }}>
              CrossPost
            </div>
            <div className="text-xs" style={{ color: "var(--overlay0)" }}>
              Desktop
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-1 p-3 flex-1">
          {navItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                  isActive
                    ? "font-medium"
                    : "hover:opacity-80"
                }`
              }
              style={({ isActive }) => ({
                background: isActive ? "var(--surface0)" : "transparent",
                color: isActive ? "var(--text)" : "var(--subtext0)",
              })}
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Connected accounts */}
        {connectedAccounts.length > 0 && (
          <div
            className="p-3 border-t"
            style={{ borderColor: "var(--surface0)" }}
          >
            <div
              className="text-xs font-medium mb-2 px-1"
              style={{ color: "var(--overlay0)" }}
            >
              VERBUNDENE KONTEN
            </div>
            <div className="flex flex-col gap-1">
              {connectedAccounts.map((account) => {
                const Icon = platformIcons[account.platform] || Circle;
                const color = platformColors[account.platform] || "var(--text)";
                return (
                  <div
                    key={account.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
                    style={{ background: "var(--surface0)" }}
                  >
                    <Icon size={14} style={{ color }} />
                    <span
                      className="text-xs truncate flex-1"
                      style={{ color: "var(--subtext1)" }}
                    >
                      {account.display_name}
                    </span>
                    <div
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: "var(--green)" }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* License */}
        <div
          className="p-3 border-t"
          style={{ borderColor: "var(--surface0)" }}
        >
          <NavLink
            to="/license"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all hover:opacity-80"
            style={{ color: "var(--overlay0)" }}
          >
            <Key size={14} />
            Lizenz
          </NavLink>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 overflow-hidden" style={{ background: "var(--base)" }}>
        <Outlet />
      </main>
    </div>
  );
}
