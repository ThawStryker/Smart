import { useState, useRef, useCallback, useEffect } from "react";
import { client } from "@/lib/edgespark";

interface DeployModalProps {
  projectId: number;
  htmlContent: string;
  files?: Array<{ path: string; content: string }>;
  onClose: () => void;
}

export function DeployModal({
  projectId,
  htmlContent,
  files,
  onClose,
}: DeployModalProps) {
  const [subdomain, setSubdomain] = useState("");
  const [status, setStatus] = useState<
    "idle" | "deploying" | "done" | "error"
  >("idle");
  const [deployUrl, setDeployUrl] = useState("");
  const [error, setError] = useState("");

  const baseDomain = "torresx.cn";

  const abortRef = useRef<AbortController | null>(null);

  // Cancel deploy on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const handleCancel = () => {
    if (abortRef.current) abortRef.current.abort();
    setStatus("idle");
  };

  const handleDeploy = useCallback(async () => {
    if (!subdomain.trim()) return;
    setStatus("deploying");
    setError("");

    // Clean up any previous abort controller
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Cleanup on unmount
    const isMounted = { current: true };

    try {
      const res = await client.api.fetch(`/api/projects/${projectId}/deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subdomain: subdomain.trim(),
          html: htmlContent,
          files: files || [],
        }),
        signal: controller.signal,
      });

      if (!isMounted.current) return;

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Deploy failed");
        setStatus("error");
        return;
      }
      setDeployUrl(data.url);

      // Poll until domain is active (up to 5 minutes)
      const domain = subdomain.trim();
      for (let i = 0; i < 150; i++) {
        if (!isMounted.current) return;
        await new Promise(r => setTimeout(r, 2000));
        try {
          const checkRes = await client.api.fetch(`/api/projects/${projectId}/check-domain?domain=${domain}`, { signal: controller.signal });
          const checkData = await checkRes.json();
          if (checkData.status === "active") {
            setStatus("done");
            return;
          }
        } catch { /* poll error, continue */ }
      }
      setError("域名验证超时，请刷新页面后重试部署");
      setStatus("error");
    } catch (err) {
      if (!isMounted.current) return;
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Network error");
      setStatus("error");
    }
  }, [subdomain, projectId, htmlContent]);

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-medium mb-4">部署工具</h2>

        {status === "idle" && (
          <>
            <label className="block text-sm text-neutral-600 mb-2">
              输入域名前缀
            </label>
            <div className="flex items-center gap-0 mb-4">
              <input
                autoFocus
                value={subdomain}
                onChange={(e) =>
                  setSubdomain(e.target.value.replace(/[^a-z0-9-]/g, ""))
                }
                onKeyDown={(e) => e.key === "Enter" && handleDeploy()}
                placeholder="例如 todo"
                className="flex-1 px-3 py-2 border border-neutral-300 rounded-l text-sm outline-none focus:border-blue-500"
              />
              <span className="px-3 py-2 bg-neutral-50 border border-l-0 border-neutral-300 rounded-r text-sm text-neutral-500">
                .{baseDomain}
              </span>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-neutral-500 hover:bg-neutral-100 rounded"
              >
                取消
              </button>
              <button
                onClick={handleDeploy}
                disabled={!subdomain.trim()}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40"
              >
                部署
              </button>
            </div>
          </>
        )}

        {status === "deploying" && (
          <div className="text-center py-8">
            <div className="text-sm text-neutral-600">
              {subdomain}.{baseDomain} 部署中
            </div>
            <div className="text-xs text-neutral-400 mt-2">
              DNS + SSL 证书签发最多需要 5 分钟，请耐心等待
            </div>
            <button
              onClick={handleCancel}
              className="mt-4 px-4 py-2 text-sm text-neutral-500 hover:bg-neutral-100 rounded"
            >
              取消
            </button>
          </div>
        )}

        {status === "done" && (
          <div className="text-center py-4">
            <div className="text-green-600 text-sm mb-2">部署成功</div>
            <a
              href={deployUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 text-sm hover:underline break-all"
            >
              {deployUrl}
            </a>
            <div className="mt-4">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                完成
              </button>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="text-center py-4">
            <div className="text-red-500 text-sm mb-2">部署失败</div>
            <div className="text-xs text-neutral-500 mb-4">{error}</div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-neutral-500 hover:bg-neutral-100 rounded"
              >
                取消
              </button>
              <button
                onClick={() => setStatus("idle")}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                重试
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
