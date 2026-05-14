import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { client } from "@/lib/edgespark";

interface ProjectConfigBarProps {
  projectId: number;
  projectName: string;
  iconPath?: string | null;
  onIconChange: (path: string) => void;
  onNameChange: (newName: string) => void;
}

async function cropSquare(image: HTMLImageElement, size = 200): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const min = Math.min(image.width, image.height);
  const sx = (image.width - min) / 2;
  const sy = (image.height - min) / 2;
  ctx.drawImage(image, sx, sy, min, min, 0, 0, size, size);
  return new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));
}

export function ProjectConfigBar({ projectId, projectName, iconPath, onIconChange, onNameChange }: ProjectConfigBarProps) {
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(projectName);
  const fileRef = useRef<HTMLInputElement>(null);
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

  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = async () => {
      const blob = await cropSquare(img);
      const fd = new FormData();
      fd.append("file", blob, "icon.png");
      const res = await client.api.fetch(`/api/projects/${projectId}/icon`, { method: "POST", body: fd });
      const data = await res.json();
      onIconChange(data.url);
    };
  };

  const iconUrl = iconPath || `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect fill="%23f59e0b" width="32" height="32" rx="8"/><text fill="white" font-size="16" font-family="sans-serif" x="50%" y="55%" text-anchor="middle" dominant-baseline="middle">${projectName.charAt(0).toUpperCase()}</text></svg>`)}`;

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
      <div className="flex items-center gap-3">
        <button className="px-3 py-1.5 rounded-lg text-sm text-secondary hover:bg-[#f5f0e8] transition-colors">
          协作
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleIconUpload} />
        <button
          onClick={() => fileRef.current?.click()}
          className="w-9 h-9 rounded-lg overflow-hidden border-2 border-[#edeae5] hover:border-[#f59e0b] transition-colors shrink-0"
          title="修改项目图标"
        >
          <img src={iconUrl} alt="" className="w-full h-full object-cover" />
        </button>
      </div>
    </div>
  );
}
