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
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["agents", "workspace"]));
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const loadFiles = useCallback(async () => {
    const res = await fetch(`/api/work/sessions/${sessionId}/files`);
    if (res.ok) setFiles(await res.json());
  }, [sessionId]);

  useEffect(() => { if (sessionId) loadFiles(); }, [sessionId, loadFiles]);

  const toggleExpand = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  const createAgent = async () => {
    const existingNames = Object.keys(tree.__kids?.agents?.__kids || {});
    let idx = existingNames.length + 1;
    let name = `新Agent ${idx}`;
    while (existingNames.includes(name)) { idx++; name = `新Agent ${idx}`; }
    const base = `agents/${name}`;
    // Single batch: all folders + AGENTS.md in one round trip
    await fetch(`/api/work/sessions/${sessionId}/files/batch`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        { path: `${base}/AGENTS.md`, content: `# ${name}\n\nDescribe the role of this agent.` },
        { path: `${base}/memory/README.md`, content: "# Memory\n\nAgent memories and learned knowledge." },
        { path: `${base}/skills/README.md`, content: "# Skills\n\nAdd skill definitions here." },
        { path: `${base}/context/README.md`, content: "# Context\n\nReference materials for the agent." },
        { path: `${base}/heartbeat.md`, content: `## Status\n- Created: ${new Date().toISOString()}\n` },
      ]),
    });
    loadFiles(); onAgentListChange();
  };

  const renameAgent = async (oldName: string, newName: string) => {
    if (!newName.trim() || newName.trim() === oldName) return;
    const agentFiles = files.filter((f) => f.path.startsWith(`agents/${oldName}/`));
    // Copy all files in parallel, then delete old
    await Promise.all(agentFiles.map((f) => {
      const newPath = f.path.replace(`agents/${oldName}/`, `agents/${newName.trim()}/`);
      return fetch(`/api/work/sessions/${sessionId}/files/${newPath}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: f.content, isFolder: f.isFolder ? true : undefined }),
      });
    }));
    await fetch(`/api/work/sessions/${sessionId}/files/agents/${oldName}`, { method: "DELETE" });
    loadFiles(); onAgentListChange();
  };

  const deleteAgent = async (name: string) => {
    await fetch(`/api/work/sessions/${sessionId}/files/agents/${name}`, { method: "DELETE" });
    loadFiles(); onAgentListChange();
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
  const agents = Object.keys(tree.__kids?.agents?.__kids || {});

  return (
    <div className="flex flex-col h-full bg-[var(--app-bg)]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--app-border)]">
        <span className="text-xs font-bold uppercase tracking-widest text-[var(--app-text-tertiary)]">Agents</span>
        <button onClick={createAgent}
          className="w-6 h-6 rounded-lg flex items-center justify-center text-base font-medium transition-all duration-200 hover:scale-110 bg-[var(--app-accent-bg)] text-[var(--app-accent)]">+</button>
      </div>

      <div className="flex-1 overflow-auto py-1" style={{ minHeight: 0 }}>
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
                  <span className="text-sm font-medium truncate text-[var(--app-text)] cursor-pointer hover:opacity-70"
                    onDoubleClick={(e) => { e.stopPropagation(); setRenaming(name); setRenameValue(name); }}>
                    {name}
                  </span>
                )}
                <button onClick={(e) => { e.stopPropagation(); if (confirm(`Delete ${name}?`)) deleteAgent(name); }}
                  className="ml-auto text-xs opacity-0 group-hover:opacity-60 hover:opacity-100 transition-all px-1 text-[var(--app-red)]">&times;</button>
              </div>
              {isExpanded && (
                <div className="ml-7 border-l border-[var(--app-border)]">
                  {renderFileChildren(`agents/${name}`, tree, expanded, toggleExpand, onFileSelect, selectedFile, 0, createFile, createFolder, renameFolder, deleteFolder, renameFile, deleteFile)}
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
      />

    </div>
  );
}

export default AgentPanel;
