import { useEffect, useRef } from "react";
import { Crepe } from "@milkdown/crepe";
import { replaceAll } from "@milkdown/utils";
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
  content,
  filePath,
  isStreaming,
  onSave,
  onContentChange,
}: DocumentEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInternalChangeRef = useRef(false);

  // Keep latest callbacks in refs to avoid stale closures in the init effect
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const onContentChangeRef = useRef(onContentChange);
  onContentChangeRef.current = onContentChange;
  const filePathRef = useRef(filePath);
  filePathRef.current = filePath;

  // Initialize editor once on mount
  useEffect(() => {
    if (!containerRef.current || crepeRef.current) return;

    const crepe = new Crepe({
      root: containerRef.current,
      defaultValue: content || "",
    });

    crepe.create().then(() => {
      crepeRef.current = crepe;

      // Listen for user edits to detect internal changes and trigger auto-save
      crepe.on((listener) => {
        listener.markdownUpdated((_ctx, md) => {
          isInternalChangeRef.current = true;
          onContentChangeRef.current(md);

          const currentFilePath = filePathRef.current;
          if (currentFilePath && md) {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
            saveTimerRef.current = setTimeout(() => {
              onSaveRef.current(currentFilePath, md);
            }, 2000);
          }
        });
      });
    });

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      crepeRef.current?.destroy();
      crepeRef.current = null;
    };
  }, []);

  // Sync editor from external content changes (SSE streaming updates)
  useEffect(() => {
    // Skip if this was triggered by our own internal edit
    if (isInternalChangeRef.current) {
      isInternalChangeRef.current = false;
      return;
    }
    if (!crepeRef.current) return;

    const currentMd = crepeRef.current.getMarkdown();
    if (content !== currentMd) {
      crepeRef.current.editor.action(replaceAll(content));
    }

    // Auto-save streamed content
    if (isStreaming && filePath && content) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        onSave(filePath, content);
      }, 2000);
    }
  }, [content, filePath, isStreaming, onSave]);

  // Cleanup save timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  if (!filePath) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Select a file to edit
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {isStreaming && (
        <div className="px-4 py-1.5 bg-blue-50 text-blue-600 text-xs border-b flex items-center gap-2">
          <span className="inline-block w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
          Agent is writing...
        </div>
      )}
      <div className="flex-1 overflow-auto milkdown-container">
        <div ref={containerRef} className="milkdown" />
      </div>
    </div>
  );
}

export default DocumentEditor;
