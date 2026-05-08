import { useEffect, useState, useCallback } from "react";
import { TopNav } from "@/components/layout/TopNav";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { ProjectConfigBar } from "@/components/workspace/ProjectConfigBar";
import { ExecutionLogPanel } from "@/components/workspace/ExecutionLogPanel";
import { ChatMessages, type ChatMessage } from "@/components/chat/ChatMessages";
import { ChatInput } from "@/components/chat/ChatInput";
import { PreviewPanel } from "@/components/preview/PreviewPanel";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate, useParams } from "react-router-dom";
import { client } from "@/lib/edgespark";
import { useQueryClient } from "@tanstack/react-query";

interface ProjectData {
  id: number;
  name: string;
  description: string | null;
  status: string;
}

export function ProjectDetail() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { projectId } = useParams();
  const queryClient = useQueryClient();
  const [project, setProject] = useState<ProjectData | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  const numProjectId = projectId ? parseInt(projectId, 10) : undefined;

  useEffect(() => {
    if (!projectId) return;
    client.api.fetch(`/api/projects/${projectId}`)
      .then((res) => res.json())
      .then((data) => {
        setProject(data as ProjectData);
        setPageLoading(false);
      })
      .catch(() => {
        navigate("/404");
      });
  }, [projectId, navigate]);

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || isStreaming || !numProjectId) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsStreaming(true);

    const assistantId = (Date.now() + 1).toString();
    setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "", isLoading: true }]);

    try {
      const res = await client.api.fetch(`/api/projects/${numProjectId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage.content }),
      });

      if (!res.ok) {
        setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: "AI 请求失败", isLoading: false } : m));
        setIsStreaming(false);
        return;
      }

      const data = await res.json();
      setMessages((prev) =>
        prev.map((m) => m.id === assistantId ? { ...m, content: data.content, isLoading: false } : m)
      );
    } catch {
      setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: "请求失败，请重试", isLoading: false } : m));
    } finally {
      setIsStreaming(false);
    }
  }, [input, isStreaming, numProjectId]);

  const handleGenerate = useCallback(async () => {
    if (!input.trim() || isStreaming || !numProjectId) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsStreaming(true);

    const assistantId = (Date.now() + 1).toString();
    setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "正在生成代码...", isLoading: true }]);

    try {
      const res = await client.api.fetch(`/api/projects/${numProjectId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage.content }),
      });

      if (!res.ok) {
        setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: "代码生成失败", isLoading: false } : m));
        setIsStreaming(false);
        return;
      }

      const data = await res.json();
      setMessages((prev) =>
        prev.map((m) => m.id === assistantId ? { ...m, content: data.content || "代码已生成，查看右侧面板", isLoading: false } : m)
      );
      setInput("");

      // Refresh execution steps
      queryClient.invalidateQueries({ queryKey: ["executionSteps", numProjectId] });
    } catch {
      setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: "代码生成失败，请重试", isLoading: false } : m));
    } finally {
      setIsStreaming(false);
    }
  }, [input, isStreaming, numProjectId, queryClient]);

  if (authLoading || pageLoading) return <div className="p-8 text-neutral-500">加载中...</div>;
  if (!user) { navigate("/login"); return null; }
  if (!project || !numProjectId) return null;

  return (
    <div className="h-screen flex flex-col">
      <TopNav user={user} />
      <WorkspaceLayout
        left={
          <div className="h-full flex flex-col overflow-hidden">
            <ProjectConfigBar
              projectId={project.id}
              projectName={project.name}
              onNameChange={(name) => setProject((prev) => prev ? { ...prev, name } : null)}
            />
            <ChatMessages messages={messages} />
            <ExecutionLogPanel projectId={numProjectId} />
            <ChatInput
              value={input}
              onChange={setInput}
              onSubmit={handleSubmit}
              onGenerate={handleGenerate}
              isLoading={isStreaming}
            />
          </div>
        }
        right={<PreviewPanel projectId={numProjectId} />}
      />
    </div>
  );
}
