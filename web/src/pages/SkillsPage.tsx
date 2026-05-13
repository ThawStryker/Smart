import { useEffect, useState } from "react";
import { client } from "@/lib/edgespark";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";

interface Skill {
  id: number;
  name: string;
  description: string;
  visibility: string;
  sourceType: string;
  sourceUrl: string | null;
  enabled: boolean;
  status: string;
  errorMessage: string | null;
}

const statusBadge = (s: Skill) => {
  if (s.status === "installing") return <span className="text-xs text-blue-500 animate-pulse">安装中...</span>;
  if (s.status === "installed") return <span className="text-xs text-green-600">已安装</span>;
  if (s.status === "failed") return <span className="text-xs text-red-500" title={s.errorMessage || ""}>安装失败</span>;
  return null;
};

export function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<"zip" | "git">("git");
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [gitUrl, setGitUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const fetchSkills = async () => {
    const res = await client.api.fetch("/api/skills");
    const data = await res.json();
    setSkills(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => { fetchSkills(); }, []);

  // Auto-process any installing skill
  const processAllInstalling = async (list: Skill[]) => {
    for (const s of list) {
      if (s.status === "installing" && s.sourceType === "git" && s.sourceUrl) {
        await client.api.fetch(`/api/skills/${s.id}/process`, { method: "POST" });
      }
    }
    const res = await client.api.fetch("/api/skills");
    const data = await res.json();
    if (Array.isArray(data)) setSkills(data);
  };

  useEffect(() => {
    if (loading) return;
    const installing = skills.filter(s => s.status === "installing" && s.sourceType === "git" && s.sourceUrl);
    if (installing.length > 0) processAllInstalling(skills);
  }, [loading]);

  const handleInstall = async () => {
    let res;
    if (formType === "git") {
      res = await client.api.fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: desc, gitUrl }),
      });
    } else {
      const fd = new FormData();
      fd.append("name", name);
      fd.append("description", desc);
      if (file) fd.append("file", file);
      res = await client.api.fetch("/api/skills", { method: "POST", body: fd });
    }
    setShowForm(false);
    setName(""); setDesc(""); setGitUrl(""); setFile(null);

    // Trigger background processing for git installs
    const data = await res.json();
    if (data.id && formType === "git") {
      client.api.fetch(`/api/skills/${data.id}/process`, { method: "POST" }).finally(fetchSkills);
    }
    fetchSkills();
  };

  const toggleSkill = async (id: number, enabled: boolean) => {
    await client.api.fetch(`/api/skills/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !enabled }),
    });
    fetchSkills();
  };

  const deleteSkill = async (id: number) => {
    if (!confirm("确定删除？")) return;
    await client.api.fetch(`/api/skills/${id}`, { method: "DELETE" });
    fetchSkills();
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-medium">Skills</h1>
          <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 text-white px-4 py-2 rounded text-sm">
            安装 Skill
          </button>
        </div>

        {showForm && (
          <div className="bg-neutral-50 p-4 rounded mb-6">
            <div className="flex gap-3 mb-3">
              <button onClick={() => setFormType("git")} className={`px-3 py-1 rounded text-sm ${formType === "git" ? "bg-blue-600 text-white" : "bg-white"}`}>GitHub 地址</button>
              <button onClick={() => setFormType("zip")} className={`px-3 py-1 rounded text-sm ${formType === "zip" ? "bg-blue-600 text-white" : "bg-white"}`}>ZIP 上传</button>
            </div>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Skill 名称" className="w-full px-3 py-2 border rounded mb-2 text-sm" />
            <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="描述" className="w-full px-3 py-2 border rounded mb-2 text-sm" />
            {formType === "git" ? (
              <input value={gitUrl} onChange={e => setGitUrl(e.target.value)} placeholder="GitHub 仓库 URL" className="w-full px-3 py-2 border rounded mb-2 text-sm" />
            ) : (
              <input type="file" accept=".zip" onChange={e => setFile(e.target.files?.[0] || null)} className="w-full text-sm mb-2" />
            )}
            <button onClick={handleInstall} className="bg-blue-600 text-white px-4 py-2 rounded text-sm">安装</button>
          </div>
        )}

        {skills.length === 0 ? (
          <p className="text-neutral-400 text-sm">暂无 Skill</p>
        ) : (
          <div className="space-y-2">
            {skills.map(s => (
              <div key={s.id} className="flex items-center gap-4 p-3 bg-white border rounded">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{s.name}</span>
                    {s.visibility === "global" && <span className="text-xs bg-amber-100 text-amber-600 px-1.5 rounded">全局</span>}
                    {statusBadge(s)}
                  </div>
                  <div className="text-xs text-neutral-400">{s.description}</div>
                  <div className="text-xs text-neutral-300">来源: {s.sourceType}</div>
                </div>
                <button onClick={() => toggleSkill(s.id, s.enabled)} className={`text-xs px-2 py-1 rounded ${s.enabled ? "bg-green-100 text-green-600" : "bg-neutral-100 text-neutral-400"}`}>
                  {s.enabled ? "启用" : "禁用"}
                </button>
                <button onClick={() => deleteSkill(s.id)} className="text-xs text-red-400 hover:text-red-600">删除</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
