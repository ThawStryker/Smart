import { lazy, Suspense } from "react";

const Editor = lazy(() => import("@monaco-editor/react"));

interface MonacoEditorProps {
  code: string;
  language?: string;
  readOnly?: boolean;
  onCodeChange?: (value: string) => void;
}

export function MonacoEditor({ code, language = "typescript", readOnly = true, onCodeChange }: MonacoEditorProps) {
  return (
    <Suspense fallback={<div className="text-neutral-400 text-sm p-4">加载编辑器...</div>}>
      <Editor
        height="100%"
        defaultLanguage={language}
        value={code}
        onChange={(v) => onCodeChange?.(v ?? "")}
        options={{
          readOnly,
          minimap: { enabled: true },
          fontSize: 13,
          lineNumbers: "on",
          scrollBeyondLastLine: false,
          wordWrap: "on",
          automaticLayout: true,
          tabSize: 2,
        }}
        theme="vs-dark"
      />
    </Suspense>
  );
}
