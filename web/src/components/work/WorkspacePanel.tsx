import { WorkspaceActions } from "./ContextMenu";
import { renderFileChildren } from "./FileTree";

interface WorkspacePanelProps {
  expanded: Set<string>;
  toggleExpand: (path: string) => void;
  tree: Record<string, any>;
  onFileSelect: (path: string, content: string) => void;
  selectedFile: string | null;
  createFile: (parentPath: string) => Promise<void>;
  createFolder: (parentPath: string) => Promise<void>;
  renameFolder: (folderPath: string, newName: string) => void;
  deleteFolder: (folderPath: string) => void;
  renameFile: (filePath: string, newName: string) => void;
  deleteFile: (filePath: string) => void;
}

export function WorkspacePanel({
  expanded, toggleExpand, tree, onFileSelect, selectedFile,
  createFile, createFolder, renameFolder, deleteFolder, renameFile, deleteFile,
}: WorkspacePanelProps) {
  return (
    <div className="border-t border-[var(--app-border)] flex flex-col" style={{ flex: "0 0 50%", minHeight: 0 }}>
      <div className="flex items-center justify-between px-4 py-2.5 cursor-pointer group" onClick={() => toggleExpand("workspace")}>
        <div className="flex items-center gap-2">
          <span className="mr-0.5 transition-transform duration-150 flex-shrink-0 opacity-60"
            style={{ transform: expanded.has("workspace") ? "rotate(0deg)" : "rotate(-90deg)", width: "12px", textAlign: "center" }}>
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="var(--app-text-tertiary)" strokeWidth="3" strokeLinecap="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--app-text-secondary)" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <span className="text-xs font-bold uppercase tracking-widest text-[var(--app-text-tertiary)]">Workspace</span>
        </div>
        <WorkspaceActions onCreateFile={() => createFile("workspace")} onCreateFolder={() => createFolder("workspace")} />
      </div>
      {expanded.has("workspace") && (
        <div className="flex-1 overflow-auto border-t border-[var(--app-border)]">
          {(() => {
            const children = renderFileChildren("workspace", tree, expanded, toggleExpand, onFileSelect, selectedFile, 0, createFile, createFolder, renameFolder, deleteFolder, renameFile, deleteFile);
            if (children.length === 0) {
              return (
                <div className="px-4 py-6 text-center text-[10px] text-[var(--app-text-tertiary)] leading-relaxed">
                  Workspace is empty.<br />Click <span className="text-[var(--app-accent)]">+</span> to add files or folders.
                </div>
              );
            }
            return children;
          })()}
        </div>
      )}
    </div>
  );
}

export default WorkspacePanel;
