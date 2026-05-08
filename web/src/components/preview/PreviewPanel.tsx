import { useState } from "react";
import { MonacoEditor } from "@/components/preview/MonacoEditor";
import { useQuery } from "@tanstack/react-query";

interface PreviewPanelProps {
  projectId: number;
}

const tabs = [
  { key: "preview", label: "预览" },
  { key: "code", label: "代码" },
  { key: "source", label: "源码" },
];

interface ExecutionStep {
  terminalOutput?: string | null;
  type: string;
  title: string | null;
  status: string;
}

export function PreviewPanel({ projectId }: PreviewPanelProps) {
  const [activeTab, setActiveTab] = useState("code");

  const { data: steps = [] } = useQuery<ExecutionStep[]>({
    queryKey: ["projectFiles", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/steps`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 5000,
  });

  const completedSteps = steps.filter((s) => s.status === "completed" && s.terminalOutput);
  const codeOutput = completedSteps.length > 0
    ? completedSteps.map((s) => `// Step: ${s.title || s.type}\n${s.terminalOutput || ""}`).join("\n\n")
    : null;

  const displayCode = codeOutput || "// 在输入框描述需求\n// 点击「+ 创建工具」按钮触发代码生成\n// 生成的代码将在这里展示";

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
        <span className="text-xs text-neutral-400">
          {completedSteps.length > 0 ? `${completedSteps.length} 个步骤完成` : ""}
        </span>
        <button className="bg-blue-600 text-white rounded px-3 py-1.5 text-sm hover:bg-blue-700 transition-colors">
          部署
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        {activeTab === "code" && (
          <MonacoEditor code={displayCode} language="typescript" />
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
