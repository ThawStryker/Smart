import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { client } from "@/lib/edgespark";
import { useAuth } from "@/hooks/useAuth";
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
  _projectId?: number;
  _hasIcon?: boolean;
  mine?: boolean;
  sellerId?: string;
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
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [marketTab, setMarketTab] = useState<"tools" | "talent">("tools");
  const [installingIds, setInstallingIds] = useState<Set<number>>(new Set());
  const [installedIds, setInstalledIds] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState("");

  useEffect(() => {
    setLoading(true);
    setListings([]);
    setFilter("");
    setToast("");
    const type = marketTab === "talent" ? "talent" : "tool";
    const listingsP = client.api.fetch(`/api/public/market?type=${type}`).then((r) => r.json());
    const installedP = marketTab === "talent" && isAuthenticated
      ? fetch("/api/agents").then((r) => r.ok ? r.json() : [])
      : Promise.resolve([]);
    Promise.all([listingsP, installedP])
      .then(([rows, agents]) => {
        setListings(Array.isArray(rows) ? rows : []);
        const ids = new Set<number>();
        for (const a of (Array.isArray(agents) ? agents : []) as Array<{ sourceListingId?: number | null }>) {
          if (a.sourceListingId) ids.add(a.sourceListingId);
        }
        setInstalledIds(ids);
      })
      .finally(() => setLoading(false));
  }, [marketTab, isAuthenticated]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  const categories = [...new Set(listings.map((l) => l.category).filter(Boolean))] as string[];
  const filtered = filter ? listings.filter((l) => l.category === filter) : listings;

  const installTalent = async (id: number) => {
    if (installingIds.has(id) || installedIds.has(id)) return;
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    setInstallingIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch("/api/market/talent/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingIds: [id] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast(data.error || "添加失败");
        return;
      }
      setInstalledIds((prev) => new Set(prev).add(id));
    } finally {
      setInstallingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  return (
    <div className="p-6 md:p-8 animate-pageIn bg-[#fafafa] min-h-full">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-neutral-900 tracking-tight">Market</h1>
          <div className="flex p-0.5 rounded-lg bg-neutral-100 shrink-0">
            {(["tools", "talent"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setMarketTab(t)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium text-center transition-colors ${
                  marketTab === t
                    ? "bg-white text-neutral-900 shadow-sm"
                    : "text-neutral-400 hover:text-neutral-600"
                }`}
              >
                {{ tools: "Tools", talent: "Workers" }[t]}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-7 mb-5">
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setFilter("")}
                className={`px-2.5 py-1 rounded-md text-[11px] ${!filter ? "bg-neutral-900 text-white" : "text-neutral-500 hover:bg-neutral-100"}`}
              >
                全部
              </button>
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setFilter(c)}
                  className={`px-2.5 py-1 rounded-md text-[11px] ${filter === c ? "bg-neutral-900 text-white" : "text-neutral-500 hover:bg-neutral-100"}`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map((l) => {
            const busy = installingIds.has(l.id);
            if (marketTab === "tools") {
              return (
                <a
                  key={l.id}
                  href={l.link || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="smart-card p-4 group"
                >
                  <ListingBody listing={l} />
                </a>
              );
            }
            const mine = Boolean(l.mine || (user?.id && l.sellerId === user.id));
            const added = mine || installedIds.has(l.id);
            return (
              <div key={l.id} className="smart-card p-4">
                <ListingBody listing={l} roundAvatar>
                  {mine ? (
                    <span className="text-[11px] shrink-0 text-neutral-300">我的</span>
                  ) : (
                    <button
                      type="button"
                      disabled={added || busy}
                      onClick={(e) => {
                        e.stopPropagation();
                        installTalent(l.id);
                      }}
                      className={`text-[11px] shrink-0 ${
                        added
                          ? "text-neutral-300 cursor-default"
                          : "text-neutral-500 hover:text-neutral-800"
                      } disabled:cursor-default`}
                    >
                      {busy ? "添加中…" : "Add"}
                    </button>
                  )}
                </ListingBody>
              </div>
            );
          })}
        </div>

            {filtered.length === 0 && (
              <p className="text-neutral-400 text-sm">{marketTab === "talent" ? "No workers yet" : "No tools yet"}</p>
            )}
          </>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl px-4 py-2 text-xs bg-neutral-900 text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function ListingBody({
  listing,
  roundAvatar,
  children,
}: {
  listing: Listing;
  roundAvatar?: boolean;
  children?: ReactNode;
}) {
  const shape = roundAvatar ? "rounded-full" : "rounded-lg";
  return (
    <>
      <div className="flex items-center gap-3 mb-3">
        {listing._hasIcon && listing._projectId ? (
          <img src={`/api/public/smart/icon/${listing._projectId}`} alt="" className={`w-10 h-10 ${shape} object-cover shrink-0`} />
        ) : (
          <div className={`w-10 h-10 ${shape} bg-gradient-to-br ${getGradient(listing.title)} flex items-center justify-center text-white text-xs font-semibold shrink-0`}>
            {getInitials(listing.title)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm text-primary truncate">{listing.title}</div>
          <div className="text-[11px] text-tertiary mt-0.5 truncate">
            {listing.category || (listing.type === "url" ? "外部链接" : listing.type === "talent" ? "Agent" : "工具")}
          </div>
        </div>
        {children}
      </div>
      {listing.description && (
        <p className="text-xs text-secondary line-clamp-2 leading-relaxed">{listing.description}</p>
      )}
    </>
  );
}
