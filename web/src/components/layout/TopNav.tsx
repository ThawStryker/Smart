import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { client } from "@/lib/edgespark";
import { useTheme } from "@/hooks/useTheme";
import type { AuthUser } from "@edgespark/web";
import { Logo } from "@/components/layout/Logo";

interface TopNavProps {
  user?: AuthUser | null;
  isAdmin?: boolean;
}

const navItems = [
  { label: "Work", path: "/work" },
  { label: "Coding", path: "/dashboard" },
];

export function TopNav({ user, isAdmin }: TopNavProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggle } = useTheme();

  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-neutral-100 px-6 h-14 flex items-center justify-between">
      <div className="flex items-center gap-10">
        <div onClick={() => navigate("/")}>
          <Logo />
        </div>
        {user && (
          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path || (item.path === "/dashboard" && location.pathname.startsWith("/project"));
              return (
                <button
                  key={item.label}
                  onClick={() => navigate(item.path)}
                  className={`relative px-3 py-1.5 text-[13px] rounded-md transition-all duration-200 ${
                    isActive
                      ? "text-neutral-900 font-medium bg-neutral-100"
                      : "text-neutral-400 hover:text-neutral-600 hover:bg-neutral-50"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
        )}
      </div>
      <div className="flex items-center gap-2">
        {!user ? (
          <button onClick={() => navigate("/login")} className="text-[13px] text-neutral-400 hover:text-neutral-600 transition-colors px-3 py-1.5 rounded-md hover:bg-neutral-50">
            登录
          </button>
        ) : (
          <>
            <button onClick={toggle}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-all duration-200 hover:scale-110"
              style={{ background: "var(--app-surface-alt)", color: "var(--app-text-secondary)" }}
              title={theme === "light" ? "Switch to dark" : "Switch to light"}>
              {theme === "light" ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
              )}
            </button>
            <button onClick={() => navigate("/market")} className="text-[13px] text-neutral-400 hover:text-neutral-600 transition-colors px-3 py-1.5 rounded-md hover:bg-neutral-50">
              Market
            </button>
            {isAdmin && (
              <button onClick={() => navigate("/admin")} className="text-[13px] text-amber-600 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-md transition-colors font-medium">
                管理
              </button>
            )}
            <UserMenu user={user} />
          </>
        )}
      </div>
    </header>
  );
}

function getInitials(name?: string | null, email?: string | null) {
  const src = (name || email || "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

function UserMenu({ user }: { user: AuthUser }) {
  const [open, setOpen] = useState(false);
  const name = user.name || "User";
  const email = "email" in user ? String((user as { email?: string }).email || "") : "";
  const image = "image" in user ? (user as { image?: string | null }).image : null;

  return (
    <div className="relative ml-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-8 h-8 rounded-full overflow-hidden shrink-0 ring-1 ring-neutral-200 hover:ring-neutral-300 transition-all"
        aria-label="账户菜单"
      >
        {image ? (
          <img src={image} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="w-full h-full flex items-center justify-center bg-gradient-to-br from-amber-400 to-orange-500 text-white text-[11px] font-semibold">
            {getInitials(user.name, email)}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 w-56 rounded-xl bg-white border border-neutral-200 shadow-lg overflow-hidden py-1">
            <div className="px-3 py-2.5 border-b border-neutral-100">
              <div className="text-sm font-medium text-neutral-900 truncate">{name}</div>
              {email && <div className="text-[11px] text-neutral-400 truncate mt-0.5">{email}</div>}
            </div>
            <button
              type="button"
              onClick={() => { setOpen(false); client.auth.signOut(); }}
              className="w-full text-left px-3 py-2 text-[13px] text-neutral-600 hover:bg-red-50 hover:text-red-500 transition-colors"
            >
              退出登录
            </button>
          </div>
        </>
      )}
    </div>
  );
}
