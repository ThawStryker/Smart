import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { client } from "@/lib/edgespark";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";

interface Listing {
  id: number;
  title: string;
  description: string;
  category: string;
  type: string;
  url: string;
  link: string;
  _projectId?: number;
  _hasIcon?: boolean;
}

const gradients = [
  "from-amber-400 to-orange-500",
  "from-indigo-400 to-violet-500",
  "from-emerald-400 to-teal-500",
  "from-rose-400 to-pink-500",
  "from-sky-400 to-blue-500",
  "from-fuchsia-400 to-purple-500",
];

function getGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return gradients[Math.abs(hash) % gradients.length];
}

function getInitials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

export function LandingPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { isAdmin } = useProfile();
  const [listings, setListings] = useState<Listing[]>([]);
  const [marketLoading, setMarketLoading] = useState(true);

  useEffect(() => {
    client.api
      .fetch("/api/public/market?featured=true")
      .then((r) => r.json())
      .then((data) => setListings(data as Listing[]))
      .catch(() => {})
      .finally(() => setMarketLoading(false));
  }, []);

  if (marketLoading) return (
    <div className="h-screen flex items-center justify-center bg-[#fafafa]">
      <LoadingSpinner />
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-[#fafafa] animate-pageIn">
      {/* Nav */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-neutral-200 shrink-0 bg-white/80 backdrop-blur-sm shadow-sm">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 flex items-center justify-center shadow-md shadow-indigo-200">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          </div>
          <span className="font-bold text-lg bg-gradient-to-r from-indigo-500 to-violet-600 bg-clip-text text-transparent">Smart</span>
        </div>
        <div className="flex items-center gap-4">
          {!authLoading && (
            user ? (
              <>
                {isAdmin && (
                  <button onClick={() => navigate("/admin")} className="text-sm bg-amber-50 text-amber-600 px-3 py-1.5 rounded-lg hover:shadow-sm hover:shadow-amber-100 transition-all">
                    管理
                  </button>
                )}
                <span className="text-sm text-neutral-600 font-medium px-3 py-1.5 bg-neutral-50 rounded-lg">
                  {user.name}
                </span>
                <button onClick={() => client.auth.signOut()} className="text-sm text-neutral-600 hover:text-red-500 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-50">
                  退出
                </button>
              </>
            ) : (
              <button onClick={() => navigate("/login")} className="text-sm text-neutral-600 hover:text-amber-600 transition-colors">
                登录
              </button>
            )
          )}
        </div>
      </header>

      <div className="flex-1 flex flex-col justify-center px-6">
        {/* Hero */}
        <div className="text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-neutral-900 mb-4 tracking-tight">
            把你的想法
            <span className="bg-gradient-to-r from-indigo-500 to-violet-600 bg-clip-text text-transparent">变成可以部署的工具</span>
          </h1>
          <p className="text-lg text-neutral-500 max-w-xl mx-auto mb-6">
            用自然语言描述需求，AI 自动生成并一键部署到全球 CDN
          </p>
          <div className="flex items-center justify-center gap-3 mb-12">
            {user ? (
              <button
                onClick={() => navigate("/dashboard")}
                className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-8 py-3 rounded-lg text-base font-medium shadow-sm hover:shadow-md hover:shadow-amber-100 transition-all"
              >
                开始创建
              </button>
            ) : (
              <button
                onClick={() => navigate("/login")}
                className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-8 py-3 rounded-lg text-base font-medium shadow-sm hover:shadow-md hover:shadow-amber-100 transition-all"
              >
                免费开始
              </button>
            )}
            <button
              onClick={() => navigate("/market")}
              className="bg-neutral-100 text-neutral-600 px-8 py-3 rounded-lg text-base font-medium hover:bg-neutral-200 transition-colors"
            >
              浏览市场
            </button>
          </div>
        </div>

        {/* Tool showcase row */}
        {listings.length > 0 && (
          <div className="max-w-4xl mx-auto w-full">
            <p className="text-center text-xs text-tertiary mb-4">热门工具</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {listings.map((l) => (
                <a
                  key={l.id}
                  href={l.link || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="smart-card p-4 group"
                >
                  <div className="flex items-center gap-3 mb-3">
                    {l._hasIcon && l._projectId ? (
                      <img src={`/api/public/smart/icon/${l._projectId}`} alt="" className="w-9 h-9 rounded-lg object-cover shadow-sm shrink-0 group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${getGradient(l.title)} flex items-center justify-center text-white text-xs font-bold shadow-sm shrink-0 group-hover:scale-105 transition-transform duration-300`}>
                        {getInitials(l.title)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-primary truncate">{l.title}</div>
                      {l.category && (
                        <span className="text-[10px] text-tertiary">{l.category}</span>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-secondary line-clamp-2">{l.description}</p>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="px-6 py-3 text-center text-xs text-neutral-300 shrink-0">
        Smart — AI 驱动的工具生成与部署平台
      </footer>
    </div>
  );
}
