import { useState, useEffect } from "react";
import { client } from "@/lib/edgespark";

interface WorkAgent {
  id: number;
  name: string;
  role: string;
  systemPrompt: string;
  tools: string;
  skills: string;
}

interface ChatMessage {
  id: string;
  agentId: number | "me";
  role: "user" | "agent";
  content: string;
}

const roleLabels: Record<string, string> = {
  architect: "架构师",
  developer: "开发者",
  reviewer: "审查者",
  designer: "设计师",
  custom: "自定义",
};

const roleColors: Record<string, string> = {
  architect: "from-indigo-400 to-violet-500",
  developer: "from-amber-400 to-orange-500",
  reviewer: "from-emerald-400 to-teal-500",
  designer: "from-rose-400 to-pink-500",
  custom: "from-sky-400 to-blue-500",
};

export function WorkPage() {
  const [agents, setAgents] = useState<WorkAgent[]>([]);
  const [activeAgent, setActiveAgent] = useState<WorkAgent | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", role: "custom", systemPrompt: "", tools: "read,write,edit,list,grep", skills: "" });
  const [meTab, setMeTab] = useState<"chat" | "files" | "system">("chat");
  const [myMessages, setMyMessages] = useState<ChatMessage[]>([]);
  const [myInput, setMyInput] = useState("");
  const [agentInputs, setAgentInputs] = useState<Record<number, string>>({});
  const [agentMessages, setAgentMessages] = useState<Record<number, ChatMessage[]>>({});
  const [sharedDoc, setSharedDoc] = useState("# 共享工作区\n\n在此编辑文档、计划、设计稿...\n");

  const fetchAgents = async () => {
    const res = await client.api.fetch("/api/work/agents");
    setAgents(await res.json());
  };

  useEffect(() => { fetchAgents(); }, []);

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    await client.api.fetch("/api/work/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setShowCreate(false);
    setForm({ name: "", role: "custom", systemPrompt: "", tools: "read,write,edit,list,grep", skills: "" });
    fetchAgents();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确定删除？")) return;
    await client.api.fetch(`/api/work/agents/${id}`, { method: "DELETE" });
    if (activeAgent?.id === id) setActiveAgent(null);
    fetchAgents();
  };

  const handleMySend = () => {
    if (!myInput.trim()) return;
    const msg: ChatMessage = { id: `me-${Date.now()}`, agentId: "me", role: "user", content: myInput };
    setMyMessages(prev => [...prev, msg]);
    setMyInput("");
    setTimeout(() => {
      setMyMessages(prev => [...prev, { id: `me-a-${Date.now()}`, agentId: "me", role: "agent", content: `收到：「${msg.content}」—— 已推送到共享工作区。` }]);
    }, 500);
  };

  const handleAgentSend = (agentId: number) => {
    const input = agentInputs[agentId] || "";
    if (!input.trim()) return;
    const msgs = agentMessages[agentId] || [];
    const msg: ChatMessage = { id: `a-${Date.now()}`, agentId, role: "user", content: input };
    setAgentMessages(prev => ({ ...prev, [agentId]: [...msgs, msg] }));
    setAgentInputs(prev => ({ ...prev, [agentId]: "" }));
    const agent = agents.find(a => a.id === agentId);
    setTimeout(() => {
      setAgentMessages(prev => ({
        ...prev,
        [agentId]: [...(prev[agentId] || []), { id: `a-r-${Date.now()}`, agentId, role: "agent", content: `[${agent?.name}] 收到：「${msg.content}」—— 正在处理。` }],
      }));
    }, 500);
  };

  return (
    <div className="h-full flex bg-[#faf9f7]">
      {/* === LEFT: My Agent === */}
      <div className="w-80 border-r border-[#edeae5] flex flex-col shrink-0 bg-white">
        <div className="px-4 py-3 border-b border-[#edeae5] font-semibold text-sm text-primary">我的 Agent</div>
        <div className="flex border-b border-[#edeae5]">
          {["chat", "files", "system"].map(t => (
            <button key={t} onClick={() => setMeTab(t as typeof meTab)}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${meTab === t ? "text-amber-600 border-b-2 border-amber-500" : "text-tertiary hover:text-secondary"}`}>
              {{ chat: "对话", files: "文件", system: "系统" }[t]}
            </button>
          ))}
        </div>
        {meTab === "chat" && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {myMessages.map(m => (
                <div key={m.id} className={`text-xs ${m.role === "user" ? "text-right" : "text-left"}`}>
                  <span className={`inline-block px-3 py-2 rounded-lg max-w-[90%] ${m.role === "user" ? "bg-amber-50 text-amber-900" : "bg-[#f5f2ed] text-secondary"}`}>{m.content}</span>
                </div>
              ))}
              {myMessages.length === 0 && <p className="text-xs text-tertiary text-center py-8">私人对话，只有你可见</p>}
            </div>
            <div className="p-3 border-t border-[#edeae5]">
              <div className="flex gap-2">
                <input value={myInput} onChange={e => setMyInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleMySend()}
                  placeholder="输入消息..." className="flex-1 input-field px-3 py-1.5 text-xs" />
                <button onClick={handleMySend} className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600 transition-colors">发送</button>
              </div>
            </div>
          </div>
        )}
        {meTab === "files" && (
          <div className="flex-1 p-3">
            <p className="text-xs text-tertiary mb-3">我的文件资源</p>
            <div className="space-y-1">
              {["需求文档.md", "技术方案.md", "会议记录.md"].map(f => (
                <div key={f} className="text-xs text-secondary hover:bg-[#f5f2ed] px-2 py-1 rounded cursor-pointer flex items-center gap-2">
                  <span>📄</span> {f}
                </div>
              ))}
            </div>
          </div>
        )}
        {meTab === "system" && (
          <div className="flex-1 p-3">
            <p className="text-xs text-tertiary mb-3">系统管理</p>
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium text-secondary mb-1">Memory (记忆)</p>
                <p className="text-[11px] text-tertiary">通过对话自动积累的经验和偏好</p>
              </div>
              <div>
                <p className="text-xs font-medium text-secondary mb-1">Skills (技能)</p>
                <p className="text-[11px] text-tertiary">绑定的专属能力</p>
              </div>
              <div>
                <p className="text-xs font-medium text-secondary mb-1">Heartbeat (心跳)</p>
                <p className="text-[11px] text-tertiary">定时检查项配置</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* === CENTER: Shared Workspace === */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-4 py-3 border-b border-[#edeae5] font-semibold text-sm text-primary bg-white">共享工作区</div>
        <div className="flex-1 overflow-hidden">
          <textarea
            value={sharedDoc}
            onChange={e => setSharedDoc(e.target.value)}
            className="w-full h-full p-6 text-sm leading-relaxed resize-none outline-none bg-white font-mono"
            placeholder="共享工作区 — 所有 Agent 和角色都能读写..."
          />
        </div>
      </div>

      {/* === RIGHT: Partner Agents === */}
      <div className="w-80 border-l border-[#edeae5] flex flex-col shrink-0 bg-white">
        <div className="px-4 py-3 border-b border-[#edeae5] flex items-center justify-between">
          <span className="font-semibold text-sm text-primary">合作伙伴</span>
          <button onClick={() => setShowCreate(!showCreate)}
            className="text-xs text-amber-600 hover:text-amber-700 font-medium">+ 创建</button>
        </div>

        {showCreate && (
          <div className="p-3 border-b border-[#edeae5] space-y-2 bg-[#faf9f7]">
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="角色名称" className="w-full input-field px-2 py-1.5 text-xs" />
            <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
              className="w-full input-field px-2 py-1.5 text-xs">
              {Object.entries(roleLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <textarea value={form.systemPrompt} onChange={e => setForm(p => ({ ...p, systemPrompt: e.target.value }))}
              placeholder="系统提示 (可选)" rows={2} className="w-full input-field px-2 py-1.5 text-xs" />
            <button onClick={handleCreate}
              className="w-full py-1.5 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600 transition-colors">创建</button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {agents.map(a => (
            <div key={a.id} className="border-b border-[#edeae5]">
              <div className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-[#faf9f7] transition-colors"
                onClick={() => setActiveAgent(activeAgent?.id === a.id ? null : a)}>
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${roleColors[a.role] || roleColors.custom} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                  {a.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-primary truncate">{a.name}</div>
                  <div className="text-[11px] text-tertiary">{roleLabels[a.role] || a.role}</div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); handleDelete(a.id); }}
                  className="text-[10px] text-tertiary hover:text-red-500">删除</button>
              </div>
              {activeAgent?.id === a.id && (
                <div className="border-t border-[#edeae5] bg-[#faf9f7]">
                  <div className="p-2 max-h-40 overflow-y-auto space-y-2">
                    {(agentMessages[a.id] || []).map(m => (
                      <div key={m.id} className={`text-xs ${m.role === "user" ? "text-right" : "text-left"}`}>
                        <span className={`inline-block px-2 py-1.5 rounded-lg max-w-[85%] ${m.role === "user" ? "bg-blue-50 text-blue-900" : "bg-[#edeae5] text-secondary"}`}>{m.content}</span>
                      </div>
                    ))}
                    {(!agentMessages[a.id] || agentMessages[a.id].length === 0) && (
                      <p className="text-[11px] text-tertiary text-center py-4">@ {a.name} 开始对话</p>
                    )}
                  </div>
                  <div className="p-2 flex gap-1.5 border-t border-[#edeae5]">
                    <input value={agentInputs[a.id] || ""}
                      onChange={e => setAgentInputs(prev => ({ ...prev, [a.id]: e.target.value }))}
                      onKeyDown={e => e.key === "Enter" && handleAgentSend(a.id)}
                      placeholder={`@${a.name}...`} className="flex-1 input-field px-2 py-1 text-[11px]" />
                    <button onClick={() => handleAgentSend(a.id)}
                      className="px-2 py-1 bg-amber-500 text-white rounded text-[11px] font-medium hover:bg-amber-600 transition-colors">发送</button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {agents.length === 0 && !showCreate && (
            <p className="text-xs text-tertiary text-center py-8">点击"创建"添加合作伙伴</p>
          )}
        </div>
      </div>
    </div>
  );
}
