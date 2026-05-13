import { useRef } from "react";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onGenerate: () => void;
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
  const models = allModels.filter(m => !m.adminOnly || isAdmin);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    if ((!value.trim() && images.length === 0) || isLoading) return;
    onSubmit();
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
          if (newImages.length > 0) {
            onImagesChange([...images, ...newImages]);
          }
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const removeImage = (idx: number) => {
    onImagesChange(images.filter((_, i) => i !== idx));
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
                <button
                  onClick={() => removeImage(i)}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-neutral-600 text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ×
                </button>
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
            {["附件", "MCP", "Skills"].map((label) => (
              <button
                key={label}
                className="flex items-center gap-1.5 text-xs text-neutral-600 hover:text-blue-600 transition-colors"
              >
                {label === "附件" && "📎"}
                {label === "MCP" && "🧩"}
                {label === "Skills" && "✨"}
                {label}
              </button>
            ))}
            <button
              onClick={onGenerate}
              disabled={isLoading || !value.trim()}
              className="flex items-center gap-1.5 text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded hover:bg-blue-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              + 创建工具
            </button>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={model}
              onChange={e => onModelChange(e.target.value)}
              className="text-xs border border-neutral-200 rounded-md px-2 py-1.5 bg-white text-neutral-500 outline-none focus:border-blue-400 hover:border-neutral-300 transition-colors cursor-pointer appearance-none"
            >
              {models.map(m => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
            <button
              onClick={handleSend}
              disabled={(!value.trim() && images.length === 0) || isLoading}
              className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
            {isLoading ? (
              <span className="text-xs">⋯</span>
            ) : (
              <span>➤</span>
            )}
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}
