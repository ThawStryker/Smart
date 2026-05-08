import { useState } from "react";
import { TerminalOutput } from "@/components/chat/TerminalOutput";
import { useExecutionSteps } from "@/hooks/useExecutionSteps";

interface ExecutionLogPanelProps {
  projectId: number;
}

const typeLabels: Record<string, string> = {
  code_gen: "代码生成",
  deps_install: "依赖安装",
  build: "构建",
  mcp_load: "MCP 加载",
  skill_load: "Skill 加载",
};

export function ExecutionLogPanel({ projectId }: ExecutionLogPanelProps) {
  const { steps, isLoading } = useExecutionSteps(projectId);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="p-4 text-sm text-neutral-400 text-center">
        <p>加载执行日志...</p>
      </div>
    );
  }

  if (steps.length === 0) {
    return (
      <div className="p-4 text-sm text-neutral-400 text-center">
        <p>暂无执行日志</p>
        <p className="mt-1 text-xs">AI 生成代码时，执行步骤将在这里展示</p>
      </div>
    );
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <span className="text-green-500">✓</span>;
      case "running":
        return <span className="text-blue-500 animate-spin">⟳</span>;
      case "failed":
        return <span className="text-red-500">✗</span>;
      default:
        return <span className="text-neutral-400">○</span>;
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "completed": return "已完成";
      case "running": return "运行中";
      case "failed": return "失败";
      default: return "等待中";
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "completed": return "text-green-600";
      case "running": return "text-blue-600";
      case "failed": return "text-red-600";
      default: return "text-neutral-500";
    }
  };

  return (
    <div className="p-4 space-y-3">
      {steps.map((step) => {
        const isExpanded = expandedIds.has(step.id) || step.status === "running";
        const lines = step.terminalOutput ? step.terminalOutput.split("\n") : [];

        return (
          <div
            key={step.id}
            className={`border rounded-lg overflow-hidden ${
              step.status === "running" ? "border-blue-200" :
              step.status === "failed" ? "border-red-200" :
              "border-neutral-200"
            }`}
          >
            <div
              onClick={() => toggleExpand(step.id)}
              className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                step.status === "running" ? "bg-blue-50 hover:bg-blue-100" : "bg-neutral-50 hover:bg-neutral-100"
              }`}
            >
              {statusIcon(step.status)}
              <span className={`text-sm font-medium ${statusColor(step.status)}`}>
                {statusLabel(step.status)}
              </span>
              <span className="text-xs bg-neutral-200 px-2 py-0.5 rounded text-neutral-600">
                {typeLabels[step.type] || step.type}
              </span>
              <span className="text-sm text-neutral-600 flex-1">{step.title}</span>
              <span className="text-neutral-400 text-xs">
                {isExpanded ? "▲" : "▼"}
              </span>
            </div>
            {isExpanded && (
              <div className="border-t border-neutral-200">
                {step.detail && (
                  <div className="px-4 py-2 text-sm text-neutral-600">{step.detail}</div>
                )}
                <TerminalOutput
                  lines={lines}
                  isRunning={step.status === "running"}
                  maxHeight="h-32"
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
