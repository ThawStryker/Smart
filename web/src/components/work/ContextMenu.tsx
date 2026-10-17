import React, { useEffect, useRef, useState, useLayoutEffect } from "react";
import { createPortal } from "react-dom";

// ── Menu icon components ──

function NewFileIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
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
      className="px-3 py-1.5 text-xs flex items-center gap-2"
      style={{
        color: danger ? "var(--app-red)" : danger === false ? "var(--app-text-tertiary)" : "var(--app-text)",
        cursor: danger === false ? "not-allowed" : "pointer",
        opacity: danger === false ? 0.4 : 1,
      }}
      onMouseEnter={(e) => { if (danger === false) e.currentTarget.style.background = "transparent"; }}>
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
  folderPath, onCreateFile, onCreateFolder, onStartRename, onDelete,
}: {
  folderPath: string;
  onCreateFile: (parentPath: string) => Promise<void>;
  onCreateFolder: (parentPath: string) => Promise<void>;
  onStartRename: () => void;
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
            <MenuItem icon={<RenameIcon />} label="Rename" onClick={() => { onStartRename(); setOpen(false); }} />
            <MenuItem icon={<DeleteIcon />} label="Delete" onClick={() => { onDelete(); setOpen(false); }} danger />
          </div>
        </>
      )}
    </div>
  );
}

// ── File context menu ──

export function FileMenu({
  onStartRename, onDelete, canDelete = true,
}: {
  onStartRename: () => void;
  onDelete: () => void;
  canDelete?: boolean;
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
            <MenuItem icon={<RenameIcon />} label="Rename" onClick={() => { onStartRename(); setOpen(false); }} />
            <MenuItem icon={<DeleteIcon />} label="Delete" onClick={canDelete ? () => { onDelete(); setOpen(false); } : () => {}} danger={canDelete} />
          </div>
        </>
      )}
    </div>
  );
}

export function NewFileDialog({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: (name: string, ext: "md" | "docx") => void;
}) {
  const [name, setName] = useState("");
  const [ext, setExt] = useState<"md" | "docx">("md");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const submit = () => onConfirm(name, ext);

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-black/30 flex items-center justify-center" onClick={onCancel}>
        <form
          className="rounded-2xl shadow-2xl border p-5 w-80 max-w-[90vw] bg-[var(--app-surface)] border-[var(--app-border)]"
          onClick={(e) => e.stopPropagation()}
          onSubmit={(e) => { e.preventDefault(); submit(); }}
        >
          <p className="text-sm font-medium text-[var(--app-text)] mb-3">新建文件</p>
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
              placeholder="新文件"
              className="flex-1 min-w-0 h-9 px-3 rounded-lg text-sm bg-[var(--app-bg)] border border-[var(--app-border)] text-[var(--app-text)] outline-none focus:border-[var(--app-accent)]"
            />
            <select
              value={ext}
              onChange={(e) => setExt(e.target.value === "docx" ? "docx" : "md")}
              aria-label="文件格式"
              className="h-9 px-2 rounded-lg text-sm bg-[var(--app-bg)] border border-[var(--app-border)] text-[var(--app-text)] outline-none"
            >
              <option value="md">md</option>
              <option value="docx">docx</option>
            </select>
          </div>
          <div className="flex gap-2 mt-4">
            <button type="button" onClick={onCancel}
              className="flex-1 h-9 rounded-xl text-xs font-medium border bg-[var(--app-bg)] text-[var(--app-text-secondary)] border-[var(--app-border)]">
              取消
            </button>
            <button type="submit"
              className="flex-1 h-9 rounded-xl text-xs font-bold text-white"
              style={{ background: "linear-gradient(135deg, var(--app-accent), var(--app-accent-deep))" }}>
              创建
            </button>
          </div>
        </form>
    </div>,
    document.body,
  );
}

// ── Workspace header actions ──

export function WorkspaceActions({ onCreateFile, onCreateFolder, onUpload }: {
  onCreateFile: () => void;
  onCreateFolder: () => void;
  onUpload: (files: File[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const { ref, flip } = useFlip(open);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => setOpen(!open)}
        className="w-6 h-6 rounded-lg flex items-center justify-center text-sm font-medium transition-all duration-200 hover:scale-110 bg-[var(--app-accent-bg)] text-[var(--app-accent)] leading-none">+</button>
      <input
        ref={inputRef}
        type="file"
        accept=".docx,.md,.markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown"
        multiple
        className="hidden"
        onChange={(event) => {
          const picked = [...(event.target.files || [])];
          event.target.value = "";
          if (picked.length > 0) onUpload(picked);
        }}
      />
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div ref={ref}
            className={`absolute right-0 z-40 w-36 rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)] shadow-xl overflow-hidden py-1 ${flip ? "bottom-full mb-1" : "top-full mt-1"}`}>
            <MenuItem icon={<NewFileIcon />} label="New File" onClick={() => { onCreateFile(); setOpen(false); }} />
            <MenuItem icon={<NewFolderIcon />} label="New Folder" onClick={() => { onCreateFolder(); setOpen(false); }} />
            <MenuItem icon={<UploadIcon />} label="Upload" onClick={() => { setOpen(false); inputRef.current?.click(); }} />
          </div>
        </>
      )}
    </div>
  );
}
