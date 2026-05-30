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
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const [sourceView, setSourceView] = useState(false);
  const [ready, setReady] = useState(false);

  const onSaveRef = useRef(onSave); onSaveRef.current = onSave;
  const onContentChangeRef = useRef(onContentChange); onContentChangeRef.current = onContentChange;
  const filePathRef = useRef(filePath); filePathRef.current = filePath;
  const prevPathRef = useRef<string | null>(null);

  // Init Crepe once on mount, save before switching files
  useEffect(() => {
    if (!containerRef.current) return;
    const crepe = new Crepe({ root: containerRef.current, defaultValue: content || "" });
    crepe.create().then(() => {
      crepeRef.current = crepe;
      crepe.on((listener) => {
        listener.markdownUpdated((_ctx, md) => {
          isInternalChangeRef.current = true;
          onContentChangeRef.current(md);
          const fp = filePathRef.current;
          if (fp) onSaveRef.current(fp, md);
        });
      });
      setReady(true);
    });
    return () => { try { crepe.destroy(); } catch {} crepeRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When switching files: save old, load new
  useEffect(() => {
    const prev = prevPathRef.current;
    prevPathRef.current = filePath;
    if (!ready || !crepeRef.current) return;
    // Save previous file before loading new one
    if (prev && prev !== filePath) {
      const md = crepeRef.current.editor.action(getMarkdown());
      if (md) onSaveRef.current(prev, md);
    }
    // Load new file content or clear if closed
    crepeRef.current.editor.action(replaceAll(filePath ? (content || "") : ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath]);

  // Sync external content (streaming updates)
  useEffect(() => {
    if (!ready || !crepeRef.current || !filePath) return;
    if (isInternalChangeRef.current) { isInternalChangeRef.current = false; return; }
    const currentMd = crepeRef.current.editor.action(getMarkdown());
    if (content !== currentMd) {
      crepeRef.current.editor.action(replaceAll(content));
    }
    if (isStreaming && content) {
      onSave(filePath, content);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, isStreaming]);

  // Toggle preview <-> source
  const toggleSource = () => {
    if (!sourceView) {
      const md = crepeRef.current?.editor ? crepeRef.current.editor.action(getMarkdown()) : content;
      requestAnimationFrame(() => {
        if (sourceRef.current) sourceRef.current.value = md || "";
      });
    } else {
      const md = sourceRef.current?.value ?? "";
      if (crepeRef.current) {
        crepeRef.current.editor.action(replaceAll(md));
        onContentChange(md);
        if (filePath) onSave(filePath, md);
      }
    }
    setSourceView(!sourceView);
  };

  const handleSourceEdit = () => {
    const md = sourceRef.current?.value ?? "";
    onContentChange(md);
    if (filePath) onSave(filePath, md);
  };

  return (
    <div className="flex flex-col h-full bg-[var(--app-bg)]">
      {/* File header */}
      {filePath && (<div className="flex items-center gap-2 px-5 py-2 border-b border-[var(--app-border)] bg-[var(--app-surface)] min-w-0">
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
      </div>)}

      {/* Source view */}
      <div className="flex-1 overflow-auto" style={{ display: sourceView ? "block" : "none", background: "var(--app-bg)" }}>
        <div className="max-w-3xl mx-auto my-6 rounded-xl shadow-2xl overflow-hidden" style={{ height: "calc(100% - 3rem)", background: "var(--app-surface)" }}>
          <textarea ref={sourceRef} defaultValue={content}
            onChange={handleSourceEdit}
            className="w-full h-full text-sm font-mono leading-relaxed outline-none resize-none border-0 bg-transparent"
            style={{ color: "var(--app-text)", tabSize: 2, padding: "50px 100px", fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'SF Mono', Menlo, monospace" }}
            spellCheck={false} placeholder="Markdown source..." />
        </div>
      </div>

      {/* Preview view */}
      <div className="flex-1 overflow-auto" style={{ display: sourceView ? "none" : "block" }}>
        <div className="max-w-3xl mx-auto my-6 rounded-xl shadow-2xl overflow-hidden flex flex-col" style={{ minHeight: "calc(100% - 3rem)", width: "100%", background: "var(--app-surface)", color: "var(--app-text)" }}>
          <div ref={containerRef} className="milkdown px-0 py-0 flex-1" style={{ display: filePath ? "block" : "none" }} />
        </div>
      </div>
    </div>
  );
}

export default DocumentEditor;
