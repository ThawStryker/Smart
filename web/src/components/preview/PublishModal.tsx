import { useState, useEffect } from "react";
import { client } from "@/lib/edgespark";

interface PublishModalProps {
  projectId: number;
  onClose: () => void;
}

type Status = "loading" | "not_deployed" | "idle" | "submitting" | "pending_review" | "approved" | "rejected" | "error";

export function PublishModal({ projectId, onClose }: PublishModalProps) {
  const [status, setStatus] = useState<Status>("loading");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState("");
  // Check deploy and publish status
  useEffect(() => {
    Promise.all([
      client.api.fetch(`/api/projects/${projectId}/deploy-status`).then(r => r.json()),
      client.api.fetch(`/api/projects/${projectId}/publish-status`).then(r => r.json()),
    ]).then(([deploy, publish]: any[]) => {
      if (!deploy.deployed) { setStatus("not_deployed"); return; }
      if (publish.published) {
        setTitle(publish.title || "");
        if (publish.status === "pending_review") setStatus("pending_review");
        else if (publish.status === "approved") setStatus("approved");
        else if (publish.status === "rejected") setStatus("rejected");
        else setStatus("idle");
      } else {
        setStatus("idle");
      }
    }).catch(() => setStatus("idle"));
  }, [projectId]);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setStatus("submitting");
    try {
      const res = await client.api.fetch(`/api/projects/${projectId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), description: desc, category }),
      });
      if (res.ok) {
        setStatus("pending_review");
      } else {
        const data = await res.json();
        setError(data.error || "发布失败");
        setStatus("error");
      }
    } catch {
      setError("网络错误");
      setStatus("error");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-medium mb-4">发布工具</h2>

        {status === "loading" && (
          <p className="text-sm text-neutral-400">检查发布状态...</p>
        )}

        {status === "not_deployed" && (
          <div className="text-center py-4">
            <div className="text-amber-600 text-sm mb-2">请先部署项目</div>
            <p className="text-xs text-neutral-400">项目需要先完成部署才能发布到市场</p>
            <button onClick={onClose} className="mt-4 px-4 py-2 text-sm bg-blue-600 text-white rounded">知道了</button>
          </div>
        )}

        {status === "idle" && (
          <>
            <label className="block text-sm text-neutral-600 mb-2">工具名称</label>
            <input
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="给你的工具起个名字"
              className="w-full px-3 py-2 border border-neutral-300 rounded text-sm mb-3 outline-none focus:border-blue-500"
            />
            <label className="block text-sm text-neutral-600 mb-2">描述</label>
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="简单描述工具的功能"
              rows={3}
              className="w-full px-3 py-2 border border-neutral-300 rounded text-sm mb-3 outline-none focus:border-blue-500 resize-none"
            />
            <label className="block text-sm text-neutral-600 mb-2">分类</label>
            <input
              value={category}
              onChange={e => setCategory(e.target.value)}
              placeholder="如：游戏、工具、教育"
              className="w-full px-3 py-2 border border-neutral-300 rounded text-sm mb-4 outline-none focus:border-blue-500"
            />
            <div className="flex gap-3 justify-end">
              <button onClick={onClose} className="px-4 py-2 text-sm text-neutral-500 hover:bg-neutral-100 rounded">取消</button>
              <button onClick={handleSubmit} disabled={!title.trim()} className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40">提交审核</button>
            </div>
          </>
        )}

        {status === "submitting" && (
          <p className="text-sm text-neutral-500 text-center py-4">提交中...</p>
        )}

        {status === "pending_review" && (
          <div className="text-center py-4">
            <div className="text-amber-600 text-sm mb-2">审核中</div>
            <p className="text-xs text-neutral-400">你的工具已提交审核，通过后将出现在工具市场中</p>
            <button onClick={onClose} className="mt-4 px-4 py-2 text-sm bg-blue-600 text-white rounded">知道了</button>
          </div>
        )}

        {status === "approved" && (
          <div className="text-center py-4">
            <div className="text-green-600 text-sm mb-2">已发布</div>
            <p className="text-xs text-neutral-400">你的工具已经在市场中上线</p>
            <button onClick={onClose} className="mt-4 px-4 py-2 text-sm bg-blue-600 text-white rounded">完成</button>
          </div>
        )}

        {status === "rejected" && (
          <div className="text-center py-4">
            <div className="text-red-500 text-sm mb-2">审核未通过</div>
            <p className="text-xs text-neutral-400 mb-4">请修改后重新提交</p>
            <button onClick={() => setStatus("idle")} className="px-4 py-2 text-sm bg-blue-600 text-white rounded">重新提交</button>
          </div>
        )}

        {status === "error" && (
          <div className="text-center py-4">
            <div className="text-red-500 text-sm mb-2">发布失败</div>
            <p className="text-xs text-neutral-500 mb-4">{error}</p>
            <div className="flex gap-3 justify-center">
              <button onClick={onClose} className="px-4 py-2 text-sm text-neutral-500 rounded">关闭</button>
              <button onClick={() => setStatus("idle")} className="px-4 py-2 text-sm bg-blue-600 text-white rounded">重试</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
