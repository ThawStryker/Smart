import { client } from "@/lib/edgespark";
import type { AuthUser } from "@edgespark/web";

interface TopNavProps {
  user?: AuthUser | null;
}

const navItems = [
  { label: "任务", active: true },
  { label: "Agents", active: false },
  { label: "Bots", active: false },
  { label: "Skills", active: false },
  { label: "MCPs", active: false },
  { label: "工具市场", active: false },
  { label: "AI工具", active: false },
];

export function TopNav({ user }: TopNavProps) {
  return (
    <header className="bg-white border-b border-neutral-200 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-8">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center">
            <span className="text-white text-lg font-bold">S</span>
          </div>
          <span className="font-bold text-lg">Smart</span>
        </div>
        <nav className="flex items-center gap-6 text-sm">
          {navItems.map((item) => (
            <a
              key={item.label}
              href="#"
              className={
                item.active
                  ? "text-neutral-800 font-medium"
                  : "text-neutral-500 hover:text-blue-600 transition-colors"
              }
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-4">
        <button className="text-sm bg-blue-50 text-blue-600 px-3 py-1 rounded hover:bg-blue-100 transition-colors">
          发布工具
        </button>
        {user?.name && (
          <span className="text-sm text-neutral-500">{user.name}</span>
        )}
        <button
          onClick={() => client.auth.signOut()}
          className="text-sm text-neutral-500 hover:text-red-500 transition-colors"
        >
          退出
        </button>
      </div>
    </header>
  );
}
