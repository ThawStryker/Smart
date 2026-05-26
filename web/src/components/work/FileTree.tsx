import React from "react";
import { getFileIcon, DefaultFolderIcon, MemoryFolderIcon, SkillsFolderIcon, ContextFolderIcon } from "./icons";
import { FolderMenu, FileMenu } from "./ContextMenu";

interface FileEntry {
  id: number;
  path: string;
  content: string;
  isFolder: number;
}

export function buildTree(files: FileEntry[]): Record<string, any> {
  const root: Record<string, any> = { __kids: {} };

  // Process folders first, then files — stable order regardless of file operations
  const folders = files.filter((f) => f.isFolder);
  const nonFolders = files.filter((f) => !f.isFolder);

  // Create all folder nodes
  for (const f of folders) {
    const parts = f.path.split("/");
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!node.__kids) node.__kids = {};
      const isLast = i === parts.length - 1;
      if (!node.__kids[part]) {
        node.__kids[part] = isLast ? { __kids: {}, _entry: f } : { __kids: {} };
      } else if (isLast) {
        if (!node.__kids[part].__kids) node.__kids[part] = { __kids: {}, _entry: f };
        else node.__kids[part]._entry = f;
      }
      node = node.__kids[part];
    }
  }

  // Place non-folder files
  for (const f of nonFolders) {
    const parts = f.path.split("/");
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) node = node.__kids[parts[i]];
    if (!node.__kids) node.__kids = {};
    node.__kids[parts[parts.length - 1]] = f;
  }

  return root;
}

export function renderFileChildren(
  prefix: string, tree: Record<string, any>, expanded: Set<string>,
  toggleExpand: (p: string) => void, onFileSelect: (p: string, c: string) => void, selectedFile: string | null,
  depth: number,
  createFile: (parentPath: string) => Promise<void>,
  createFolder: (parentPath: string) => Promise<void>,
  renameFolder: (folderPath: string, newName: string) => void,
  deleteFolder: (folderPath: string) => void,
  renameFile: (filePath: string, newName: string) => void,
  deleteFile: (filePath: string) => void,
): React.ReactNode[] {
  const parts = prefix.split("/");
  let node = tree;
  for (const part of parts) {
    if (!node.__kids || !node.__kids[part]) return [];
    node = node.__kids[part];
  }
  if (!node.__kids) return [];
  const entries = Object.entries(node.__kids) as Array<[string, any]>;
  return entries.map(([name, child]) => {
    const cp = `${prefix}/${name}`;
    const isFolder = child && typeof child === "object" && child.__kids !== undefined;
    const isOpen = expanded.has(cp);
    const padLeft = 12 + depth * 14;

    if (isFolder) {
      return (
        <div key={cp}>
          <div
            className="flex items-center py-1 pr-1 cursor-pointer group transition-colors hover:bg-[var(--app-accent-bg)]"
            style={{ paddingLeft: `${padLeft}px` }}
            onClick={() => toggleExpand(cp)}
          >
            <span className="mr-1.5 transition-transform duration-150 flex-shrink-0 opacity-60"
              style={{ transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)", width: "12px", textAlign: "center" }}>
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="var(--app-text-tertiary)" strokeWidth="3" strokeLinecap="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </span>
            {name === "memory" ? <MemoryFolderIcon /> : name === "skills" ? <SkillsFolderIcon /> : name === "context" ? <ContextFolderIcon /> : <DefaultFolderIcon open={isOpen} />}
            <span className="text-xs truncate font-medium ml-1.5 text-[var(--app-text-secondary)] flex-1">{name}</span>
            <span className="opacity-0 group-hover:opacity-100 transition-opacity ml-1">
              <FolderMenu folderPath={cp} folderName={name}
                onCreateFile={createFile} onCreateFolder={createFolder}
                onRename={(n) => renameFolder(cp, n)}
                onDelete={() => deleteFolder(cp)} />
            </span>
          </div>
          {isOpen && renderFileChildren(cp, tree, expanded, toggleExpand, onFileSelect, selectedFile, depth + 1, createFile, createFolder, renameFolder, deleteFolder, renameFile, deleteFile)}
        </div>
      );
    }

    const file = child as FileEntry;
    const isActive = selectedFile === cp;
    const FileIcon = getFileIcon(name);
    return (
      <div key={cp}
        className="flex items-center py-1 pr-3 cursor-pointer group transition-colors hover:bg-[var(--app-accent-bg)]"
        style={{
          paddingLeft: `${padLeft}px`,
          background: isActive ? "var(--app-accent-bg)" : "transparent",
          borderRight: isActive ? "2px solid var(--app-accent)" : "2px solid transparent",
        }}
        onClick={() => onFileSelect(cp, file.content || "")}
      >
        {/* Spacer to align with folder icons that have a chevron */}
        <span className="flex-shrink-0" style={{ width: "18px" }} />
        <FileIcon active={isActive} />
        <span className="text-xs truncate ml-1.5 flex-1" style={{ color: isActive ? "var(--app-accent)" : "var(--app-text-secondary)" }}>{name}</span>
        <span className="opacity-0 group-hover:opacity-100 transition-opacity ml-1">
          <FileMenu fileName={name}
            onRename={(n) => renameFile(cp, n)}
            onDelete={() => deleteFile(cp)} />
        </span>
      </div>
    );
  });
}
