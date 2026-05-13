import { useRef, useState, useEffect } from "react";
import { client } from "@/lib/edgespark";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (selectedMcps: string[], selectedSkills: string[]) => void;
  onGenerate: (selectedMcps: string[], selectedSkills: string[]) => void;
  isLoading?: boolean;
  model: string;
  onModelChange: (model: string) => void;
  images: string[];
  onImagesChange: (images: string[]) => void;
  isAdmin?: boolean;
}

const allModels = [
  { key: "deepseek", label: "DeepSeek V4", adminOnly: true },
  { key: "seed", label: "Seed 2.0 Code", adminOnly: false },
];

export function ChatInput({ value, onChange, onSubmit, onGenerate, isLoading, model, onModelChange, images, onImagesChange, isAdmin }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const models = allModels.filter(m => !m.adminOnly || isAdmin);

  const [mcpList, setMcpList] = useState<Array<{ id: number; name: string; description: string; enabled: boolean }>>([]);
  const [skillList, setSkillList] = useState<Array<{ id: number; name: string; description: string; enabled: boolean; status: string }>>([]);
  const [showMcpPop, setShowMcpPop] = useState(false);
  const [showSkillPop, setShowSkillPop] = useState(false);
  const [selectedMcps, setSelectedMcps] = useState<string[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);

  useEffect(() => {
    client.api.fetch("/api/mcps").then(r => r.json()).then(setMcpList).catch(() => {});
    client.api.fetch("/api/skills").then(r => r.json()).then(setSkillList).catch(() => {});
  }, []);

  const handleSend = () => {
    if ((!value.trim() && images.length === 0) || isLoading) return;
    onSubmit(selectedMcps, selectedSkills);
  };

  const handleGenerate = () => {
    if (isLoading || !value.trim()) return;
    onGenerate(selectedMcps, selectedSkills);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const newImages: string[] = [];
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (!file) continue;
        const reader = new FileReader();
        reader.onload = () => {
          newImages.push(reader.result as string);
          if (newImages.length > 0) onImagesChange([...images, ...newImages]);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const toggleMcp = (name: string) => {
    setSelectedMcps(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
  };

  const toggleSkill = (name: string) => {
    setSelectedSkills(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
  };

  return (
    <div className="bg-white border-t border-neutral-200 p-4">
      <div className={`border rounded-lg overflow-hidden transition-colors ${isLoading ? "border-blue-300" : "border-neutral-300"}`}>
        <div className="px-4 py-2 border-b border-neutral-200 bg-neutral-50 flex items-center gap-2">
          <span className="text-neutral-500 text-sm">⚡</span>
          <span className="text-xs text-neutral-500">内置能力</span>
          {isLoading && (
            <span className="text-xs text-blue-500 ml-2 animate-pulse">AI 思考中...</span>
          )}
        </div>

        {images.length > 0 && (
          <div className="px-4 py-2 flex items-center gap-2 flex-wrap border-b border-neutral-100">
            {images.map((img, i) => (
              <div key={i} className="relative group">
                <img src={img} alt="" className="w-12 h-12 rounded object-cover border border-neutral-200" />
                <button onClick={() => onImagesChange(images.filter((_, j) => j !== i))} className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-neutral-600 text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">×</button>
              </div>
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="继续对话，描述你需要的工具修改要求...（可直接粘贴图片）"
          disabled={isLoading}
          className="w-full px-4 py-3 text-sm outline-none resize-none h-20 disabled:bg-neutral-50 disabled:text-neutral-400"
        />
        <div className="px-4 py-2 flex items-center justify-between border-t border-neutral-200 bg-neutral-50">
          <div className="flex items-center gap-4">
            <div className="relative">
              <button onClick={() => { setShowMcpPop(!showMcpPop); setShowSkillPop(false); }} className={`flex items-center gap-1.5 text-xs transition-colors ${selectedMcps.length > 0 ? "text-blue-600 font-medium" : "text-neutral-600 hover:text-blue-600"}`}>
                🧩 MCP {selectedMcps.length > 0 && `(${selectedMcps.length})`}
              </button>
              {showMcpPop && (
                <div className="absolute bottom-full left-0 mb-2 w-56 bg-white border rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                  {mcpList.filter(m => m.enabled !== false).length === 0 ? (
                    <p className="text-xs text-neutral-400 p-3">暂无可用 MCP</p>
                  ) : (
                    mcpList.filter(m => m.enabled !== false).map(m => (
                      <label key={m.id} className="flex items-center gap-2 px-3 py-2 hover:bg-neutral-50 cursor-pointer text-xs">
                        <input type="checkbox" checked={selectedMcps.includes(m.name)} onChange={() => toggleMcp(m.name)} className="rounded" />
                        <div>
                          <div className="text-neutral-700">{m.name}</div>
                          <div className="text-neutral-400 text-[10px]">{m.description}</div>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              )}
            </div>
            <div className="relative">
              <button onClick={() => { setShowSkillPop(!showSkillPop); setShowMcpPop(false); }} className={`flex items-center gap-1.5 text-xs transition-colors ${selectedSkills.length > 0 ? "text-blue-600 font-medium" : "text-neutral-600 hover:text-blue-600"}`}>
                ✨ Skills {selectedSkills.length > 0 && `(${selectedSkills.length})`}
              </button>
              {showSkillPop && (
                <div className="absolute bottom-full left-0 mb-2 w-56 bg-white border rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                  {skillList.filter(s => s.enabled !== false && s.status === "installed").length === 0 ? (
                    <p className="text-xs text-neutral-400 p-3">暂无可用 Skill</p>
                  ) : (
                    skillList.filter(s => s.enabled !== false && s.status === "installed").map(s => (
                      <label key={s.id} className="flex items-center gap-2 px-3 py-2 hover:bg-neutral-50 cursor-pointer text-xs">
                        <input type="checkbox" checked={selectedSkills.includes(s.name)} onChange={() => toggleSkill(s.name)} className="rounded" />
                        <div>
                          <div className="text-neutral-700">{s.name}</div>
                          <div className="text-neutral-400 text-[10px]">{s.description}</div>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              )}
            </div>
            <button onClick={handleGenerate} disabled={isLoading || !value.trim()} className="flex items-center gap-1.5 text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded hover:bg-blue-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">+ 创建工具</button>
          </div>
          <div className="flex items-center gap-2">
            <select value={model} onChange={e => onModelChange(e.target.value)} className="text-xs border border-neutral-200 rounded-md px-2 py-1.5 bg-white text-neutral-500 outline-none focus:border-blue-400 hover:border-neutral-300 transition-colors cursor-pointer appearance-none">
              {models.map(m => (<option key={m.key} value={m.key}>{m.label}</option>))}
            </select>
            <button onClick={handleSend} disabled={(!value.trim() && images.length === 0) || isLoading} className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              {isLoading ? <span className="text-xs">⋯</span> : <span>➤</span>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
