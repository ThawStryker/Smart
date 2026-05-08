import { useEffect, useState, useCallback, useRef } from "react";
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
  const [project, setProject] = useState<ProjectData | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

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

    // Add placeholder for streaming response
    const assistantId = (Date.now() + 1).toString();
    setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "", isLoading: true }]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await client.api.fetch(`/api/projects/${numProjectId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage.content }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: "AI 请求失败", isLoading: false } : m));
        setIsStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;
        setMessages((prev) =>
          prev.map((m) => m.id === assistantId ? { ...m, content: fullText, isLoading: true } : m)
        );
      }

      setMessages((prev) =>
        prev.map((m) => m.id === assistantId ? { ...m, isLoading: false } : m)
      );
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: "请求失败，请重试", isLoading: false } : m));
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [input, isStreaming, numProjectId]);

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
              isLoading={isStreaming}
            />
          </div>
        }
        right={<PreviewPanel projectId={numProjectId} />}
      />
    </div>
  );
}
