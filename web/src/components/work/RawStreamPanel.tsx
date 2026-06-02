import { useState, useRef } from "react";

interface RawStreamPanelProps {
  sessionId: number;
}

export function RawStreamPanel({ sessionId }: RawStreamPanelProps) {
  const [lines, setLines] = useState<string[]>([]);
  const [active, setActive] = useState(false);
  const [input, setInput] = useState("");
  const linesRef = useRef<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const send = async () => {
    if (!input.trim() || active) return;
    const msg = input.trim();
    setInput("");

    const meta = `[${new Date().toLocaleTimeString()}] > ${msg}`;
    linesRef.current = [...linesRef.current, ``, `── ${meta} ──`];
    setLines([...linesRef.current]);
    setActive(true);

    try {
      const res = await fetch("/api/work/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: msg }),
      });

      if (!res.ok) {
        linesRef.current = [...linesRef.current, `HTTP ${res.status}: ${await res.text()}`];
        setLines([...linesRef.current]);
        setActive(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) { setActive(false); return; }

      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const chunk = buf;
        buf = "";
        // 按行分割，逐行显示
        const newLines = chunk.split("\n").filter(Boolean);
        linesRef.current = [...linesRef.current, ...newLines];
        setLines([...linesRef.current]);
        // 自动滚到底
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 0);
      }
    } catch (err: any) {
      linesRef.current = [...linesRef.current, `[ERROR] ${err.message}`];
      setLines([...linesRef.current]);
    }

    linesRef.current = [...linesRef.current, `── ${new Date().toLocaleTimeString()} DONE ──`];
    setLines([...linesRef.current]);
    setActive(false);
  };

  return (
    <div className="flex flex-col h-full bg-black text-green-400 font-mono text-[11px] leading-relaxed">
      {/* header */}
      <div className="flex-shrink-0 px-2 py-1 border-b border-green-800 text-green-600 text-[10px] font-bold uppercase tracking-wider">
        ⚡ Engine Raw Stream
      </div>

      {/* raw output */}
      <div className="flex-1 overflow-auto p-2 whitespace-pre-wrap break-all" style={{ scrollbarWidth: "thin" }}>
        {lines.length === 0 && (
          <div className="text-green-700 italic">在下方输入消息开始调试...</div>
        )}
        {lines.map((line, i) => {
          // 高亮 data: 行
          if (line.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(line.slice(6));
              const color = parsed.type === "phase" ? "text-yellow-300" :
                            parsed.type === "delta" ? "text-cyan-300" :
                            parsed.type === "done" ? "text-green-300" :
                            parsed.type === "error" ? "text-red-400" : "text-gray-400";
              return <div key={i} className={color}>{line}</div>;
            } catch {
              return <div key={i} className="text-green-400">{line}</div>;
            }
          }
          if (line.startsWith("──")) {
            return <div key={i} className="text-green-700 mt-1">{line}</div>;
          }
          return <div key={i} className="text-green-500">{line}</div>;
        })}
        <div ref={bottomRef} />
      </div>

      {/* input */}
      <div className="flex-shrink-0 border-t border-green-800 p-1.5 flex gap-1">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder={active ? "streaming..." : "@agent 输入消息..."}
          disabled={active}
          className="flex-1 bg-green-950 border border-green-800 rounded px-2 py-1 text-green-300 text-[11px] outline-none placeholder:text-green-700 disabled:opacity-50"
        />
        <button
          onClick={active ? () => {} : send}
          disabled={active || !input.trim()}
          className="px-2 py-1 rounded bg-green-800 text-green-300 text-[10px] font-bold disabled:opacity-30 hover:bg-green-700 transition-colors"
        >
          {active ? "⋯" : "→"}
        </button>
      </div>
    </div>
  );
}

export default RawStreamPanel;
