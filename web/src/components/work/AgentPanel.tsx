import { useState, useEffect, useCallback } from "react";
import { getAgentAvatar } from "./icons";
import { WorkspacePanel } from "./WorkspacePanel";
import { buildTree, renderFileChildren } from "./FileTree";
import type { FileEntry } from "@/types/work";

interface AgentPanelProps {
  sessionId: number;
  onFileSelect: (path: string, content: string) => void;
  selectedFile: string | null;
  onAgentListChange: () => void;
}

export function AgentPanel({ sessionId, onFileSelect, selectedFile, onAgentListChange }: AgentPanelProps) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["agents"]));
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [agentNames, setAgentNames] = useState<string[]>([]);

  const startFileRename = (path: string, name: string) => { setRenamingPath(path); setRenameValue(name); };
  const finishFileRename = (path: string, oldName: string) => {
    if (renameValue.trim() && renameValue.trim() !== oldName) {
      if (path.includes(`/${oldName}`)) renameFile(path, renameValue.trim());
    }
    setRenamingPath(null);
    setRenameValue("");
  };

  const loadFiles = useCallback(async () => {
    // Load session files + global workspace files + agent files
    const [sessionRes, workspaceRes, agentRes] = await Promise.all([
      fetch(`/api/work/sessions/${sessionId}/files`),
      fetch(`/api/work/sessions/${sessionId}/files?all=1&prefix=workspace/`),
      fetch("/api/agents"),
    ]);
    let allFiles: FileEntry[] = [];
    if (sessionRes.ok) allFiles = await sessionRes.json();
    if (workspaceRes.ok) allFiles = [...allFiles, ...(await workspaceRes.json())];
    if (agentRes.ok) {
      const agents = await agentRes.json();
      const agentFiles = await Promise.all(
        agents.map(async (a: { name: string }) => {
          const r = await fetch(`/api/agents/${a.name}/files`);
          return r.ok ? r.json() : [];
        }),
      );
      allFiles = [...allFiles, ...agentFiles.flat()];
    }
    // Deduplicate by path
    const seen = new Set<string>();
    setFiles(allFiles.filter((f: FileEntry) => {
      if (seen.has(f.path)) return false;
      seen.add(f.path);
      return true;
    }));
  }, [sessionId]);

  const loadUserAgents = useCallback(async () => {
    const res = await fetch("/api/agents");
    if (res.ok) {
      const data: Array<{ name: string }> = await res.json();
      setAgentNames(data.map((a) => a.name));
      onAgentListChange();
    }
  }, [onAgentListChange]);

  useEffect(() => { if (sessionId) loadFiles(); }, [sessionId, loadFiles]);
  useEffect(() => { loadUserAgents(); }, [loadUserAgents]);

  const toggleExpand = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  const createAgent = async () => {
    let idx = agentNames.length + 1;
    let name = `新Agent ${idx}`;
    while (agentNames.includes(name)) { idx++; name = `新Agent ${idx}`; }
    await fetch("/api/agents", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    loadFiles(); loadUserAgents();
  };

  const renameAgent = async (oldName: string, newName: string) => {
    if (!newName.trim() || newName.trim() === oldName) return;
    await fetch(`/api/agents/${oldName}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    loadFiles(); loadUserAgents();
  };

  const deleteAgent = async (name: string) => {
    await fetch(`/api/agents/${name}`, { method: "DELETE" });
    loadFiles(); loadUserAgents();
  };

  const createFile = useCallback(async (parentPath: string) => {
    const prefix = parentPath.endsWith("/") ? parentPath : `${parentPath}/`;
    const name = `新文件.md`;
    let path = `${prefix}${name}`;
    let idx = 1;
    while (files.some((f) => f.path === path)) { idx++; path = `${prefix}新文件 ${idx}.md`; }
    await fetch(`/api/work/sessions/${sessionId}/files/${path}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "" }),
    });
    loadFiles();
  }, [sessionId, files, loadFiles]);

  const createFolder = useCallback(async (parentPath: string) => {
    const prefix = parentPath.endsWith("/") ? parentPath : `${parentPath}/`;
    const name = "新文件夹";
    let path = `${prefix}${name}`;
    let idx = 1;
    while (files.some((f) => f.path === path)) { idx++; path = `${prefix}新文件夹 ${idx}`; }
    await fetch(`/api/work/sessions/${sessionId}/files/${path}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFolder: true }),
    });
    loadFiles();
  }, [sessionId, files, loadFiles]);

  const renameFolder = useCallback(async (folderPath: string, newName: string) => {
    if (!newName.trim()) return;
    const parentPath = folderPath.split("/").slice(0, -1).join("/");
    const newPath = parentPath ? `${parentPath}/${newName.trim()}` : newName.trim();
    if (newPath === folderPath) return;
    const children = files.filter((f) => f.path.startsWith(`${folderPath}/`) || f.path === folderPath);
    // Copy all children to new paths, then delete old
    await Promise.all(children.map((f) => {
      const updated = f.path.replace(folderPath, newPath);
      return fetch(`/api/work/sessions/${sessionId}/files/${updated}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: f.content, isFolder: f.isFolder ? true : undefined }),
      });
    }));
    await fetch(`/api/work/sessions/${sessionId}/files/${folderPath}`, { method: "DELETE" });
    loadFiles();
  }, [sessionId, files, loadFiles]);

  const deleteFolder = useCallback(async (folderPath: string) => {
    if (!confirm(`Delete "${folderPath}" and all its contents?`)) return;
    await fetch(`/api/work/sessions/${sessionId}/files/${folderPath}`, { method: "DELETE" });
    loadFiles();
  }, [sessionId, loadFiles]);

  const renameFile = useCallback(async (filePath: string, newName: string) => {
    if (!newName.trim()) return;
    const parentPath = filePath.split("/").slice(0, -1).join("/");
    const newPath = parentPath ? `${parentPath}/${newName.trim()}` : newName.trim();
    if (newPath === filePath) return;
    const existing = files.find((f) => f.path === filePath);
    if (!existing) return;
    await fetch(`/api/work/sessions/${sessionId}/files/${newPath}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: existing.content, isFolder: false }),
    });
    await fetch(`/api/work/sessions/${sessionId}/files/${filePath}`, { method: "DELETE" });
    loadFiles();
  }, [sessionId, files, loadFiles]);

  const deleteFile = useCallback(async (filePath: string) => {
    if (!confirm(`Delete "${filePath}"?`)) return;
    await fetch(`/api/work/sessions/${sessionId}/files/${filePath}`, { method: "DELETE" });
    loadFiles();
  }, [sessionId, loadFiles]);

  const tree = buildTree(files);
  const agents = agentNames;

  return (
    <div className="flex flex-col h-full bg-[var(--app-bg)]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--app-border)]">
        <span className="text-xs font-bold uppercase tracking-widest text-[var(--app-text-tertiary)]">Agents</span>
        <button onClick={createAgent}
          className="w-6 h-6 rounded-lg flex items-center justify-center text-sm font-bold transition-all duration-200 hover:scale-110 bg-[var(--app-accent-bg)] text-[var(--app-accent)] leading-none">+</button>
      </div>

      <div className="overflow-auto py-1" style={{ flex: "1 1 0", minHeight: 0 }}>
        {agents.map((name) => {
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
                  {renderFileChildren(`agents/${name}`, tree, expanded, toggleExpand, onFileSelect, selectedFile, 0, createFile, createFolder, renameFolder, deleteFolder, renameFile, deleteFile, renamingPath, renameValue, startFileRename, setRenameValue, finishFileRename)}
                </div>
              )}
            </div>
          );
        })}
        {agents.length === 0 && (
          <div className="px-4 py-8 text-center text-xs leading-relaxed text-[var(--app-text-tertiary)]">
            No agents yet.<br />
            <button onClick={createAgent} className="mt-2 font-medium hover:underline text-[var(--app-accent)]">Create your first agent</button>
          </div>
        )}
      </div>

      <WorkspacePanel
        expanded={expanded}
        toggleExpand={toggleExpand}
        tree={tree}
        onFileSelect={onFileSelect}
        selectedFile={selectedFile}
        createFile={createFile}
        createFolder={createFolder}
        renameFolder={renameFolder}
        deleteFolder={deleteFolder}
        renameFile={renameFile}
        deleteFile={deleteFile}
        renamingPath={renamingPath}
        renameValue={renameValue}
        onStartRename={startFileRename}
        onRenameChange={setRenameValue}
        onFinishRename={finishFileRename}
      />

    </div>
  );
}

// ── Agent kebab menu ──

function AgentMenu({ agentName, onRename, onDelete }: { agentName: string; onRename: () => void; onDelete: () => void }) {
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
            <div onClick={() => { if (confirm(`Delete ${agentName}?`)) { onDelete(); setOpen(false); } }}
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
