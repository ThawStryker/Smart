import { useEffect, useState, useCallback, useRef } from "react";
import { TopNav } from "@/components/layout/TopNav";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { ProjectConfigBar } from "@/components/workspace/ProjectConfigBar";
import { ChatMessages, type ChatMessage } from "@/components/chat/ChatMessages";
import { ChatInput } from "@/components/chat/ChatInput";
import { PreviewPanel } from "@/components/preview/PreviewPanel";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate, useParams } from "react-router-dom";

interface ProjectData {
  id: number;
  name: string;
  description: string | null;
  status: string;
}

interface SSEEvent {
  type: "text" | "step" | "file" | "done" | "error";
  content?: string;
  status?: string;
  title?: string;
  detail?: string;
  path?: string;
  language?: string;
  files?: string[];
}

interface StoredFile {
  path: string;
  language: string;
  content: string;
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
  const [generatedFiles, setGeneratedFiles] = useState<StoredFile[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const numProjectId = projectId ? parseInt(projectId, 10) : undefined;

  // Load project data + restore history on mount
  useEffect(() => {
    if (!numProjectId) return;

    const loadAll = async () => {
      try {
        // Load project info
        const projRes = await fetch(`/api/projects/${numProjectId}`, { credentials: "include" });
        if (!projRes.ok) { navigate("/404"); return; }
        setProject((await projRes.json()) as ProjectData);

        // Load conversation history
        const convRes = await fetch(`/api/projects/${numProjectId}/conversations`, { credentials: "include" });
        if (convRes.ok) {
          const convData = await convRes.json() as Array<{ role: string; content: string; id?: number }>;
          setMessages(convData.map((c, i) => ({
            id: `hist-${c.id || i}`,
            role: c.role as ChatMessage["role"],
            content: c.content,
          })));

          // Parse code blocks from assistant messages to restore files
          const codeBlockRegex = /```(\w+)?:?(\S+)?\n([\s\S]*?)```/g;
          const restoredFiles: StoredFile[] = [];
          const seen = new Set<string>();
          for (const c of convData) {
            if (c.role !== "assistant") continue;
            let match;
            while ((match = codeBlockRegex.exec(c.content)) !== null) {
              const path = match[2] || `code.${match[1] || "txt"}`;
              if (seen.has(path)) continue;
              seen.add(path);
              restoredFiles.push({
                path,
                language: match[1] || "text",
                content: match[3],
              });
            }
          }
          if (restoredFiles.length > 0) setGeneratedFiles(restoredFiles);
        }
      } catch { /* keep defaults */ }
      setPageLoading(false);
    };

    loadAll();
  }, [numProjectId, navigate]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isStreaming || !numProjectId) return;

    const userMessage: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: input.trim(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsStreaming(true);

    const assistantId = `a-${Date.now()}`;
    setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "", isLoading: true }]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`/api/projects/${numProjectId}/vibe`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage.content }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: `错误: ${res.status}`, isLoading: false } : m));
        setIsStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const dataStr = line.slice(6).trim();
          if (!dataStr) continue;
          try {
            const event: SSEEvent = JSON.parse(dataStr);
            switch (event.type) {
              case "text":
                fullText += event.content || "";
                setMessages((prev) =>
                  prev.map((m) => m.id === assistantId ? { ...m, content: fullText, isLoading: true } : m)
                );
                break;
              case "file":
                setGeneratedFiles((prev) => {
                  // Replace if same path, otherwise add
                  const existing = prev.findIndex((f) => f.path === event.path);
                  const newFile = { path: event.path || "", language: event.language || "", content: event.content || "" };
                  if (existing >= 0) {
                    const copy = [...prev];
                    copy[existing] = newFile;
                    return copy;
                  }
                  return [...prev, newFile];
                });
                break;
              case "step":
                if (event.title) {
                  setMessages((prev) => [
                    ...prev,
                    { id: `step-${Date.now()}-${Math.random()}`, role: "system", content: `${event.status === "running" ? "🔄" : "✅"} ${event.title}` },
                  ]);
                }
                break;
              case "error":
                setMessages((prev) =>
                  prev.map((m) => m.id === assistantId ? { ...m, content: `错误: ${event.content}`, isLoading: false } : m)
                );
                break;
              case "done":
                setMessages((prev) =>
                  prev.map((m) => m.id === assistantId ? { ...m, isLoading: false } : m)
                );
                break;
            }
          } catch { /* skip */ }
        }
      }

      setMessages((prev) =>
        prev.map((m) => m.id === assistantId ? { ...m, isLoading: false } : m)
      );
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: `网络错误`, isLoading: false } : m));
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
            <ChatInput
              value={input}
              onChange={setInput}
              onSubmit={handleSend}
              onGenerate={handleSend}
              isLoading={isStreaming}
            />
          </div>
        }
        right={<PreviewPanel projectId={numProjectId} generatedFiles={generatedFiles} />}
      />
    </div>
  );
}
