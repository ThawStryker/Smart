import { useState } from "react";
import { MonacoEditor } from "@/components/preview/MonacoEditor";

interface PreviewPanelProps {
  projectId: number;
}

const tabs = [
  { key: "preview", label: "预览" },
  { key: "code", label: "代码" },
  { key: "source", label: "源码" },
];

export function PreviewPanel({ projectId: _projectId }: PreviewPanelProps) {
  const [activeTab, setActiveTab] = useState("code");

  const sampleCode = `// AI 生成的代码将在这里展示
// 触发 Claude Code Agent 开始生成代码

function hello() {
  console.log("Hello from Smart AI Platform");
}

export default hello;
`;

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
        <button className="bg-blue-600 text-white rounded px-3 py-1.5 text-sm hover:bg-blue-700 transition-colors">
          部署
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        {activeTab === "code" && (
          <MonacoEditor code={sampleCode} language="typescript" />
        )}
        {activeTab === "preview" && (
          <div className="flex items-center justify-center h-full text-neutral-400 text-sm">
            <p>预览功能开发中...</p>
          </div>
        )}
        {activeTab === "source" && (
          <div className="flex items-center justify-center h-full text-neutral-400 text-sm">
            <p>源码查看开发中...</p>
          </div>
        )}
      </div>
    </div>
  );
}
