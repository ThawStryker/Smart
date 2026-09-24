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
  onOpenNewFile?: (path: string) => void;
  onFileRenamed?: (oldPath: string, newPath: string) => void;
}

export function AgentPanel({ sessionId, onFileSelect, selectedFile, onAgentListChange, reloadTrigger, onCloseFile, onOpenNewFile, onFileRenamed }: AgentPanelProps) {
  const [agents, setAgents] = useState<Array<{ name: string; avatar: string; sourceListingId: number | null }>>([]);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentTemplate, setNewAgentTemplate] = useState("通用");
  const [publishAgent, setPublishAgent] = useState<string | null>(null);
  const [publishTitle, setPublishTitle] = useState("");
  const [publishDesc, setPublishDesc] = useState("");
  const [publishCategory, setPublishCategory] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState<string>("none");

  const {
    expanded, setExpanded, toggleExpand, tree, reloadFiles,
    createFile, createFolder, renameFile, renameFolder, deleteFile, deleteFolder,
    startFileRename, finishFileRename, cancelFileRename, renamingPath, renameValue, setRenameValue,
    toast, setToast, confirm, ConfirmDialog,
  } = useFilePanel({ sessionId, urlPrefix: "agents", selectedFile, onCloseFile, reloadTrigger, onOpenNewFile, onFileRenamed });

  const loadUserAgents = useCallback(async () => {
    const res = await fetch("/api/agents");
    if (res.ok) {
      const data: Array<{ name: string; avatar?: string | null; sourceListingId?: number | null }> = await res.json();
      setAgents(data.map((a) => ({
        name: a.name,
        avatar: a.avatar || getAgentAvatar(a.name),
        sourceListingId: a.sourceListingId ?? null,
      })));
      onAgentListChange();
    }
  }, [onAgentListChange]);

  useEffect(() => { loadUserAgents(); }, [loadUserAgents]);

  const AGENT_TEMPLATES: Record<string, string> = {
    通用: `# 角色

一句话说明你是谁、服务谁、做什么。

## 服务对象

- 谁在用你
- 你为谁产出

## 原则

- 三条以内，可执行，不要空话

## 工作方式

1. 缺关键信息时先问
2. 理解任务后，先 \`read_file\` 读取相关 \`memory/\`
3. 写正式稿件前再 \`skill_load\` 匹配的技能
4. 新文件 \`write_file\`，已有文件 \`edit_file\`
`,
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
    const res = await fetch("/api/agents", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setToast(data.error || "创建失败");
      return;
    }
    const template = AGENT_TEMPLATES[newAgentTemplate] || AGENT_TEMPLATES["通用"];
    await fetch(`/api/agents/${encodeURIComponent(name)}/files/AGENTS.md`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: template }),
    });
    setShowCreateDialog(false);
    setNewAgentName("");
    setExpanded((prev) => { const n = new Set(prev); n.add(`agents/${name}`); return n; });
    loadUserAgents();
    reloadFiles();
    setToast(`Agent「${name}」已创建（${newAgentTemplate}模板）`);
  };

  const cancelCreateAgent = () => {
    setShowCreateDialog(false);
    setNewAgentName("");
  };

  const renameAgent = async (oldName: string, newName: string) => {
    if (!newName.trim() || newName.trim() === oldName) return;
    const res = await fetch(`/api/agents/${encodeURIComponent(oldName)}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setToast(data.error || "重命名失败");
      return;
    }
    loadUserAgents();
    reloadFiles();
  };

  const downloadAgent = async (name: string) => {
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(name)}/download`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setToast(data.error || "下载失败");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setToast("下载失败");
    }
  };

  const deleteAgent = async (name: string) => {
    if (!await confirm(`确定删除 Agent「${name}」及其所有文件？`)) return;
    setAgents((prev) => prev.filter((a) => a.name !== name));
    try {
      await fetch(`/api/agents/${encodeURIComponent(name)}`, { method: "DELETE" });
    } catch { /* keep current list */ }
    onAgentListChange();
    reloadFiles();
  };

  const openPublish = async (name: string) => {
    setPublishAgent(name);
    setPublishTitle(name);
    setPublishDesc("");
    setPublishCategory("");
    setPublishStatus("none");
    const res = await fetch(`/api/agents/${encodeURIComponent(name)}/publish-status`);
    if (!res.ok) return;
    const s = await res.json();
    const live = s.status === "pending_review" || s.status === "approved";
    setPublishStatus(live ? s.status : "none");
    // 标题始终用当前 Agent 名，避免改名后市场仍显示旧名
    setPublishTitle(name);
    if (s.description) setPublishDesc(s.description);
    if (s.category) setPublishCategory(s.category);
  };

  const confirmPublish = async () => {
    if (!publishAgent || !publishTitle.trim()) return;
    setPublishing(true);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(publishAgent)}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: publishTitle.trim(),
          description: publishDesc.trim(),
          category: publishCategory.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast(data.error || "推送失败");
        return;
      }
      setPublishAgent(null);
      setToast("已提交审核，通过后将出现在人才市场");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--app-bg)]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--app-border)]">
        <span className="text-xs font-bold uppercase tracking-widest text-[var(--app-text-tertiary)]">Agents</span>
        <button onClick={() => setShowCreateDialog(true)}
          className="w-6 h-6 rounded-lg flex items-center justify-center text-sm font-bold transition-all duration-200 hover:scale-110 bg-[var(--app-accent-bg)] text-[var(--app-accent)] leading-none">+</button>
      </div>

      <div className="overflow-auto py-1" style={{ flex: "1 1 0", minHeight: 0 }}>
        {agents.map((agent) => {
          const name = agent.name;
          const canPublish = !agent.sourceListingId;
          const isExpanded = expanded.has(`agents/${name}`);
          const avatar = agent.avatar || getAgentAvatar(name);
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
                  <AgentMenu
                    canPublish={canPublish}
                    onPublish={() => openPublish(name)}
                    onDownload={() => downloadAgent(name)}
                    onRename={() => { setRenaming(name); setRenameValue(name); }}
                    onDelete={() => deleteAgent(name)} />
                </span>
              </div>
              {isExpanded && (
                <div className="ml-7 border-l border-[var(--app-border)]">
                  {renderFileChildren({ prefix: `agents/${name}`, tree, expanded, toggleExpand, onFileSelect, selectedFile, depth: 0, createFile, createFolder, renameFolder, deleteFolder, renameFile, deleteFile, renamingPath, renameValue, onStartRename: startFileRename, onRenameChange: setRenameValue, onFinishRename: finishFileRename, onCancelRename: cancelFileRename })}
                </div>
              )}
            </div>
          );
        })}
        {agents.length === 0 && (
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

      {publishAgent && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setPublishAgent(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="rounded-2xl shadow-2xl border p-6 w-80 max-w-[90vw] bg-[var(--app-surface)] border-[var(--app-border)]" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-sm font-bold mb-4 text-[var(--app-text)]">推送到人才市场</h3>
              <p className="text-[11px] text-[var(--app-text-tertiary)] mb-3">提交当前文件快照，需管理员审核通过后才会展示。</p>
              <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5 text-[var(--app-text-tertiary)]">标题</label>
              <input value={publishTitle} onChange={(e) => setPublishTitle(e.target.value)}
                className="w-full h-9 px-3 rounded-xl text-sm outline-none border bg-[var(--app-bg)] text-[var(--app-text)] border-[var(--app-border)] mb-3 focus:border-[var(--app-accent)] transition-colors" />
              <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5 text-[var(--app-text-tertiary)]">简介</label>
              <textarea value={publishDesc} onChange={(e) => setPublishDesc(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 rounded-xl text-sm outline-none border bg-[var(--app-bg)] text-[var(--app-text)] border-[var(--app-border)] mb-3 focus:border-[var(--app-accent)] transition-colors resize-none" />
              <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5 text-[var(--app-text-tertiary)]">分类</label>
              <input value={publishCategory} onChange={(e) => setPublishCategory(e.target.value)}
                placeholder="例如：教育、写作"
                className="w-full h-9 px-3 rounded-xl text-sm outline-none border bg-[var(--app-bg)] text-[var(--app-text)] border-[var(--app-border)] mb-5 focus:border-[var(--app-accent)] transition-colors" />
              <div className="flex gap-2">
                <button onClick={() => setPublishAgent(null)}
                  className="flex-1 h-9 rounded-xl text-xs font-medium border bg-[var(--app-bg)] text-[var(--app-text-secondary)] border-[var(--app-border)] hover:bg-[var(--app-accent-bg)] transition-colors">
                  取消
                </button>
                <button onClick={confirmPublish} disabled={!publishTitle.trim() || publishing}
                  className="flex-1 h-9 rounded-xl text-xs font-bold disabled:opacity-40 transition-all hover:scale-[1.02]"
                  style={{ background: "linear-gradient(135deg, var(--app-accent), var(--app-accent-deep))", color: "#1d1c19" }}>
                  {publishing ? "提交中..." : publishStatus === "none" ? "发布" : "再次发布"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

    </div>
  );
}

function AgentMenu({ canPublish, onPublish, onDownload, onRename, onDelete }: {
  canPublish: boolean;
  onPublish: () => void;
  onDownload: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
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
          <div className="absolute right-0 top-full mt-1 z-40 w-36 rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)] shadow-xl overflow-hidden py-1">
            <div
              onClick={() => {
                if (!canPublish) return;
                onPublish();
                setOpen(false);
              }}
              className={`px-3 py-1.5 text-xs flex items-center gap-2 ${
                canPublish
                  ? "cursor-pointer transition-colors hover:bg-[var(--app-accent-bg)] text-[var(--app-text)]"
                  : "cursor-not-allowed opacity-40 text-[var(--app-text-tertiary)]"
              }`}
              title={canPublish ? undefined : "从市场安装的 Agent 不能再发布"}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Publish
            </div>
            <div onClick={() => { onDownload(); setOpen(false); }}
              className="px-3 py-1.5 text-xs cursor-pointer transition-colors hover:bg-[var(--app-accent-bg)] flex items-center gap-2 text-[var(--app-text)]">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download
            </div>
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
