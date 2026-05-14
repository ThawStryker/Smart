import { useEffect, useState } from "react";
import { client } from "@/lib/edgespark";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";

interface Mcp {
  id: number;
  name: string;
  description: string;
  visibility: string;
  config: unknown;
  enabled: boolean;
}

export function McpsPage() {
  const [mcps, setMcps] = useState<Mcp[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [config, setConfig] = useState("");

  const fetchMcps = async () => {
    const res = await client.api.fetch("/api/mcps");
    setMcps(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetchMcps(); }, []);

  const handleAdd = async () => {
    await client.api.fetch("/api/mcps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description: desc,
        config: config ? JSON.parse(config) : undefined,
      }),
    });
    setShowForm(false);
    setName(""); setDesc(""); setConfig("");
    fetchMcps();
  };

  const toggleMcp = async (id: number, enabled: boolean) => {
    await client.api.fetch(`/api/mcps/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !enabled }),
    });
    fetchMcps();
  };

  const deleteMcp = async (id: number) => {
    if (!confirm("确定删除？")) return;
    await client.api.fetch(`/api/mcps/${id}`, { method: "DELETE" });
    fetchMcps();
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="p-6 animate-pageIn bg-[#fafafa]">
      <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-semibold text-neutral-900">MCPs</h1>
            <button onClick={() => setShowForm(!showForm)} className="bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg font-medium shadow-sm hover:shadow-md hover:shadow-amber-100 transition-all px-4 py-2 text-sm">
              添加 MCP
            </button>
          </div>

          {showForm && (
            <div className="bg-white border border-[#f0f0f0] rounded-xl p-4 mb-6">
              <input value={name} onChange={e => setName(e.target.value)} placeholder="名称" className="w-full px-3 py-2 border border-neutral-200 rounded-lg mb-2 text-sm focus:border-amber-400 focus:ring-1 focus:ring-amber-100 outline-none" />
              <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="描述" className="w-full px-3 py-2 border border-neutral-200 rounded-lg mb-2 text-sm focus:border-amber-400 focus:ring-1 focus:ring-amber-100 outline-none" />
              <textarea
                value={config}
                onChange={e => setConfig(e.target.value)}
                placeholder="Config (JSON, 可选)"
                rows={4}
                className="w-full px-3 py-2 border border-neutral-200 rounded-lg mb-2 text-sm focus:border-amber-400 focus:ring-1 focus:ring-amber-100 outline-none"
              />
              <button onClick={handleAdd} className="bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg font-medium shadow-sm hover:shadow-md hover:shadow-amber-100 transition-all px-4 py-2 text-sm">提交</button>
            </div>
          )}

          {mcps.length === 0 ? (
            <p className="text-neutral-400 text-sm">暂无 MCP</p>
          ) : (
            <div className="space-y-8">
              {mcps.filter(m => m.visibility === "global").length > 0 && (
                <section>
                  <h2 className="text-sm font-medium text-secondary mb-3">全局 MCPs</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {mcps.filter(m => m.visibility === "global").map(m => (
                      <div key={m.id} className="smart-card p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-semibold text-sm text-primary">{m.name}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600">全局</span>
                        </div>
                        <p className="text-xs text-secondary mb-1">{m.description}</p>
                        {m.config != null && <p className="text-xs text-tertiary mb-3">已配置</p>}
                        <div className="flex items-center gap-2">
                          <button onClick={() => toggleMcp(m.id, m.enabled)} className={`text-xs px-3 py-1 rounded-lg transition-colors ${m.enabled ? "bg-green-50 text-green-600 hover:bg-green-100" : "bg-neutral-100 text-neutral-400 hover:bg-neutral-200"}`}>
                            {m.enabled ? "已启用" : "已禁用"}
                          </button>
                          <button onClick={() => deleteMcp(m.id)} className="text-xs text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors px-2 py-1">删除</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              {mcps.filter(m => m.visibility !== "global").length > 0 && (
                <section>
                  <h2 className="text-sm font-medium text-secondary mb-3">自定义 MCPs</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {mcps.filter(m => m.visibility !== "global").map(m => (
                      <div key={m.id} className="smart-card p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-semibold text-sm text-primary">{m.name}</span>
                        </div>
                        <p className="text-xs text-secondary mb-1">{m.description}</p>
                        {m.config != null && <p className="text-xs text-tertiary mb-3">已配置</p>}
                        <div className="flex items-center gap-2">
                          <button onClick={() => toggleMcp(m.id, m.enabled)} className={`text-xs px-3 py-1 rounded-lg transition-colors ${m.enabled ? "bg-green-50 text-green-600 hover:bg-green-100" : "bg-neutral-100 text-neutral-400 hover:bg-neutral-200"}`}>
                            {m.enabled ? "已启用" : "已禁用"}
                          </button>
                          <button onClick={() => deleteMcp(m.id)} className="text-xs text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors px-2 py-1">删除</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
      </div>
    </div>
  );
}
