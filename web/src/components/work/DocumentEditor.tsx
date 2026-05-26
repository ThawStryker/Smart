import { useEffect, useRef, useState } from "react";
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
  const [sourceView, setSourceView] = useState(false);

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
          if (fp && md) { lastSavedRef.current = md; onSaveRef.current(fp, md); }
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
    }
    if (isStreaming && filePath && content) {
      lastSavedRef.current = content;
      onSave(filePath, content);
    }
  }, [content, filePath, isStreaming, onSave]);

  // Toggle preview ↔ source
  const toggleSource = () => {
    if (!sourceView) {
      const md = crepeRef.current?.editor ? crepeRef.current.editor.action(getMarkdown()) : content;
      lastSavedRef.current = md;
      requestAnimationFrame(() => {
        if (sourceRef.current) sourceRef.current.value = md;
      });
    } else {
      const md = sourceRef.current?.value ?? "";
      if (crepeRef.current) {
        crepeRef.current.editor.action(replaceAll(md));
        onContentChange(md);
        lastSavedRef.current = md;
        if (filePath) onSave(filePath, md);
      }
    }
    setSourceView(!sourceView);
  };

  const handleSourceEdit = () => {
    const md = sourceRef.current?.value ?? "";
    lastSavedRef.current = md;
    onContentChange(md);
    if (filePath) onSave(filePath, md);
  };

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
        <button onClick={toggleSource}
          className="w-6 h-6 rounded flex items-center justify-center hover:bg-[var(--app-accent-bg)] transition-colors shrink-0"
          title={sourceView ? "Preview" : "Edit source"}>
          {sourceView ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--app-text-secondary)" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--app-text-secondary)" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
          )}
        </button>
        {onClose && (
          <button onClick={onClose} className="w-6 h-6 rounded flex items-center justify-center hover:bg-[var(--app-red-bg)] transition-colors shrink-0" title="Close">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--app-red)" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        )}
      </div>

      {/* Source view */}
      <div className="flex-1 overflow-auto" style={{ display: sourceView ? "block" : "none", background: "var(--app-bg)" }}>
        <div className="max-w-3xl mx-auto my-6 rounded-xl shadow-2xl overflow-hidden" style={{ background: "#1e1e1e", height: "calc(100% - 3rem)" }}>
          <textarea ref={sourceRef} defaultValue={lastSavedRef.current || content}
            onChange={handleSourceEdit}
            className="w-full h-full p-5 text-sm font-mono leading-relaxed outline-none resize-none border-0 bg-transparent"
            style={{ color: "#d4d4d4", tabSize: 2, fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'SF Mono', Menlo, monospace" }}
            spellCheck={false} placeholder="Markdown source..." />
        </div>
      </div>

      {/* Preview view */}
      <div className="flex-1 overflow-auto" style={{ display: sourceView ? "none" : "block" }}>
        <div className="max-w-3xl mx-auto my-6 rounded-xl shadow-2xl overflow-hidden bg-white" style={{ minHeight: "calc(100% - 3rem)", width: "100%" }}>
          <div ref={containerRef} className="milkdown px-12 py-10" style={{ color: "var(--app-text)" }} />
        </div>
      </div>
    </div>
  );
}

export default DocumentEditor;
