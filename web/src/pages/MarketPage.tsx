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
    <div className="p-6">
      <div className="max-w-5xl mx-auto">
          <h1 className="text-xl font-medium mb-4">工具市场</h1>

          {categories.length > 0 && (
            <div className="flex gap-2 mb-4">
              <button onClick={() => setFilter("")} className={`px-3 py-1 rounded text-xs ${!filter ? "bg-blue-600 text-white" : "bg-neutral-100"}`}>全部</button>
              {categories.map(c => (
                <button key={c} onClick={() => setFilter(c)} className={`px-3 py-1 rounded text-xs ${filter === c ? "bg-blue-600 text-white" : "bg-neutral-100"}`}>{c}</button>
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
                className="block p-4 bg-white border rounded hover:shadow transition-shadow"
              >
                <div className="font-medium text-sm mb-1">{l.title}</div>
                <div className="text-xs text-neutral-400 mb-2 line-clamp-2">{l.description}</div>
                <div className="flex items-center justify-between text-xs text-neutral-300">
                  <span>{l.category}</span>
                  <span>{l.type === "url" ? "外部链接" : "Smart 工具"}</span>
                </div>
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
