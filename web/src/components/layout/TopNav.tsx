import { useNavigate, useLocation } from "react-router-dom";
import { client } from "@/lib/edgespark";
import type { AuthUser } from "@edgespark/web";

const BoltIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
  </svg>
);

interface TopNavProps {
  user?: AuthUser | null;
  isAdmin?: boolean;
}

const navItems = [
  { label: "Coding", path: "/dashboard" },
  { label: "Skill", path: "/skills" },
  { label: "MCP", path: "/mcps" },
  { label: "Work", path: "/work" },
];

export function TopNav({ user, isAdmin }: TopNavProps) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-neutral-100 px-6 h-14 flex items-center justify-between">
      <div className="flex items-center gap-10">
        <div className="flex items-center gap-2.5 cursor-pointer select-none" onClick={() => navigate("/")}>
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm shadow-indigo-200">
            <BoltIcon />
          </div>
          <span className="font-bold text-base tracking-tight text-neutral-900">Smart</span>
        </div>
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
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => navigate("/market")} className="text-[13px] text-neutral-400 hover:text-neutral-600 transition-colors px-3 py-1.5 rounded-md hover:bg-neutral-50">
          工具市场
        </button>
        {isAdmin && (
          <button onClick={() => navigate("/admin")} className="text-[13px] text-amber-600 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-md transition-colors font-medium">
            管理
          </button>
        )}
        {user?.name && (
          <span className="text-[13px] text-neutral-400 ml-1">{user.name}</span>
        )}
        <button onClick={() => client.auth.signOut()} className="text-[13px] text-neutral-400 hover:text-red-500 transition-colors px-2 py-1.5 rounded-md hover:bg-red-50 ml-1">
          退出
        </button>
      </div>
    </header>
  );
}
