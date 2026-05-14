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
    <div className="bg-card border-b border-[#edeae5] px-6 py-3.5 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate("/dashboard")}
          className="text-tertiary hover:text-[#f59e0b] transition-colors text-sm"
          title="返回项目列表"
        >
          ← 返回
        </button>
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-sm font-bold shadow-sm">
          {projectName.charAt(0).toUpperCase()}
        </div>
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
                className="font-semibold text-[15px] input-field px-2 py-0.5"
              />
            ) : (
              <h1
                className="font-semibold text-[15px] cursor-pointer hover:text-[#f59e0b] transition-colors"
                onClick={() => { setNameDraft(projectName); setEditing(true); }}
              >
                {projectName}
              </h1>
            )}
            <button
              onClick={() => { setNameDraft(projectName); setEditing(true); }}
              className="text-tertiary hover:text-[#f59e0b] transition-colors text-xs"
            >
              ✏️
            </button>
          </div>
          <div className="text-xs text-tertiary mt-0.5">
            创建于 {new Date().toLocaleDateString("zh-CN")}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button className="px-3 py-1.5 rounded-lg text-sm text-secondary hover:bg-[#f5f0e8] transition-colors">
          协作
        </button>
      </div>
    </div>
  );
}
