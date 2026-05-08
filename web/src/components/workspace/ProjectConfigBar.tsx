import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { client } from "@/lib/edgespark";

interface ProjectConfigBarProps {
  projectId: number;
  projectName: string;
  onNameChange: (newName: string) => void;
}

export function ProjectConfigBar({ projectId, projectName, onNameChange }: ProjectConfigBarProps) {
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(projectName);
  const navigate = useNavigate();

  const handleSave = async () => {
    if (!nameDraft.trim()) return;
    await client.api.fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nameDraft.trim() }),
    });
    onNameChange(nameDraft.trim());
    setEditing(false);
  };

  return (
    <div className="bg-white border-b border-neutral-200 px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate("/dashboard")}
          className="text-neutral-400 hover:text-blue-600 transition-colors mr-2"
          title="返回项目列表"
        >
          ← 返回
        </button>
        <span className="text-neutral-400 text-lg">⚡</span>
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            {editing ? (
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={handleSave}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                  if (e.key === "Escape") setEditing(false);
                }}
                className="font-medium border border-blue-300 rounded px-2 py-0.5 text-sm outline-none focus:border-blue-500"
              />
            ) : (
              <h1
                className="font-medium cursor-pointer hover:text-blue-600 transition-colors"
                onClick={() => { setNameDraft(projectName); setEditing(true); }}
              >
                {projectName}
              </h1>
            )}
            <button
              onClick={() => { setNameDraft(projectName); setEditing(true); }}
              className="text-neutral-400 hover:text-blue-600 transition-colors"
            >
              ✏️
            </button>
          </div>
          <div className="text-xs text-neutral-500 mt-0.5">
            创建于 {new Date().toLocaleDateString("zh-CN")}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {["预览", "文件", "收藏", "协作", "删除"].map((label) => (
          <button
            key={label}
            className={`px-3 py-1.5 rounded text-sm transition-colors ${
              label === "删除"
                ? "text-red-500 hover:bg-red-50"
                : "text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
