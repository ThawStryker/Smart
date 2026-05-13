import { useNavigate, useLocation } from "react-router-dom";
import { client } from "@/lib/edgespark";
import type { AuthUser } from "@edgespark/web";

// SVG Icons
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
  { label: "任务", path: "/dashboard" },
  { label: "Skills", path: "/skills" },
  { label: "MCPs", path: "/mcps" },
  { label: "工具市场", path: "/market" },
];

export function TopNav({ user, isAdmin }: TopNavProps) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <header className="bg-white/80 backdrop-blur-sm border-b border-neutral-200 px-6 py-3 flex items-center justify-between shadow-sm">
      <div className="flex items-center gap-8">
        <div
          className="flex items-center gap-2 cursor-pointer"
          onClick={() => navigate("/")}
        >
          <div className="w-8 h-8 rounded bg-gradient-to-r from-blue-600 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-200">
            <BoltIcon />
          </div>
          <span className="font-bold text-lg bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">Smart</span>
        </div>
        <nav className="flex items-center gap-6 text-sm">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <a
                key={item.label}
                onClick={() => navigate(item.path)}
                className={`transition-colors cursor-pointer relative pb-3 ${
                  isActive 
                    ? "text-blue-600 font-medium" 
                    : "text-neutral-500 hover:text-blue-600"
                }`}
              >
                {item.label}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full"></span>
                )}
              </a>
            );
          })}
        </nav>
      </div>
      <div className="flex items-center gap-4">
        {isAdmin && (
          <button
            onClick={() => navigate("/admin")}
            className="text-sm bg-gradient-to-r from-amber-50 to-orange-50 text-amber-600 px-3 py-1.5 rounded-lg hover:shadow-sm hover:shadow-amber-100 transition-all"
          >
            管理
          </button>
        )}
        {user?.name && (
          <span className="text-sm text-neutral-600 font-medium px-3 py-1.5 bg-neutral-50 rounded-lg">
            {user.name}
          </span>
        )}
        <button
          onClick={() => client.auth.signOut()}
          className="text-sm text-neutral-500 hover:text-red-500 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-50"
        >
          退出
        </button>
      </div>
    </header>
  );
}
