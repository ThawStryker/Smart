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

interface Command {
  name: string;
  description: string;
  skillName: string;
}

export function ChatInput({ value, onChange, onSubmit, onGenerate, isLoading, model, onModelChange, images, onImagesChange, isAdmin }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const commandsRef = useRef<HTMLDivElement>(null);
  const models = allModels.filter(m => !m.adminOnly || isAdmin);

  const [mcpList, setMcpList] = useState<Array<{ id: number; name: string; description: string; enabled: boolean }>>([]);
  const [skillList, setSkillList] = useState<Array<{ id: number; name: string; description: string; enabled: boolean; status: string }>>([]);
  const [showMcpPop, setShowMcpPop] = useState(false);
  const [showSkillPop, setShowSkillPop] = useState(false);
  const [selectedMcps, setSelectedMcps] = useState<string[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);

  const [commands, setCommands] = useState<Array<{ skillName: string; skillId: number; commands: Array<{ name: string; description: string }> }>>([]);
  const [showCommands, setShowCommands] = useState(false);
  const [commandFilter, setCommandFilter] = useState("");
  const [commandIndex, setCommandIndex] = useState(0);

  useEffect(() => {
    client.api.fetch("/api/mcps").then(r => r.json()).then(setMcpList).catch(() => {});
    client.api.fetch("/api/skills").then(r => r.json()).then(setSkillList).catch(() => {});
  }, []);

  useEffect(() => {
    const url = selectedSkills.length > 0
      ? `/api/skills/commands?skills=${selectedSkills.join(",")}`
      : "/api/skills/commands";
    client.api.fetch(url).then(r => r.json()).then(data => {
      if (Array.isArray(data)) setCommands(data);
    }).catch(() => {});
  }, [selectedSkills]);

  const allCommands: Command[] = commands.flatMap(c =>
    c.commands.map(cmd => ({ name: cmd.name, description: cmd.description, skillName: c.skillName }))
  );
  const filteredCommands = commandFilter
    ? allCommands.filter(c => c.name.toLowerCase().includes(commandFilter.toLowerCase()))
    : allCommands;

  useEffect(() => {
    if (showCommands && commandsRef.current) {
      const selected = commandsRef.current.children[commandIndex] as HTMLElement;
      if (selected) selected.scrollIntoView({ block: "nearest" });
    }
  }, [commandIndex, showCommands]);

  const handleSend = () => {
    if ((!value.trim() && images.length === 0) || isLoading) return;
    onSubmit(selectedMcps, selectedSkills);
  };

  const handleGenerate = () => {
    if (isLoading || !value.trim()) return;
    onGenerate(selectedMcps, selectedSkills);
  };

  const handleSlashSelect = (cmdName: string) => {
    const beforeSlash = value.slice(0, value.lastIndexOf("/"));
    onChange(beforeSlash + cmdName + " ");
    setShowCommands(false);
    setCommandFilter("");
    setCommandIndex(0);
    textareaRef.current?.focus();
  };

  const handleInputChange = (newValue: string) => {
    onChange(newValue);
    const cursorPos = newValue.length;
    const textBeforeCursor = newValue.slice(0, cursorPos);
    const lastSlashIdx = textBeforeCursor.lastIndexOf("/");
    if (lastSlashIdx !== -1) {
      const afterSlash = textBeforeCursor.slice(lastSlashIdx + 1);
      if (!afterSlash.includes(" ")) {
        setShowCommands(true);
        setCommandFilter(afterSlash);
        setCommandIndex(0);
        return;
      }
    }
    setShowCommands(false);
    setCommandFilter("");
  };

  const handleCommandKeyDown = (e: React.KeyboardEvent) => {
    if (!showCommands || filteredCommands.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCommandIndex(prev => Math.min(prev + 1, filteredCommands.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCommandIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      handleSlashSelect(filteredCommands[commandIndex].name);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setShowCommands(false);
      setCommandFilter("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showCommands && filteredCommands.length > 0) {
      handleCommandKeyDown(e);
      return;
    }
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
      <div className={`border rounded-lg relative transition-colors ${isLoading ? "border-amber-300" : "border-neutral-200"}`}>
        <div className="px-4 py-2 border-b border-neutral-200 bg-neutral-50 flex items-center gap-2">
          <span className="text-neutral-500 text-sm">⚡</span>
          <span className="text-xs text-neutral-500">内置能力</span>
          {isLoading && (
            <span className="text-xs text-amber-500 ml-2 animate-pulse">AI 思考中...</span>
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
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="继续对话，描述你需要的工具修改要求...（可直接粘贴图片，输入 / 使用斜杠命令）"
          disabled={isLoading}
          className="w-full px-4 py-3 text-sm outline-none resize-none h-20 disabled:bg-neutral-50 disabled:text-neutral-400"
        />

        {showCommands && (
          <div ref={commandsRef} className="absolute left-0 bottom-full mb-1 w-[26rem] bg-white border border-neutral-200 rounded-xl shadow-xl z-[100] max-h-52 overflow-y-auto">
            {allCommands.length === 0 ? (
              <p className="text-xs text-neutral-400 p-3">加载中...</p>
            ) : filteredCommands.length === 0 ? (
              <p className="text-xs text-neutral-400 p-3">无匹配命令</p>
            ) : (
              filteredCommands.map((cmd, i) => (
                <button
                  key={cmd.name}
                  onClick={() => handleSlashSelect(cmd.name)}
                  className={`w-full text-left px-3 py-2 flex items-center gap-2.5 text-xs hover:bg-neutral-50 transition-colors ${i === commandIndex ? "bg-amber-50" : ""}`}
                >
                  <span className="text-amber-600 font-mono font-medium shrink-0">{cmd.name}</span>
                  <span className="text-neutral-400 flex-1 truncate">{cmd.description}</span>
                  <span className="text-neutral-300 text-[10px] shrink-0">{cmd.skillName}</span>
                </button>
              ))
            )}
          </div>
        )}

        <div className="px-4 py-2 flex items-center justify-between border-t border-neutral-200 bg-neutral-50">
          <div className="flex items-center gap-4">
            <div className="relative">
              <button onClick={() => { setShowMcpPop(!showMcpPop); setShowSkillPop(false); }} className={`flex items-center gap-1.5 text-xs transition-colors ${selectedMcps.length > 0 ? "text-amber-600 font-medium" : "text-neutral-600 hover:text-amber-600"}`}>
                🧩 MCP {selectedMcps.length > 0 && `(${selectedMcps.length})`}
              </button>
              {showMcpPop && (
                <div className="absolute bottom-full left-0 mb-2 w-64 bg-white border border-neutral-200 rounded-xl shadow-xl z-[100] max-h-72 overflow-y-auto">
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
              <button onClick={() => { setShowSkillPop(!showSkillPop); setShowMcpPop(false); }} className={`flex items-center gap-1.5 text-xs transition-colors ${selectedSkills.length > 0 ? "text-amber-600 font-medium" : "text-neutral-600 hover:text-amber-600"}`}>
                ✨ Skills {selectedSkills.length > 0 && `(${selectedSkills.length})`}
              </button>
              {showSkillPop && (
                <div className="absolute bottom-full left-0 mb-2 w-64 bg-white border border-neutral-200 rounded-xl shadow-xl z-[100] max-h-72 overflow-y-auto">
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
            <button onClick={handleGenerate} disabled={isLoading || !value.trim()} className="flex items-center gap-1.5 text-xs bg-amber-50 text-amber-600 px-3 py-1 rounded-lg hover:bg-amber-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">+ 创建工具</button>
          </div>
          <div className="flex items-center gap-2">
            <select value={model} onChange={e => onModelChange(e.target.value)} className="text-xs border border-neutral-200 rounded-lg px-2 py-1.5 bg-white text-neutral-500 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-100 hover:border-neutral-300 transition-colors cursor-pointer appearance-none">
              {models.map(m => (<option key={m.key} value={m.key}>{m.label}</option>))}
            </select>
            <button onClick={handleSend} disabled={(!value.trim() && images.length === 0) || isLoading} className="w-8 h-8 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-sm hover:shadow-md hover:shadow-amber-100 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
              {isLoading ? <span className="text-xs">⋯</span> : <span>➤</span>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
