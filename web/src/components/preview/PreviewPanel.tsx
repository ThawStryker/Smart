import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { MonacoEditor } from "@/components/preview/MonacoEditor";
import { DeployModal, DeployedModal } from "@/components/preview/DeployModal";
import { PublishModal } from "@/components/preview/PublishModal";
import { client } from "@/lib/edgespark";

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
  { key: "code", label: "代码" },
  { key: "preview", label: "预览" },
];

function FullscreenIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M16 3h3a2 2 0 0 1 2 2v3" />
      <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

function stepFromStatus(status: string): number {
  switch (status) {
    case "pending": return 1;
    case "dns_ready": return 2;
    case "verifying": return 3;
    case "active": return 4;
    default: return 0;
  }
}

export function PreviewPanel({ projectId, toolId, generatedFiles = [] }: PreviewPanelProps) {
  const [activeTab, setActiveTab] = useState("code");
  const [selectedFileIdx, setSelectedFileIdx] = useState(0);
  const [previewKey, setPreviewKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const previewPaneRef = useRef<HTMLDivElement>(null);
  const nativeFullscreen = useRef(false);
  const pollRef = useRef<AbortController | null>(null);
  const [isPreviewFullscreen, setIsPreviewFullscreen] = useState(false);

  // Deploy state
  const [showDeploy, setShowDeploy] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [deployMode, setDeployMode] = useState<"deploy" | "deployed">("deploy");
  const [deployDomain, setDeployDomain] = useState("");
  const [deployStep, setDeployStep] = useState(0); // 0=idle, 1-4=steps
  const [deployError, setDeployError] = useState("");
  const [existingDomain, setExistingDomain] = useState("");

  const hasHtml = generatedFiles.some((f) => f.path.endsWith(".html") || f.language === "html");
  const previewUrl = toolId && hasHtml
    ? `/api/public/smart/preview/${projectId}/${toolId}/index.html`
    : null;

  // Check deploy status on mount
  useEffect(() => {
    client.api.fetch(`/api/projects/${projectId}/deploy-status`)
      .then(r => r.json())
      .then(d => {
        if (d.deployed) {
          setExistingDomain(d.domain);
        } else if (d.status === "pending" || d.status === "dns_ready" || d.status === "verifying") {
          // Resume in-progress deployment
          setDeployDomain(d.domain);
          setDeployStep(stepFromStatus(d.status));
          setDeployMode("deploy");
          startPolling(d.domain);
        }
      })
      .catch(() => {});
  }, [projectId]);

  const startPolling = useCallback((domain: string) => {
    if (pollRef.current) pollRef.current.abort();
    const controller = new AbortController();
    pollRef.current = controller;

    const subdomain = domain.replace(".torresx.cn", "");

    (async () => {
      for (let i = 0; i < 150; i++) {
        await new Promise(r => setTimeout(r, 2000));
        if (controller.signal.aborted) return;
        try {
          const res = await client.api.fetch(
            `/api/projects/${projectId}/check-domain?domain=${subdomain}`,
            { signal: controller.signal }
          );
          const data = await res.json();
          const step = stepFromStatus(data.status);
          setDeployStep(step);
          if (step === 4) {
            setExistingDomain(domain);
            return;
          }
        } catch { /* continue polling */ }
      }
      // Timeout
      setDeployError("域名验证超时，请取消后重试");
    })();
  }, [projectId]);

  const deployLockRef = useRef(false);

  const handleDeploy = useCallback(async (subdomain: string) => {
    if (!subdomain) {
      // 错误页点重试：回到填前缀
      deployLockRef.current = false;
      setDeployError("");
      setDeployStep(0);
      setDeployDomain("");
      return;
    }

    if (deployLockRef.current) return;
    deployLockRef.current = true;

    const domainHint = `${subdomain}.torresx.cn`;
    setDeployDomain(domainHint);
    setDeployStep(1);
    setDeployError("");

    try {
      const res = await client.api.fetch(`/api/projects/${projectId}/deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subdomain }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 && data.domain) {
          setDeployDomain(data.domain);
          if (data.error && /already has an active/i.test(data.error)) {
            setDeployStep(4);
            setExistingDomain(data.domain);
            return;
          }
          startPolling(data.domain);
          return;
        }
        setDeployError(data.error || "部署失败");
        deployLockRef.current = false;
        return;
      }

      const domain = data.domain || domainHint;
      setDeployDomain(domain);
      if (data.status === "active") {
        setDeployStep(4);
        setExistingDomain(domain);
        return;
      }
      startPolling(domain);
    } catch (err) {
      setDeployError(err instanceof Error ? err.message : "网络错误");
      deployLockRef.current = false;
    }
  }, [projectId, startPolling]);

  const handleCancel = useCallback(async () => {
    deployLockRef.current = false;
    if (pollRef.current) pollRef.current.abort();

    try {
      await client.api.fetch(`/api/projects/${projectId}/deploy/cancel`, {
        method: "POST",
      });
    } catch {}

    setDeployStep(0);
    setDeployDomain("");
    setDeployError("");
    setShowDeploy(false);
  }, [projectId]);

  const handleMinimize = useCallback(() => {
    setShowDeploy(false);
  }, []);

  const openDeploy = () => {
    if (existingDomain) {
      setDeployMode("deployed");
    } else {
      setDeployMode("deploy");
    }
    setShowDeploy(true);
  };

  useEffect(() => {
    if (generatedFiles.length > 0) {
      setSelectedFileIdx(generatedFiles.length - 1);
      setActiveTab("code");
      setPreviewKey((k) => k + 1);
    }
  }, [generatedFiles.length]);

  useEffect(() => {
    const sync = () => {
      const el = previewPaneRef.current;
      if (document.fullscreenElement === el) {
        nativeFullscreen.current = true;
        setIsPreviewFullscreen(true);
        return;
      }
      if (nativeFullscreen.current) {
        nativeFullscreen.current = false;
        setIsPreviewFullscreen(false);
      }
    };
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  useEffect(() => {
    if (!isPreviewFullscreen || document.fullscreenElement) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsPreviewFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isPreviewFullscreen]);

  const enterPreviewFullscreen = useCallback(async () => {
    const el = previewPaneRef.current;
    if (!el) {
      setIsPreviewFullscreen((v) => !v);
      return;
    }
    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen();
        return;
      }
      if (isPreviewFullscreen && !document.fullscreenElement) {
        setIsPreviewFullscreen(false);
        return;
      }
      await el.requestFullscreen();
      if (document.fullscreenElement === el) {
        nativeFullscreen.current = true;
        setIsPreviewFullscreen(true);
        return;
      }
      setIsPreviewFullscreen(true);
    } catch {
      setIsPreviewFullscreen((v) => !v);
    }
  }, [isPreviewFullscreen]);

  const openPreviewFullscreen = () => {
    if (!previewUrl) return;
    if (activeTab !== "preview") setActiveTab("preview");
    void enterPreviewFullscreen();
  };

  const hasFiles = generatedFiles.length > 0;
  const currentFile = hasFiles
    ? generatedFiles[Math.min(selectedFileIdx, generatedFiles.length - 1)]
    : null;
  const langMap: Record<string, string> = {
    html: "html", css: "css", js: "javascript", ts: "typescript",
    tsx: "typescript", jsx: "javascript", json: "json",
    py: "python", rs: "rust", go: "go", java: "java", sql: "sql",
  };

  const cssFallback = isPreviewFullscreen && typeof document !== "undefined" && !document.fullscreenElement;

  const previewPane = previewUrl ? (
    <div
      ref={previewPaneRef}
      className={cssFallback ? "fixed inset-0 z-[200] bg-white" : "w-full h-full bg-white"}
    >
      {cssFallback && (
        <button
          type="button"
          title="退出全屏"
          aria-label="退出全屏"
          onClick={() => setIsPreviewFullscreen(false)}
          className="absolute top-3 right-3 z-[201] w-8 h-8 rounded-lg bg-black/50 text-white flex items-center justify-center hover:bg-black/70"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}
      <iframe
        key={previewKey}
        ref={iframeRef}
        src={previewUrl}
        style={{
          width: "100%",
          height: "100%",
          border: 0,
        }}
        sandbox="allow-scripts allow-forms allow-same-origin"
        title="Preview"
      />
    </div>
  ) : null;

  const isDeploying = deployStep > 0 && deployStep < 4;
  const deployButtonLabel = existingDomain ? "已部署" : isDeploying ? "部署中..." : "部署";
  const deployButtonStyle = existingDomain
    ? "bg-green-600 text-white rounded px-3 py-1.5 text-sm hover:bg-green-700 transition-colors"
    : isDeploying
    ? "bg-yellow-500 text-white rounded px-3 py-1.5 text-sm animate-pulse"
    : "bg-blue-600 text-white rounded px-3 py-1.5 text-sm hover:bg-blue-700 transition-colors";

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Tab bar + deploy button */}
      <div className="bg-[#faf9f7] border-b border-[#edeae5] px-4 py-2 flex items-center gap-3 shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-1.5 rounded text-sm transition-colors ${
              activeTab === tab.key
                ? "bg-neutral-100 font-medium text-neutral-900 rounded-lg"
                : "text-neutral-600 hover:bg-neutral-100 rounded-lg"
            }`}
          >
            {tab.label}
          </button>
        ))}
        <button
          type="button"
          title="全屏预览"
          aria-label="全屏预览"
          disabled={!previewUrl}
          onClick={openPreviewFullscreen}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <FullscreenIcon />
        </button>
        <div className="flex-1" />
        <span className="text-xs text-neutral-400">
          {hasFiles ? `${generatedFiles.length} 个文件` : ""}
        </span>
        <button onClick={() => setShowPublish(true)} className="bg-green-600 text-white rounded px-3 py-1.5 text-sm hover:bg-green-700 transition-colors">
          发布
        </button>
        <button onClick={openDeploy} className={deployButtonStyle}>
          {deployButtonLabel}
        </button>
      </div>

      {/* Content area */}
      <div
        ref={previewContainerRef}
        className={`flex-1 relative ${activeTab === "code" ? "overflow-hidden" : "overflow-auto"}`}
      >
        {previewUrl && (
          cssFallback
            ? createPortal(previewPane, document.body)
            : (
              <div className={activeTab === "preview" ? "w-full h-full" : "absolute inset-0 invisible pointer-events-none"}>
                {previewPane}
              </div>
            )
        )}
        {activeTab === "preview" && !previewUrl ? (
            <div className="flex items-center justify-center h-full text-neutral-400 text-sm">
              <p>暂无 HTML 文件可预览</p>
            </div>
        ) : activeTab === "code" ? (
          hasFiles ? (
            <div className="flex h-full">
              <div className="w-48 border-r border-[#edeae5] bg-[#faf9f7] overflow-y-auto shrink-0">
                {generatedFiles.map((f, i) => (
                  <div
                    key={i}
                    onClick={() => setSelectedFileIdx(i)}
                    className={`px-3 py-2 text-xs cursor-pointer border-b border-neutral-100 transition-colors ${
                      i === selectedFileIdx
                        ? "bg-amber-50 text-amber-700 font-medium"
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

      {/* Deploy modals */}
      {showDeploy && deployMode === "deploy" && (
        <DeployModal
          deployDomain={deployDomain}
          deployStep={deployStep}
          deployError={deployError}
          onDeploy={handleDeploy}
          onCancel={handleCancel}
          onMinimize={handleMinimize}
          onClose={() => setShowDeploy(false)}
        />
      )}
      {showDeploy && deployMode === "deployed" && (
        <DeployedModal
          domain={existingDomain}
          onClose={() => setShowDeploy(false)}
        />
      )}
      {showPublish && (
        <PublishModal
          projectId={projectId}
          onClose={() => setShowPublish(false)}
        />
      )}
    </div>
  );
}
