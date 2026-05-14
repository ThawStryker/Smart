import { useEffect, useState } from "react";
import { client } from "@/lib/edgespark";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";

interface Listing {
  id: number;
  title: string;
  description: string;
  category: string;
  type: string;
  url: string;
  toolId: number;
  link: string;
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

export function MarketPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    client.api.fetch("/api/public/market")
      .then(r => r.json())
      .then(setListings)
      .finally(() => setLoading(false));
  }, []);

  const categories = [...new Set(listings.map(l => l.category).filter(Boolean))] as string[];

  const filtered = filter ? listings.filter(l => l.category === filter) : listings;

  if (loading) return <LoadingSpinner />;

  return (
    <div className="p-6 animate-pageIn bg-[#fafafa]">
      <div className="max-w-5xl mx-auto">
          <h1 className="text-xl font-semibold text-neutral-900 mb-4">工具市场</h1>

          {categories.length > 0 && (
            <div className="flex gap-2 mb-4">
              <button onClick={() => setFilter("")} className={`px-3 py-1 rounded-lg text-xs ${!filter ? "bg-amber-500 text-white" : "bg-neutral-100 text-neutral-600"}`}>全部</button>
              {categories.map(c => (
                <button key={c} onClick={() => setFilter(c)} className={`px-3 py-1 rounded-lg text-xs ${filter === c ? "bg-amber-500 text-white" : "bg-neutral-100 text-neutral-600"}`}>{c}</button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(l => (
              <a
                key={l.id}
                href={l.link || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="smart-card p-4 group"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${getGradient(l.title)} flex items-center justify-center text-white text-xs font-bold shadow-sm shrink-0 group-hover:scale-105 transition-transform duration-300`}>
                    {getInitials(l.title)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-primary truncate">{l.title}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {l.category && <span className="text-[10px] text-tertiary">{l.category}</span>}
                      <span className="text-[10px] text-tertiary">{l.type === "url" ? "外部链接" : "Smart 工具"}</span>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-secondary line-clamp-2">{l.description}</p>
              </a>
            ))}
          </div>

          {filtered.length === 0 && (
            <p className="text-neutral-400 text-sm">暂无工具</p>
          )}
      </div>
    </div>
  );
}
