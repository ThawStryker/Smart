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
    <div className="p-6">
      <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-medium">MCPs</h1>
            <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 text-white px-4 py-2 rounded text-sm">
              添加 MCP
            </button>
          </div>

          {showForm && (
            <div className="bg-neutral-50 p-4 rounded mb-6">
              <input value={name} onChange={e => setName(e.target.value)} placeholder="名称" className="w-full px-3 py-2 border rounded mb-2 text-sm" />
              <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="描述" className="w-full px-3 py-2 border rounded mb-2 text-sm" />
              <textarea
                value={config}
                onChange={e => setConfig(e.target.value)}
                placeholder="Config (JSON, 可选)"
                rows={4}
                className="w-full px-3 py-2 border rounded mb-2 text-sm"
              />
              <button onClick={handleAdd} className="bg-blue-600 text-white px-4 py-2 rounded text-sm">提交</button>
            </div>
          )}

          {mcps.length === 0 ? (
            <p className="text-neutral-400 text-sm">暂无 MCP</p>
          ) : (
            <div className="space-y-2">
              {mcps.map(m => (
                <div key={m.id} className="flex items-center gap-4 p-3 bg-white border rounded">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{m.name}</span>
                      {m.visibility === "global" && <span className="text-xs bg-amber-100 text-amber-600 px-1.5 rounded">全局</span>}
                    </div>
                    <div className="text-xs text-neutral-400">{m.description}</div>
                    {m.config != null && <div className="text-xs text-neutral-300">已配置</div>}
                  </div>
                  <button onClick={() => toggleMcp(m.id, m.enabled)} className={`text-xs px-2 py-1 rounded ${m.enabled ? "bg-green-100 text-green-600" : "bg-neutral-100 text-neutral-400"}`}>
                    {m.enabled ? "启用" : "禁用"}
                  </button>
                  <button onClick={() => deleteMcp(m.id)} className="text-xs text-red-400 hover:text-red-600">删除</button>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}
