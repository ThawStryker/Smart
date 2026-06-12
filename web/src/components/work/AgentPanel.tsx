import { useState, useEffect, useCallback } from "react";
import { getAgentAvatar } from "./icons";
import { renderFileChildren } from "./FileTree";
import { useFilePanel } from "@/hooks/useFilePanel";

interface AgentPanelProps {
  sessionId: number;
  onFileSelect: (path: string, content: string) => void;
  selectedFile: string | null;
  onAgentListChange: () => void;
  reloadTrigger?: number;
  onCloseFile?: () => void;
}

export function AgentPanel({ sessionId, onFileSelect, selectedFile, onAgentListChange, reloadTrigger, onCloseFile }: AgentPanelProps) {
  const [agentNames, setAgentNames] = useState<string[]>([]);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentTemplate, setNewAgentTemplate] = useState("通用");

  const {
    expanded, setExpanded, toggleExpand, tree,
    createFile, createFolder, renameFile, renameFolder, deleteFile, deleteFolder,
    startFileRename, finishFileRename, renamingPath, renameValue, setRenameValue,
    toast, setToast, confirm, ConfirmDialog,
  } = useFilePanel({ sessionId, urlPrefix: "agents", selectedFile, onCloseFile, reloadTrigger });

  const loadUserAgents = useCallback(async () => {
    const res = await fetch("/api/agents");
    if (res.ok) {
      const data: Array<{ name: string }> = await res.json();
      setAgentNames(data.map((a) => a.name));
      onAgentListChange();
    }
  }, [onAgentListChange]);

  useEffect(() => { loadUserAgents(); }, [loadUserAgents]);

  const AGENT_TEMPLATES: Record<string, string> = {
    通用: `# 我的角色

请在这里描述这个 Agent 的角色和能力。`,
    文案写手: `# 文案写手

你是一个资深文案写手，擅长品牌文案、产品介绍、广告语和社交媒体内容的创作。

## 写作风格
- 简洁有力，避免冗长
- 有感染力，能打动目标读者
- 结构清晰，逻辑自洽

## 工作流程
1. 了解目标受众和品牌调性
2. 确定核心信息和传播目标
3. 撰写初稿
4. 根据反馈优化`,
    翻译: `# 翻译专员

你是一个专业的翻译人员，精通中英文互译。

## 翻译原则
- 准确传达原文意思，不随意增删
- 符合目标语言表达习惯
- 保持原文风格和语气
- 专业术语统一

## 工作流程
1. 通读全文理解上下文
2. 逐段翻译
3. 通读译文检查流畅度`,
    编剧: `# 编剧

你是一个创意编剧，擅长故事创作、剧本撰写和角色塑造。

## 创作风格
- 强情节驱动，节奏紧凑
- 角色立体，有成长弧线
- 对白自然，符合人物设定

## 工作流程
1. 确定故事主题和核心冲突
2. 设计角色和人物关系
3. 搭建故事结构（三幕/起承转合）
4. 撰写完整剧本`,
  };

  const confirmCreateAgent = async () => {
    if (!newAgentName.trim()) return;
    const name = newAgentName.trim();
    await fetch("/api/agents", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const template = AGENT_TEMPLATES[newAgentTemplate] || AGENT_TEMPLATES["通用"];
    await fetch(`/api/agents/${encodeURIComponent(name)}/files/AGENTS.md`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: template }),
    });
    setShowCreateDialog(false);
    setNewAgentName("");
    setExpanded((prev) => { const n = new Set(prev); n.add(`agents/${name}`); return n; });
    loadUserAgents();
    setToast(`Agent「${name}」已创建（${newAgentTemplate}模板）`);
  };

  const cancelCreateAgent = () => {
    setShowCreateDialog(false);
    setNewAgentName("");
  };

  const renameAgent = async (oldName: string, newName: string) => {
    if (!newName.trim() || newName.trim() === oldName) return;
    await fetch(`/api/agents/${oldName}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    loadUserAgents();
  };

  const deleteAgent = async (name: string) => {
    if (!await confirm(`确定删除 Agent「${name}」及其所有文件？`)) return;
    setAgentNames((prev) => prev.filter((a) => a !== name));
    try {
      await fetch(`/api/agents/${name}`, { method: "DELETE" });
    } catch { /* keep current list */ }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--app-bg)]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--app-border)]">
        <span className="text-xs font-bold uppercase tracking-widest text-[var(--app-text-tertiary)]">Agents</span>
        <button onClick={() => setShowCreateDialog(true)}
          className="w-6 h-6 rounded-lg flex items-center justify-center text-sm font-bold transition-all duration-200 hover:scale-110 bg-[var(--app-accent-bg)] text-[var(--app-accent)] leading-none">+</button>
      </div>

      <div className="overflow-auto py-1" style={{ flex: "1 1 0", minHeight: 0 }}>
        {agentNames.map((name) => {
          const isExpanded = expanded.has(`agents/${name}`);
          const avatar = getAgentAvatar(name);
          return (
            <div key={name} className="mb-0.5">
              <div className="flex items-center px-3 py-2 cursor-pointer group transition-colors"
                style={{ background: isExpanded ? "rgba(255,255,255,0.02)" : "transparent" }}
                onClick={() => toggleExpand(`agents/${name}`)}>
                <span className="mr-1.5 transition-transform duration-150 flex-shrink-0 opacity-60"
                  style={{ transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)", width: "12px", textAlign: "center" }}>
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="var(--app-text-tertiary)" strokeWidth="3" strokeLinecap="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </span>
                <span className="text-sm mr-2 flex-shrink-0 leading-none">{avatar}</span>
                {renaming === name ? (
                  <input value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => { renameAgent(name, renameValue); setRenaming(null); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { renameAgent(name, renameValue); setRenaming(null); }
                      if (e.key === "Escape") setRenaming(null);
                    }}
                    className="flex-1 bg-[var(--app-surface)] border border-[var(--app-accent)] rounded px-2 py-0.5 text-sm outline-none text-[var(--app-text)] min-w-0"
                    autoFocus
                    onFocus={(e) => e.target.select()}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="text-sm font-medium truncate text-[var(--app-text)]">
                    {name}
                  </span>
                )}
                <span className="opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
                  <AgentMenu agentName={name}
                    onRename={() => { setRenaming(name); setRenameValue(name); }}
                    onDelete={() => deleteAgent(name)} />
                </span>
              </div>
              {isExpanded && (
                <div className="ml-7 border-l border-[var(--app-border)]">
                  {renderFileChildren({ prefix: `agents/${name}`, tree, expanded, toggleExpand, onFileSelect, selectedFile, depth: 0, createFile, createFolder, renameFolder, deleteFolder, renameFile, deleteFile, renamingPath, renameValue, onStartRename: startFileRename, onRenameChange: setRenameValue, onFinishRename: finishFileRename })}
                </div>
              )}
            </div>
          );
        })}
        {agentNames.length === 0 && (
          <div className="px-4 py-8 text-center text-xs leading-relaxed text-[var(--app-text-tertiary)]">
            No agents yet.<br />
            <button onClick={() => setShowCreateDialog(true)} className="mt-2 font-medium hover:underline text-[var(--app-accent)]">Create your first agent</button>
          </div>
        )}
      </div>

      {ConfirmDialog}

      {toast && (
        <div className="fixed bottom-20 right-4 z-50 animate-pageIn">
          <div className="rounded-xl px-4 py-2.5 text-xs font-medium text-center shadow-xl bg-[var(--app-surface)] border border-[var(--app-border)] text-[var(--app-text)]">
            {toast}
          </div>
        </div>
      )}

      {showCreateDialog && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={cancelCreateAgent} />
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="rounded-2xl shadow-2xl border p-6 w-80 max-w-[90vw] bg-[var(--app-surface)] border-[var(--app-border)]" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-sm font-bold mb-4 text-[var(--app-text)]">创建 Agent</h3>

              <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5 text-[var(--app-text-tertiary)]">名称</label>
              <input value={newAgentName} onChange={(e) => setNewAgentName(e.target.value)}
                placeholder="输入 Agent 名称"
                className="w-full h-9 px-3 rounded-xl text-sm outline-none border bg-[var(--app-bg)] text-[var(--app-text)] border-[var(--app-border)] mb-4 focus:border-[var(--app-accent)] transition-colors"
                autoFocus onFocus={(e) => e.target.select()} />

              <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5 text-[var(--app-text-tertiary)]">模板</label>
              <div className="grid grid-cols-2 gap-2 mb-5">
                {Object.keys(AGENT_TEMPLATES).map((tpl) => (
                  <button key={tpl} onClick={() => setNewAgentTemplate(tpl)}
                    className="px-3 py-2 rounded-xl text-xs font-medium transition-all border"
                    style={{
                      background: newAgentTemplate === tpl ? "var(--app-accent-bg)" : "var(--app-bg)",
                      color: newAgentTemplate === tpl ? "var(--app-accent)" : "var(--app-text-secondary)",
                      borderColor: newAgentTemplate === tpl ? "var(--app-accent)" : "var(--app-border)",
                    }}>
                    {tpl}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <button onClick={cancelCreateAgent}
                  className="flex-1 h-9 rounded-xl text-xs font-medium border bg-[var(--app-bg)] text-[var(--app-text-secondary)] border-[var(--app-border)] hover:bg-[var(--app-accent-bg)] transition-colors">
                  取消
                </button>
                <button onClick={confirmCreateAgent}
                  disabled={!newAgentName.trim()}
                  className="flex-1 h-9 rounded-xl text-xs font-bold disabled:opacity-40 transition-all hover:scale-[1.02]"
                  style={{ background: "linear-gradient(135deg, var(--app-accent), var(--app-accent-deep))", color: "#1d1c19" }}>
                  创建
                </button>
              </div>
            </div>
          </div>
        </>
      )}

    </div>
  );
}

function AgentMenu({ agentName: _agentName, onRename, onDelete }: { agentName: string; onRename: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => setOpen(!open)}
        className="w-5 h-5 rounded flex items-center justify-center hover:bg-[var(--app-accent-bg)] transition-colors">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ color: "var(--app-text-tertiary)" }}>
          <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-40 w-32 rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)] shadow-xl overflow-hidden py-1">
            <div onClick={() => { onRename(); setOpen(false); }}
              className="px-3 py-1.5 text-xs cursor-pointer transition-colors hover:bg-[var(--app-accent-bg)] flex items-center gap-2 text-[var(--app-text)]">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
              Rename
            </div>
            <div onClick={() => { onDelete(); setOpen(false); }}
              className="px-3 py-1.5 text-xs cursor-pointer transition-colors hover:bg-[var(--app-accent-bg)] flex items-center gap-2 text-[var(--app-red)]">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
              Delete
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default AgentPanel;
