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

interface ProjectData {
  id: number;
  name: string;
  description: string | null;
  status: string;
}

interface SSEEvent {
  type: "text" | "step" | "file" | "done" | "error" | "tool_start" | "tool_exec" | "tool_result";
  content?: string;
  status?: string;
  title?: string;
  detail?: string;
  path?: string;
  language?: string;
  files?: string[];
  toolCallId?: string;
  name?: string;
  input?: string;
  output?: string;
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
  const [leftTab, setLeftTab] = useState<"chat" | "log">("chat");
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

        // Restore files from R2 overview API (independent of conversation history)
        let filesRestored = false;
        try {
          const overviewRes = await fetch(`/api/projects/${numProjectId}/overview`, { credentials: "include" });
          console.log("[loadAll] overview status:", overviewRes.status);
          if (overviewRes.ok) {
            const overview = await overviewRes.json() as Array<{ toolId: number; toolName: string; files: Array<{ path: string; language: string }> }>;
            console.log("[loadAll] overview data:", JSON.stringify(overview));
            const restoredFiles: StoredFile[] = [];
            for (const tool of overview) {
              if (!tool.files || tool.files.length === 0) {
                console.log(`[loadAll] tool ${tool.toolId} has no files`);
                continue;
              }
              console.log(`[loadAll] tool ${tool.toolId} has ${tool.files.length} files`);
              for (const f of tool.files.slice(0, 20 - restoredFiles.length)) {
                try {
                  const fileRes = await fetch(
                    `/api/projects/${numProjectId}/tools/${tool.toolId}/files/${encodeURIComponent(f.path)}`,
                    { credentials: "include" }
                  );
                  if (fileRes.ok) {
                    const data = await fileRes.json() as { path: string; language: string; content: string };
                    restoredFiles.push({ path: data.path, language: data.language, content: data.content });
                  } else {
                    console.warn("[loadAll] file fetch failed:", f.path, fileRes.status);
                  }
                } catch (e) { console.warn("[loadAll] file fetch error:", f.path, e); }
              }
              if (restoredFiles.length >= 20) break;
            }
            if (restoredFiles.length > 0) {
              setGeneratedFiles(restoredFiles);
              filesRestored = true;
            }
          }
        } catch { /* R2 overview unavailable, fallback to code blocks */ }

        // Load conversation history
        const convRes = await fetch(`/api/projects/${numProjectId}/conversations`, { credentials: "include" });
        if (convRes.ok) {
          const convData = await convRes.json() as Array<{ role: string; content: string; id?: number }>;
          setMessages(convData.map((c, i) => ({
            id: `hist-${c.id || i}`,
            role: c.role as ChatMessage["role"],
            content: c.content,
          })));

          if (!filesRestored) {
            console.log("[loadAll] R2 overview did not restore files, trying code block fallback");
            // Fallback: parse code blocks from conversation history
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
                restoredFiles.push({ path, language: match[1] || "text", content: match[3] });
              }
            }
            if (restoredFiles.length > 0) setGeneratedFiles(restoredFiles);
          }
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
              case "tool_start":
                if (event.name) {
                  setMessages((prev) => [
                    ...prev,
                    { id: `tool-${event.toolCallId || Date.now()}`, role: "system", content: `🔧 ${event.name}` },
                  ]);
                }
                break;
              case "tool_exec":
                if (event.name) {
                  setMessages((prev) => [
                    ...prev,
                    { id: `exec-${event.toolCallId || Date.now()}`, role: "system", content: `⚙️ 执行: ${event.name}` },
                  ]);
                }
                break;
              case "step":
                // ExecutionLogPanel polls via useExecutionSteps (2s interval when steps are running)
                break;
              case "tool_result":
                if (event.name && event.output) {
                  const outputText = event.output;
                  const short = outputText.length > 100 ? outputText.slice(0, 100) + "..." : outputText;
                  setMessages((prev) => [
                    ...prev,
                    { id: `result-${event.toolCallId || Date.now()}`, role: "system", content: `✅ ${event.name}: ${short}` },
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
            {/* 标签切换栏 */}
            <div className="border-b border-neutral-200 bg-neutral-50 px-4 flex gap-0 shrink-0">
              {[
                { key: "chat", label: "对话" },
                { key: "log", label: "执行日志" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setLeftTab(tab.key as typeof leftTab)}
                  className={`px-4 py-2 text-sm border-b-2 transition-colors ${
                    leftTab === tab.key
                      ? "border-blue-600 text-blue-600 font-medium"
                      : "border-transparent text-neutral-500 hover:text-neutral-700"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {leftTab === "chat" ? (
              <>
                <ChatMessages messages={messages} />
                <ChatInput
                  value={input}
                  onChange={setInput}
                  onSubmit={handleSend}
                  onGenerate={handleSend}
                  isLoading={isStreaming}
                />
              </>
            ) : (
              <div className="flex-1 overflow-y-auto">
                <ExecutionLogPanel projectId={numProjectId} />
              </div>
            )}
          </div>
        }
        right={<PreviewPanel projectId={numProjectId} generatedFiles={generatedFiles} />}
      />
    </div>
  );
}
