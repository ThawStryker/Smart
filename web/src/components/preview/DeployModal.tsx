import { useState } from "react";

const steps = [
  { key: "db", label: "数据上传" },
  { key: "dns", label: "DNS 解析" },
  { key: "verify", label: "正在验证" },
  { key: "done", label: "部署完成" },
];

interface DeployModalProps {
  deployDomain: string;
  deployStep: number;
  deployError: string;
  onDeploy: (subdomain: string) => void;
  onCancel: () => void;
  onMinimize: () => void;
  onClose: () => void;
}

export function DeployModal({
  deployDomain,
  deployStep,
  deployError,
  onDeploy,
  onCancel,
  onMinimize,
  onClose,
}: DeployModalProps) {
  const [subdomain, setSubdomain] = useState("");

  const isDeploying = deployStep > 0 && deployStep < 4;
  const isDone = deployStep === 4;
  const isError = deployError !== "";
  const isIdle = deployStep === 0 && !isError;

  const handleDeploy = () => {
    if (!subdomain.trim()) return;
    onDeploy(subdomain.trim());
  };

  const handleCancel = () => {
    onCancel();
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xl p-6">
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">部署工具</h2>

        {isIdle && (
          <>
            <label className="block text-sm text-neutral-600 mb-2 font-medium">
              输入域名前缀
            </label>
            <div className="flex items-center gap-0 mb-4">
              <input
                autoFocus
                value={subdomain}
                onChange={(e) => setSubdomain(e.target.value.replace(/[^a-z0-9-]/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && handleDeploy()}
                placeholder="例如 todo"
                className="flex-1 px-3 py-2 border border-neutral-200 rounded-l-lg text-sm outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-100"
              />
              <span className="px-3 py-2 bg-neutral-50 border border-l-0 border-neutral-200 rounded-r-lg text-sm text-neutral-500">
                .torresx.cn
              </span>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm bg-neutral-100 text-neutral-600 rounded-lg hover:bg-neutral-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleDeploy}
                disabled={!subdomain.trim()}
                className="px-4 py-2 text-sm bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg font-medium shadow-sm hover:shadow-md hover:shadow-amber-100 transition-all disabled:opacity-40"
              >
                部署
              </button>
            </div>
          </>
        )}

        {isDeploying && (
          <div className="py-2">
            <div className="text-sm text-neutral-700 mb-4">
              {deployDomain} 部署中
            </div>

            <div className="flex items-center gap-1">
              {steps.map((step, i) => {
                const active = i + 1 === deployStep;
                const done = i + 1 < deployStep;

                return (
                  <div key={step.key} className="flex items-center gap-1">
                    {i > 0 && (
                      <span className={`w-4 h-px ${i < deployStep ? "bg-green-400" : "bg-neutral-200"}`} />
                    )}
                    <span className="flex items-center gap-1">
                      {done ? (
                        <span className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center text-white text-[10px]">✓</span>
                      ) : active ? (
                        <span className="w-4 h-4 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
                      ) : (
                        <span className="w-4 h-4 rounded-full border-2 border-neutral-200" />
                      )}
                      <span className={`text-xs whitespace-nowrap ${done ? "text-green-600" : active ? "text-amber-600 font-medium" : "text-neutral-300"}`}>
                        {step.label}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="text-xs text-neutral-400 mt-4">
              {deployStep === 1 && "等待域名注册和 DNS 解析..."}
              {deployStep === 2 && "DNS 记录已添加，即将开始验证..."}
              {deployStep === 3 && "正在验证域名，最多 5 分钟..."}
            </div>

            <div className="flex gap-3 justify-end mt-5">
              <button
                onClick={onMinimize}
                className="px-4 py-2 text-sm bg-neutral-100 text-neutral-600 rounded-lg hover:bg-neutral-200 transition-colors"
              >
                最小化
              </button>
              <button
                onClick={handleCancel}
                className="px-4 py-2 text-sm text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              >
                取消部署
              </button>
            </div>
          </div>
        )}

        {isDone && (
          <div className="text-center py-4">
            <div className="text-green-600 text-sm mb-2">部署成功</div>
            <a
              href={`https://${deployDomain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-600 text-sm hover:underline break-all"
            >
              https://{deployDomain}
            </a>
            <div className="mt-4">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg font-medium shadow-sm hover:shadow-md hover:shadow-amber-100 transition-all"
              >
                完成
              </button>
            </div>
          </div>
        )}

        {isError && (
          <div className="text-center py-4">
            <div className="text-red-500 text-sm mb-2">部署失败</div>
            <div className="text-xs text-neutral-500 mb-4">{deployError}</div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm bg-neutral-100 text-neutral-600 rounded-lg hover:bg-neutral-200 transition-colors"
              >
                关闭
              </button>
              <button
                onClick={() => {
                  setSubdomain("");
                  onDeploy("");
                }}
                className="px-4 py-2 text-sm bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg font-medium shadow-sm hover:shadow-md hover:shadow-amber-100 transition-all"
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

// Success-only modal for already-deployed projects
export function DeployedModal({
  domain,
  onClose,
}: {
  domain: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">已部署</h2>
        <a
          href={`https://${domain}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-amber-600 text-sm hover:underline break-all"
        >
          https://{domain}
        </a>
        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg font-medium shadow-sm hover:shadow-md hover:shadow-amber-100 transition-all"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
