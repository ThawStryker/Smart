import { useEffect, useRef } from "react";
import { Crepe } from "@milkdown/crepe";
import { replaceAll, getMarkdown } from "@milkdown/utils";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/nord.css";

export interface DocumentEditorProps {
  content: string;
  filePath: string | null;
  isStreaming: boolean;
  onSave: (path: string, content: string) => void;
  onContentChange: (content: string) => void;
  onClose?: () => void;
}

export function DocumentEditor({
  content, filePath, isStreaming, onSave, onContentChange, onClose,
}: DocumentEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const isInternalChangeRef = useRef(false);
  const lastSavedRef = useRef("");
  const sourceRef = useRef<HTMLTextAreaElement>(null);

  const onSaveRef = useRef(onSave); onSaveRef.current = onSave;
  const onContentChangeRef = useRef(onContentChange); onContentChangeRef.current = onContentChange;
  const filePathRef = useRef(filePath); filePathRef.current = filePath;

  // Init preview editor
  useEffect(() => {
    if (!containerRef.current) return;
    if (crepeRef.current) { crepeRef.current.destroy(); crepeRef.current = null; }

    const crepe = new Crepe({ root: containerRef.current, defaultValue: content || "" });
    crepe.create().then(() => {
      crepeRef.current = crepe;
      lastSavedRef.current = crepe.editor.action(getMarkdown());
      crepe.on((listener) => {
        listener.markdownUpdated((_ctx, md) => {
          isInternalChangeRef.current = true;
          onContentChangeRef.current(md);
          const fp = filePathRef.current;
          if (fp && md) {
            lastSavedRef.current = md;
            onSaveRef.current(fp, md);
            // Sync to source textarea
            if (sourceRef.current) sourceRef.current.value = md;
          }
        });
      });
    });
    return () => { crepeRef.current?.destroy(); crepeRef.current = null; };
  }, [filePath]);

  // Sync external content to preview
  useEffect(() => {
    if (isInternalChangeRef.current) { isInternalChangeRef.current = false; return; }
    if (!crepeRef.current) return;
    const currentMd = crepeRef.current.editor.action(getMarkdown());
    if (content !== currentMd) {
      lastSavedRef.current = content;
      crepeRef.current.editor.action(replaceAll(content));
      if (sourceRef.current) sourceRef.current.value = content;
    }
    if (isStreaming && filePath && content) {
      lastSavedRef.current = content;
      onSave(filePath, content);
      if (sourceRef.current) sourceRef.current.value = content;
    }
  }, [content, filePath, isStreaming, onSave]);

  // Source textarea edit → sync to preview
  const handleSourceChange = () => {
    const md = sourceRef.current?.value ?? "";
    if (crepeRef.current) {
      crepeRef.current.editor.action(replaceAll(md));
      lastSavedRef.current = md;
      onContentChange(md);
      if (filePath) onSave(filePath, md);
    }
  };

  const displayName = filePath ? filePath.split("/").pop() || filePath : null;

  if (!filePath) {
    return (
      <div className="flex items-center justify-center h-full bg-[var(--app-bg)]">
        <div className="text-center animate-pageIn">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center border border-[var(--app-border)]" style={{ background: "rgba(255,255,255,0.02)" }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--app-text-tertiary)" strokeWidth="1.2" strokeLinecap="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </div>
          <p className="text-sm font-medium text-[var(--app-text-tertiary)]">Select a file to edit</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[var(--app-bg)]">
      {/* File header */}
      <div className="flex items-center gap-2 px-5 py-2 border-b border-[var(--app-border)] bg-[var(--app-surface)] min-w-0">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--app-accent)" strokeWidth="2" strokeLinecap="round" className="shrink-0">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
        </svg>
        <span className="text-xs font-medium truncate text-[var(--app-text-secondary)]">{filePath}</span>
        {isStreaming && (
          <span className="flex items-center gap-1 text-[10px] text-[var(--app-accent)] shrink-0">
            <span className="w-1 h-1 rounded-full bg-[var(--app-accent)] animate-pulse" /> writing
          </span>
        )}
        <div className="flex-1" />
        <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md bg-[var(--app-accent-bg)] border border-[var(--app-accent-border)] text-[var(--app-accent)] shrink-0">
          {displayName?.endsWith(".md") ? "Markdown" : "File"}
        </span>
        {onClose && (
          <button onClick={onClose} className="w-5 h-5 rounded flex items-center justify-center hover:bg-[var(--app-red-bg)] transition-colors shrink-0" title="Close">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--app-red)" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        )}
      </div>

      {/* Dual pane: Preview (left) + Source (right) */}
      <div className="flex-1 flex min-h-0">
        {/* Preview panel */}
        <div className="flex-1 overflow-auto border-r border-[var(--app-border)]">
          <div className="px-8 py-6">
            <div ref={containerRef} className="milkdown" style={{ color: "var(--app-text)" }} />
          </div>
        </div>
        {/* Source panel */}
        <div className="flex-1 flex flex-col" style={{ background: "#1e1e1e" }}>
          <div className="px-3 py-1.5 border-b border-[var(--app-border)] flex items-center">
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Markdown</span>
          </div>
          <textarea ref={sourceRef} defaultValue={content}
            onChange={handleSourceChange}
            className="flex-1 w-full p-4 text-sm font-mono leading-relaxed outline-none resize-none border-0 bg-transparent text-[#d4d4d4]"
            style={{ tabSize: 2 }}
            spellCheck={false}
            placeholder="Markdown source..." />
        </div>
      </div>
    </div>
  );
}

export default DocumentEditor;
