import { useState, useEffect } from "react";
import { MonacoEditor } from "@/components/preview/MonacoEditor";

interface GeneratedFile {
  path: string;
  language: string;
  content: string;
}

interface PreviewPanelProps {
  projectId: number;
  generatedFiles?: GeneratedFile[];
}

const tabs = [
  { key: "preview", label: "预览" },
  { key: "code", label: "代码" },
  { key: "source", label: "源码" },
];

export function PreviewPanel({ projectId: _projectId, generatedFiles = [] }: PreviewPanelProps) {
  const [activeTab, setActiveTab] = useState("code");
  const [selectedFileIdx, setSelectedFileIdx] = useState(0);

  // Refresh file list when new files arrive
  useEffect(() => {
    if (generatedFiles.length > 0) {
      setSelectedFileIdx(generatedFiles.length - 1);
      setActiveTab("code");
    }
  }, [generatedFiles.length]);

  const hasFiles = generatedFiles.length > 0;
  const currentFile = hasFiles ? generatedFiles[Math.min(selectedFileIdx, generatedFiles.length - 1)] : null;
  const langMap: Record<string, string> = { html: "html", css: "css", js: "javascript", ts: "typescript", tsx: "typescript", jsx: "javascript", json: "json", py: "python", rs: "rust", go: "go", java: "java", sql: "sql" };

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="bg-neutral-50 border-b border-neutral-200 px-4 py-2 flex items-center gap-3">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-1.5 rounded text-sm transition-colors ${
              activeTab === tab.key
                ? "bg-white border border-neutral-200 font-medium text-neutral-800"
                : "text-neutral-500 hover:bg-neutral-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
        <div className="flex-1" />
        <span className="text-xs text-neutral-400">{hasFiles ? `${generatedFiles.length} 个文件` : ""}</span>
        <button className="bg-blue-600 text-white rounded px-3 py-1.5 text-sm hover:bg-blue-700 transition-colors">
          部署
        </button>
      </div>

      {hasFiles && (
        <div className="border-b border-neutral-200 bg-neutral-50 px-2 py-1 flex gap-1 overflow-x-auto">
          {generatedFiles.map((f, i) => (
            <button
              key={i}
              onClick={() => setSelectedFileIdx(i)}
              className={`px-3 py-0.5 rounded text-xs whitespace-nowrap transition-colors ${
                i === selectedFileIdx
                  ? "bg-white border border-neutral-300 text-neutral-800"
                  : "text-neutral-500 hover:bg-neutral-100"
              }`}
            >
              {f.path}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        {activeTab === "code" && currentFile ? (
          <MonacoEditor code={currentFile.content} language={langMap[currentFile.language] || currentFile.language || "text"} />
        ) : activeTab === "code" ? (
          <div className="flex items-center justify-center h-full text-neutral-400 text-sm">
            <p>输入需求并发送，AI 生成的代码将在这里展示</p>
          </div>
        ) : activeTab === "preview" ? (
          <div className="flex items-center justify-center h-full text-neutral-400 text-sm">
            <p>预览功能开发中...</p>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-neutral-400 text-sm">
            <p>源码查看开发中...</p>
          </div>
        )}
      </div>
    </div>
  );
}
