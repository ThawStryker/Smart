import { useState, useEffect, useRef } from "react";
import { MonacoEditor } from "@/components/preview/MonacoEditor";
import { DeployModal } from "@/components/preview/DeployModal";

interface GeneratedFile {
  path: string;
  language: string;
  content: string;
}

interface PreviewPanelProps {
  projectId: number;
  toolId?: number | null;
  generatedFiles?: GeneratedFile[];
}

const tabs = [
  { key: "preview", label: "预览" },
  { key: "code", label: "代码" },
];

export function PreviewPanel({ projectId, toolId, generatedFiles = [] }: PreviewPanelProps) {
  const [activeTab, setActiveTab] = useState("code");
  const [selectedFileIdx, setSelectedFileIdx] = useState(0);
  const [showDeploy, setShowDeploy] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const hasHtml = generatedFiles.some((f) => f.path.endsWith(".html") || f.language === "html");
  const previewUrl = toolId && hasHtml
    ? `/api/public/smart/preview/${projectId}/${toolId}/index.html`
    : null;

  // Refresh file list when new files arrive
  useEffect(() => {
    if (generatedFiles.length > 0) {
      setSelectedFileIdx(generatedFiles.length - 1);
      setActiveTab("code");
      setPreviewKey((k) => k + 1);
    }
  }, [generatedFiles.length]);

  const hasFiles = generatedFiles.length > 0;
  const currentFile = hasFiles
    ? generatedFiles[Math.min(selectedFileIdx, generatedFiles.length - 1)]
    : null;
  const htmlFile =
    generatedFiles.find((f) => f.path.endsWith(".html")) ||
    generatedFiles.find((f) => f.language === "html");
  const langMap: Record<string, string> = {
    html: "html",
    css: "css",
    js: "javascript",
    ts: "typescript",
    tsx: "typescript",
    jsx: "javascript",
    json: "json",
    py: "python",
    rs: "rust",
    go: "go",
    java: "java",
    sql: "sql",
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Tab bar + deploy button */}
      <div className="bg-neutral-50 border-b border-neutral-200 px-4 py-2 flex items-center gap-3 shrink-0">
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
        <span className="text-xs text-neutral-400">
          {hasFiles ? `${generatedFiles.length} 个文件` : ""}
        </span>
        <button
          onClick={() => setShowDeploy(true)}
          className="bg-blue-600 text-white rounded px-3 py-1.5 text-sm hover:bg-blue-700 transition-colors"
        >
          部署
        </button>
      </div>

      {/* Content area */}
      <div className={`flex-1 ${activeTab === "code" ? "overflow-hidden" : "overflow-auto"}`}>
        {activeTab === "preview" ? (
          previewUrl ? (
            <iframe
              key={previewKey}
              ref={iframeRef}
              src={previewUrl}
              className="w-full h-full min-h-[600px] border-0"
              sandbox="allow-scripts allow-forms allow-same-origin"
              title="Preview"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-neutral-400 text-sm">
              <p>暂无 HTML 文件可预览</p>
            </div>
          )
        ) : activeTab === "code" ? (
          hasFiles ? (
            <div className="flex h-full">
              <div className="w-48 border-r border-neutral-200 bg-neutral-50 overflow-y-auto shrink-0">
                {generatedFiles.map((f, i) => (
                  <div
                    key={i}
                    onClick={() => setSelectedFileIdx(i)}
                    className={`px-3 py-2 text-xs cursor-pointer border-b border-neutral-100 transition-colors ${
                      i === selectedFileIdx
                        ? "bg-blue-50 text-blue-700 font-medium"
                        : "text-neutral-600 hover:bg-neutral-100"
                    }`}
                  >
                    <div className="truncate">{f.path}</div>
                    <div className="text-neutral-400 text-[10px]">{f.language}</div>
                  </div>
                ))}
              </div>
              <div className="flex-1 overflow-hidden">
                {currentFile ? (
                  <MonacoEditor
                    code={currentFile.content}
                    language={langMap[currentFile.language] || currentFile.language || "text"}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-neutral-400 text-sm">
                    <p>选择文件查看代码</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-neutral-400 text-sm">
              <p>输入需求并发送，AI 生成的代码将在这里展示</p>
            </div>
          )
        ) : null}
      </div>

      {/* Deploy modal */}
      {showDeploy && (
        <DeployModal
          projectId={projectId}
          htmlContent={htmlFile?.content || ""}
          files={generatedFiles.map(f => ({ path: f.path, content: f.content }))}
          onClose={() => setShowDeploy(false)}
        />
      )}
    </div>
  );
}
