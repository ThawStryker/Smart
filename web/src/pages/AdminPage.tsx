import { useEffect, useState } from "react";
import { useProfile } from "@/hooks/useProfile";
import { client } from "@/lib/edgespark";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";

export function AdminPage() {
  const { isAdmin, loading: profileLoading } = useProfile();
  const [tab, setTab] = useState("review");

  // Review tab state
  const [pending, setPending] = useState<any[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);

  // Manage tab state
  const [approved, setApproved] = useState<any[]>([]);
  const [loadingApproved, setLoadingApproved] = useState(false);

  // URL tool form
  const [urlTitle, setUrlTitle] = useState("");
  const [urlDesc, setUrlDesc] = useState("");
  const [urlLink, setUrlLink] = useState("");
  const [urlCategory, setUrlCategory] = useState("");

  // Global skill form
  const [skillName, setSkillName] = useState("");
  const [skillDesc, setSkillDesc] = useState("");
  const [skillGitUrl, setSkillGitUrl] = useState("");

  // Global MCP form
  const [mcpName, setMcpName] = useState("");
  const [mcpDesc, setMcpDesc] = useState("");
  const [mcpConfig, setMcpConfig] = useState("");

  const [skillHidden, setSkillHidden] = useState(false);
  const [mcpHidden, setMcpHidden] = useState(false);

  const fetchPending = async () => {
    setLoadingPending(true);
    const res = await client.api.fetch("/api/admin/market/pending");
    setPending(await res.json());
    setLoadingPending(false);
  };

  const fetchApproved = async () => {
    setLoadingApproved(true);
    const res = await client.api.fetch("/api/admin/market/approved");
    setApproved(await res.json());
    setLoadingApproved(false);
  };

  useEffect(() => { if (isAdmin) fetchPending(); }, [isAdmin]);
  useEffect(() => { if (tab === "manage") fetchApproved(); }, [tab]);

  const approve = async (id: number) => {
    await client.api.fetch(`/api/admin/market/${id}/approve`, { method: "POST" });
    fetchPending();
  };

  const reject = async (id: number) => {
    await client.api.fetch(`/api/admin/market/${id}/reject`, { method: "POST" });
    fetchPending();
  };

  const delist = async (id: number) => {
    await client.api.fetch(`/api/admin/market/${id}/delist`, { method: "POST" });
    fetchApproved();
  };

  const addUrlTool = async () => {
    await client.api.fetch("/api/admin/market/url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: urlTitle, description: urlDesc, url: urlLink, category: urlCategory }),
    });
    setUrlTitle(""); setUrlDesc(""); setUrlLink(""); setUrlCategory("");
    alert("添加成功");
  };

  const addGlobalSkill = async () => {
    await client.api.fetch("/api/admin/skills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: skillName, description: skillDesc, gitUrl: skillGitUrl || undefined, hidden: skillHidden }),
    });
    setSkillName(""); setSkillDesc(""); setSkillGitUrl(""); setSkillHidden(false);
    alert("添加成功");
  };

  const addGlobalMcp = async () => {
    await client.api.fetch("/api/admin/mcps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: mcpName, description: mcpDesc, config: mcpConfig ? JSON.parse(mcpConfig) : undefined, hidden: mcpHidden }),
    });
    setMcpName(""); setMcpDesc(""); setMcpConfig(""); setMcpHidden(false);
    alert("添加成功");
  };

  if (profileLoading) return <LoadingSpinner />;
  if (!isAdmin) return <div className="p-8 text-neutral-500">无权限访问</div>;

  const tabs = [
    { key: "review", label: "审核" },
    { key: "manage", label: "市场管理" },
    { key: "url", label: "外部链接" },
    { key: "skill", label: "全局 Skill" },
    { key: "mcp", label: "全局 MCP" },
  ];

  return (
    <div className="p-6 animate-pageIn bg-[#fafafa]">
      <div className="max-w-3xl mx-auto">
          <h1 className="text-xl font-semibold text-neutral-900 mb-4">管理后台</h1>

          <div className="flex gap-2 mb-6">
            {tabs.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-2 rounded-lg text-sm ${tab === t.key ? "bg-amber-500 text-white" : "bg-neutral-100 text-neutral-600"}`}>{t.label}</button>
            ))}
          </div>

          {tab === "review" && (
            <div>
              <button onClick={fetchPending} className="text-sm text-amber-600 mb-3 hover:text-amber-700">刷新</button>
              {loadingPending ? <p className="text-sm text-neutral-400">加载中...</p> :
                pending.length === 0 ? <p className="text-sm text-neutral-400">暂无待审核</p> :
                pending.map(p => (
                  <div key={p.id} className="p-3 bg-white border border-[#f0f0f0] rounded-xl mb-2">
                    <div className="font-semibold text-sm text-neutral-900">{p.title}</div>
                    <div className="text-xs text-neutral-400 mb-2">{p.description}</div>
                    <div className="flex gap-2 items-center">
                      {p.projectId && p._toolId && (
                        <a
                          href={`/api/public/smart/preview/${p.projectId}/${p._toolId}/index.html`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-amber-600 hover:underline"
                        >
                          预览
                        </a>
                      )}
                      <button onClick={() => approve(p.id)} className="text-xs bg-green-600 text-white px-3 py-1 rounded">通过</button>
                      <button onClick={() => reject(p.id)} className="text-xs bg-red-500 text-white px-3 py-1 rounded">驳回</button>
                    </div>
                  </div>
                ))
              }
            </div>
          )}

          {tab === "manage" && (
            <div>
              <button onClick={fetchApproved} className="text-sm text-amber-600 mb-3 hover:text-amber-700">刷新</button>
              {loadingApproved ? <p className="text-sm text-neutral-400">加载中...</p> :
                approved.length === 0 ? <p className="text-sm text-neutral-400">暂无已发布工具</p> :
                approved.map((a: any) => (
                  <div key={a.id} className="p-3 bg-white border border-[#f0f0f0] rounded-xl mb-2 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-sm text-neutral-900">{a.title}</div>
                      <div className="text-xs text-neutral-400">{a.type === "url" ? "外部链接" : "Smart 工具"}</div>
                    </div>
                    <button onClick={() => delist(a.id)} className="text-xs bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600">下架</button>
                  </div>
                ))
              }
            </div>
          )}

          {tab === "url" && (
            <div className="space-y-3">
              <input value={urlTitle} onChange={e => setUrlTitle(e.target.value)} placeholder="标题" className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:border-amber-400 focus:ring-1 focus:ring-amber-100 outline-none" />
              <input value={urlDesc} onChange={e => setUrlDesc(e.target.value)} placeholder="描述" className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:border-amber-400 focus:ring-1 focus:ring-amber-100 outline-none" />
              <input value={urlLink} onChange={e => setUrlLink(e.target.value)} placeholder="URL 地址" className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:border-amber-400 focus:ring-1 focus:ring-amber-100 outline-none" />
              <input value={urlCategory} onChange={e => setUrlCategory(e.target.value)} placeholder="分类" className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:border-amber-400 focus:ring-1 focus:ring-amber-100 outline-none" />
              <button onClick={addUrlTool} className="bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg font-medium shadow-sm hover:shadow-md hover:shadow-amber-100 transition-all px-4 py-2 text-sm">添加工具</button>
            </div>
          )}

          {tab === "skill" && (
            <div className="space-y-3">
              <input value={skillName} onChange={e => setSkillName(e.target.value)} placeholder="名称" className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:border-amber-400 focus:ring-1 focus:ring-amber-100 outline-none" />
              <input value={skillDesc} onChange={e => setSkillDesc(e.target.value)} placeholder="描述" className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:border-amber-400 focus:ring-1 focus:ring-amber-100 outline-none" />
              <input value={skillGitUrl} onChange={e => setSkillGitUrl(e.target.value)} placeholder="Git URL (可选)" className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:border-amber-400 focus:ring-1 focus:ring-amber-100 outline-none" />
              <label className="flex items-center gap-2 text-sm text-neutral-600">
                <input type="checkbox" checked={skillHidden} onChange={e => setSkillHidden(e.target.checked)} className="rounded" />
                隐藏（不在前端展示，仅 Agent 可用）
              </label>
              <button onClick={addGlobalSkill} className="bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg font-medium shadow-sm hover:shadow-md hover:shadow-amber-100 transition-all px-4 py-2 text-sm">添加全局 Skill</button>
            </div>
          )}

          {tab === "mcp" && (
            <div className="space-y-3">
              <input value={mcpName} onChange={e => setMcpName(e.target.value)} placeholder="名称" className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:border-amber-400 focus:ring-1 focus:ring-amber-100 outline-none" />
              <input value={mcpDesc} onChange={e => setMcpDesc(e.target.value)} placeholder="描述" className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:border-amber-400 focus:ring-1 focus:ring-amber-100 outline-none" />
              <textarea value={mcpConfig} onChange={e => setMcpConfig(e.target.value)} placeholder="Config JSON (可选)" rows={4} className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:border-amber-400 focus:ring-1 focus:ring-amber-100 outline-none" />
              <label className="flex items-center gap-2 text-sm text-neutral-600">
                <input type="checkbox" checked={mcpHidden} onChange={e => setMcpHidden(e.target.checked)} className="rounded" />
                隐藏（不在前端展示，仅 Agent 可用）
              </label>
              <button onClick={addGlobalMcp} className="bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg font-medium shadow-sm hover:shadow-md hover:shadow-amber-100 transition-all px-4 py-2 text-sm">添加全局 MCP</button>
            </div>
          )}
      </div>
    </div>
  );
}
