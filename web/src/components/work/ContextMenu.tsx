import React, { useState, useRef, useLayoutEffect } from "react";

// ── Menu icon components ──

function NewFileIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" />
    </svg>
  );
}

function NewFolderIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /><line x1="12" y1="11" x2="12" y2="17" /><line x1="9" y1="14" x2="15" y2="14" />
    </svg>
  );
}

function RenameIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

// ── Shared MenuItem ──

export function MenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <div onClick={onClick}
      className="px-3 py-1.5 text-xs cursor-pointer transition-colors hover:bg-[var(--app-accent-bg)] flex items-center gap-2"
      style={{ color: danger ? "var(--app-red)" : "var(--app-text)" }}>
      {icon}
      {label}
    </div>
  );
}

// ── Smart positioning hook ──

function useFlip(open: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [flip, setFlip] = useState(false);

  useLayoutEffect(() => {
    if (!open || !ref.current) { setFlip(false); return; }
    const rect = ref.current.getBoundingClientRect();
    if (rect.bottom > window.innerHeight - 8) setFlip(true);
  }, [open]);

  return { ref, flip };
}

// ── Folder context menu ──

export function FolderMenu({
  folderPath, folderName, onCreateFile, onCreateFolder, onRename, onDelete,
}: {
  folderPath: string; folderName: string;
  onCreateFile: (parentPath: string) => Promise<void>;
  onCreateFolder: (parentPath: string) => Promise<void>;
  onRename: (newName: string) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { ref, flip } = useFlip(open);

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
          <div ref={ref}
            className={`absolute right-0 z-40 w-40 rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)] shadow-xl overflow-hidden py-1 ${flip ? "bottom-full mb-1" : "top-full mt-1"}`}>
            <MenuItem icon={<NewFileIcon />} label="New File" onClick={() => { onCreateFile(folderPath); setOpen(false); }} />
            <MenuItem icon={<NewFolderIcon />} label="New Folder" onClick={() => { onCreateFolder(folderPath); setOpen(false); }} />
            <div className="border-t border-[var(--app-border)] my-0.5" />
            <MenuItem icon={<RenameIcon />} label="Rename" onClick={() => { setOpen(false); const n = prompt("Rename to:", folderName); if (n) onRename(n); }} />
            <MenuItem icon={<DeleteIcon />} label="Delete" onClick={() => { onDelete(); setOpen(false); }} danger />
          </div>
        </>
      )}
    </div>
  );
}

// ── File context menu ──

export function FileMenu({
  fileName, onRename, onDelete,
}: {
  fileName: string;
  onRename: (newName: string) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { ref, flip } = useFlip(open);

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
          <div ref={ref}
            className={`absolute right-0 z-40 w-36 rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)] shadow-xl overflow-hidden py-1 ${flip ? "bottom-full mb-1" : "top-full mt-1"}`}>
            <MenuItem icon={<RenameIcon />} label="Rename" onClick={() => { setOpen(false); const n = prompt("Rename to:", fileName); if (n) onRename(n); }} />
            <MenuItem icon={<DeleteIcon />} label="Delete" onClick={() => { onDelete(); setOpen(false); }} danger />
          </div>
        </>
      )}
    </div>
  );
}

// ── Workspace header actions ──

export function WorkspaceActions({ onCreateFile, onCreateFolder }: { onCreateFile: () => void; onCreateFolder: () => void }) {
  const [open, setOpen] = useState(false);
  const { ref, flip } = useFlip(open);

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => setOpen(!open)}
        className="w-6 h-6 rounded-lg flex items-center justify-center text-sm font-medium transition-all duration-200 hover:scale-110 bg-[var(--app-accent-bg)] text-[var(--app-accent)] leading-none">+</button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div ref={ref}
            className={`absolute right-0 z-40 w-36 rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)] shadow-xl overflow-hidden py-1 ${flip ? "bottom-full mb-1" : "top-full mt-1"}`}>
            <MenuItem icon={<NewFileIcon />} label="New File" onClick={() => { onCreateFile(); setOpen(false); }} />
            <MenuItem icon={<NewFolderIcon />} label="New Folder" onClick={() => { onCreateFolder(); setOpen(false); }} />
          </div>
        </>
      )}
    </div>
  );
}
