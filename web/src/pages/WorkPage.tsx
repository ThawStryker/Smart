import { useState, useEffect, useRef } from "react";
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
  role: "user" | "assistant";
  content: string;
  isLoading?: boolean;
}

const roleLabels: Record<string, string> = {
  architect: "架构师", developer: "开发者", reviewer: "审查者", designer: "设计师", custom: "自定义",
};
const roleColors: Record<string, string> = {
  architect: "from-indigo-400 to-violet-500", developer: "from-amber-400 to-orange-500",
  reviewer: "from-emerald-400 to-teal-500", designer: "from-rose-400 to-pink-500",
  custom: "from-sky-400 to-blue-500",
};

const models = [
  { key: "seed", label: "Seed Code" },
  { key: "seed-pro", label: "Seed Pro" },
  { key: "deepseek", label: "DeepSeek V4" },
];

export function WorkPage() {
  const [agents, setAgents] = useState<WorkAgent[]>([]);
  const [activeAgent, setActiveAgent] = useState<WorkAgent | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", role: "custom", systemPrompt: "", tools: "read,write,edit,list,grep", skills: "" });
  const [meTab, setMeTab] = useState<"chat" | "files" | "system">("chat");
  const [model, setModel] = useState("seed");
  const [sharedDoc, setSharedDoc] = useState("# 共享工作区\n\n在此编辑文档、计划、设计稿...\n");
  const [isStreaming, setIsStreaming] = useState(false);

  // My Agent chat
  const [myMessages, setMyMessages] = useState<ChatMessage[]>([]);
  const [myInput, setMyInput] = useState("");
  const myEndRef = useRef<HTMLDivElement>(null);

  // Partner agent chats
  const [agentInputs, setAgentInputs] = useState<Record<number, string>>({});
  const [agentMessages, setAgentMessages] = useState<Record<number, ChatMessage[]>>({});
  const agentEndRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const fetchAgents = async () => {
    const res = await client.api.fetch("/api/work/agents");
    setAgents(await res.json());
  };
  useEffect(() => { fetchAgents(); }, []);
  useEffect(() => { myEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [myMessages]);
  useEffect(() => {
    if (activeAgent) agentEndRefs.current[activeAgent.id]?.scrollIntoView({ behavior: "smooth" });
  }, [agentMessages, activeAgent]);

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    await client.api.fetch("/api/work/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
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

  const streamChat = async (message: string, systemPrompt: string, modelKey: string, abortController: AbortController) => {
    const res = await fetch("/api/work/chat", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, model: modelKey, systemPrompt }),
      signal: abortController.signal,
    });
    if (!res.ok || !res.body) throw new Error(`API ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "", fullText = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === "text") fullText += data.content;
          if (data.type === "error") fullText = `错误: ${data.content}`;
        } catch {}
      }
    }
    return fullText;
  };

  const handleMySend = async () => {
    if (!myInput.trim() || isStreaming) return;
    const content = myInput.trim();
    setMyInput("");
    const uid = `u-${Date.now()}`;
    const aid = `a-${Date.now()}`;
    setMyMessages(prev => [...prev, { id: uid, role: "user", content }, { id: aid, role: "assistant", content: "", isLoading: true }]);
    setIsStreaming(true);
    const controller = new AbortController();
    try {
      const sysPrompt = "你是用户的私人 AI 助手，帮助用户分析需求、整理思路、准备材料。用简洁的语言回复。";
      const fullText = await streamChat(content, sysPrompt, model, controller);
      setMyMessages(prev => prev.map(m => m.id === aid ? { id: aid, role: "assistant", content: fullText || "无响应" } : m));
    } catch (err: any) {
      if (err.name !== "AbortError") setMyMessages(prev => prev.map(m => m.id === aid ? { ...m, content: `错误: ${err.message}`, isLoading: false } : m));
    }
    setIsStreaming(false);
  };

  const handleAgentSend = async (agentId: number) => {
    const agent = agents.find(a => a.id === agentId);
    const input = agentInputs[agentId] || "";
    if (!input.trim() || !agent) return;
    const content = input.trim();
    setAgentInputs(prev => ({ ...prev, [agentId]: "" }));
    const uid = `u-${Date.now()}`;
    const aid = `a-${Date.now()}`;
    setAgentMessages(prev => ({
      ...prev,
      [agentId]: [...(prev[agentId] || []), { id: uid, role: "user", content }, { id: aid, role: "assistant", content: "", isLoading: true }],
    }));
    try {
      const fullText = await streamChat(content, agent.systemPrompt, model, new AbortController());
      setAgentMessages(prev => ({
        ...prev,
        [agentId]: (prev[agentId] || []).map(m => m.id === aid ? { ...m, content: fullText || "无响应" } : m),
      }));
    } catch (err: any) {
      setAgentMessages(prev => ({
        ...prev,
        [agentId]: (prev[agentId] || []).map(m => m.id === aid ? { ...m, content: `错误: ${err.message}`, isLoading: false } : m),
      }));
    }
  };

  const ChatBubble = ({ m }: { m: ChatMessage }) => (
    <div className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] px-3 py-2 rounded-lg text-xs leading-relaxed ${
        m.role === "user" ? "bg-amber-50 text-amber-900" : "bg-[#f5f2ed] text-secondary"
      }`}>
        {m.isLoading ? (
          <div className="flex items-center gap-1.5 text-tertiary">
            <span className="w-2 h-2 rounded-full bg-[#d4cfc7] animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-2 h-2 rounded-full bg-[#d4cfc7] animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-2 h-2 rounded-full bg-[#d4cfc7] animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
        ) : (
          <div dangerouslySetInnerHTML={{ __html: m.content.replace(/\n/g, "<br>") }} />
        )}
      </div>
    </div>
  );

  return (
    <div className="h-full flex bg-[#faf9f7]">
      {/* === LEFT: My Agent === */}
      <div className="w-80 border-r border-[#edeae5] flex flex-col shrink-0 bg-white">
        <div className="px-4 py-3 border-b border-[#edeae5] font-semibold text-sm text-primary">我的 Agent</div>
        <div className="flex border-b border-[#edeae5]">
          {(["chat", "files", "system"] as const).map(t => (
            <button key={t} onClick={() => setMeTab(t)}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${meTab === t ? "text-amber-600 border-b-2 border-amber-500" : "text-tertiary hover:text-secondary"}`}>
              {{ chat: "对话", files: "文件", system: "系统" }[t]}
            </button>
          ))}
        </div>
        {meTab === "chat" && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {myMessages.map(m => <ChatBubble key={m.id} m={m} />)}
              {myMessages.length === 0 && <p className="text-xs text-tertiary text-center py-8">私人对话，只有你可见</p>}
              <div ref={myEndRef} />
            </div>
            <div className="p-3 border-t border-[#edeae5] space-y-2">
              <div className="flex items-center gap-2">
                <select value={model} onChange={e => setModel(e.target.value)}
                  className="text-[11px] border border-[#edeae5] rounded px-2 py-0.5 bg-white text-secondary outline-none">
                  {models.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <input value={myInput} onChange={e => setMyInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleMySend()} placeholder="输入消息..."
                  className="flex-1 input-field px-3 py-1.5 text-xs" disabled={isStreaming} />
                <button onClick={handleMySend} disabled={isStreaming}
                  className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600 transition-colors disabled:opacity-40">发送</button>
              </div>
            </div>
          </div>
        )}
        {meTab === "files" && (
          <div className="flex-1 p-3">
            <p className="text-xs text-tertiary mb-3">我的文件资源</p>
            <div className="space-y-1">
              {["需求文档.md", "技术方案.md", "会议记录.md"].map(f => (
                <div key={f} className="text-xs text-secondary hover:bg-[#f5f2ed] px-2 py-1 rounded cursor-pointer flex items-center gap-2"><span>📄</span> {f}</div>
              ))}
            </div>
          </div>
        )}
        {meTab === "system" && (
          <div className="flex-1 p-3">
            <p className="text-xs text-tertiary mb-3">系统管理</p>
            <div className="space-y-3">
              <div><p className="text-xs font-medium text-secondary mb-1">Memory</p><p className="text-[11px] text-tertiary">对话积累的经验和偏好</p></div>
              <div><p className="text-xs font-medium text-secondary mb-1">Skills</p><p className="text-[11px] text-tertiary">绑定的专属能力</p></div>
              <div><p className="text-xs font-medium text-secondary mb-1">Heartbeat</p><p className="text-[11px] text-tertiary">定时检查项</p></div>
            </div>
          </div>
        )}
      </div>

      {/* === CENTER: Shared Workspace === */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-4 py-3 border-b border-[#edeae5] font-semibold text-sm text-primary bg-white">共享工作区</div>
        <div className="flex-1 overflow-hidden">
          <textarea value={sharedDoc} onChange={e => setSharedDoc(e.target.value)}
            className="w-full h-full p-6 text-sm leading-relaxed resize-none outline-none bg-white font-mono"
            placeholder="共享工作区 — 所有 Agent 和角色都能读写..." />
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
              placeholder="系统提示" rows={2} className="w-full input-field px-2 py-1.5 text-xs" />
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
                  <div className="p-2 max-h-52 overflow-y-auto space-y-2">
                    {(agentMessages[a.id] || []).map(m => <ChatBubble key={m.id} m={m} />)}
                    {(!agentMessages[a.id] || agentMessages[a.id].length === 0) && (
                      <p className="text-[11px] text-tertiary text-center py-4">@ {a.name} 开始对话</p>
                    )}
                    <div ref={(el) => { agentEndRefs.current[a.id] = el; }} />
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
          {agents.length === 0 && !showCreate && <p className="text-xs text-tertiary text-center py-8">点击"创建"添加合作伙伴</p>}
        </div>
      </div>
    </div>
  );
}
