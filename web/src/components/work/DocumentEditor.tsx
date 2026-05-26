import { useEffect, useRef } from "react";
import { Crepe } from "@milkdown/crepe";
import { replaceAll } from "@milkdown/utils";
import { useAutoSave } from "@/hooks/useAutoSave";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/nord.css";

export interface DocumentEditorProps {
  content: string;
  filePath: string | null;
  isStreaming: boolean;
  onSave: (path: string, content: string) => void;
  onContentChange: (content: string) => void;
}

export function DocumentEditor({
  content, filePath, isStreaming, onSave, onContentChange,
}: DocumentEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const isInternalChangeRef = useRef(false);

  const onSaveRef = useRef(onSave); onSaveRef.current = onSave;
  const onContentChangeRef = useRef(onContentChange); onContentChangeRef.current = onContentChange;
  const filePathRef = useRef(filePath); filePathRef.current = filePath;

  const { doSave, lastSavedRef } = useAutoSave({
    getContent: () => crepeRef.current?.getMarkdown() || "",
    getFilePath: () => filePathRef.current,
    onSave,
  });

  // Init editor when filePath changes
  useEffect(() => {
    if (!containerRef.current) return;

    if (crepeRef.current) {
      doSave(); // save current before switching
      crepeRef.current.destroy();
      crepeRef.current = null;
    }

    const crepe = new Crepe({
      root: containerRef.current,
      defaultValue: content || "",
    });

    crepe.create().then(() => {
      crepeRef.current = crepe;
      lastSavedRef.current = crepe.getMarkdown();

      // Milkdown's native change listener — save on every edit
      crepe.on((listener) => {
        listener.markdownUpdated((_ctx, md) => {
          isInternalChangeRef.current = true;
          onContentChangeRef.current(md);
          const fp = filePathRef.current;
          if (fp && md) {
            lastSavedRef.current = md;
            onSaveRef.current(fp, md);
          }
        });
      });
    });

    return () => {
      doSave();
      crepeRef.current?.destroy();
      crepeRef.current = null;
    };
  }, [filePath]);

  // Sync external content changes
  useEffect(() => {
    if (isInternalChangeRef.current) { isInternalChangeRef.current = false; return; }
    if (!crepeRef.current) return;
    const currentMd = crepeRef.current.getMarkdown();
    if (content !== currentMd) {
      lastSavedRef.current = content;
      crepeRef.current.editor.action(replaceAll(content));
    }
    if (isStreaming && filePath && content) {
      lastSavedRef.current = content;
      onSave(filePath, content);
    }
  }, [content, filePath, isStreaming, onSave]);

  const displayName = filePath ? filePath.split("/").pop() || filePath : null;

  return (
    <div className="flex flex-col h-full bg-[var(--app-bg)]">
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-[var(--app-border)] bg-[var(--app-surface)]">
        <div className="flex items-center gap-2.5 min-w-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--app-accent)" strokeWidth="2" strokeLinecap="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
          </svg>
          <span className="text-xs font-medium truncate text-[var(--app-text-secondary)]">{filePath || "No file selected"}</span>
        </div>
        {displayName && (
          <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md flex-shrink-0 ml-3 bg-[var(--app-accent-bg)] border border-[var(--app-accent-border)] text-[var(--app-accent)]">
            {displayName.endsWith(".md") ? "Markdown" : displayName.split(".").pop()?.toUpperCase() || "File"}
          </span>
        )}
        {isStreaming && (
          <span className="flex items-center gap-1 ml-2 text-xs text-[var(--app-accent)]">
            <span className="w-1 h-1 rounded-full bg-[var(--app-accent)] animate-pulse" />
            writing
          </span>
        )}
      </div>

      <div className="flex-1 overflow-auto bg-[var(--app-bg)]">
        {!filePath ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center animate-pageIn">
              <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center border border-[var(--app-border)]"
                style={{ background: "rgba(255,255,255,0.02)" }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--app-text-tertiary)" strokeWidth="1.2" strokeLinecap="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
                </svg>
              </div>
              <p className="text-sm font-medium text-[var(--app-text-tertiary)]">Select a file to edit</p>
              <p className="text-xs mt-1 text-[var(--app-border)]">Choose from the agent panel</p>
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto my-6 rounded-xl shadow-2xl overflow-hidden bg-white" style={{ minHeight: "calc(100% - 3rem)" }}>
            <div ref={containerRef} className="milkdown px-12 py-10 text-neutral-900" />
          </div>
        )}
      </div>
    </div>
  );
}

export default DocumentEditor;
