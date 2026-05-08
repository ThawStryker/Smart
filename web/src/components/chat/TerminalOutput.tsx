import { useEffect, useRef } from "react";

interface TerminalOutputProps {
  lines: string[];
  isRunning?: boolean;
  maxHeight?: string;
}

export function TerminalOutput({ lines, isRunning, maxHeight = "h-48" }: TerminalOutputProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines]);

  return (
    <div
      ref={containerRef}
      className={`bg-black/90 text-green-400 text-xs font-mono p-3 rounded overflow-y-auto ${maxHeight}`}
    >
      {lines.length === 0 && isRunning && (
        <div>
          <span className="animate-pulse">▋</span>
        </div>
      )}
      {lines.map((line, i) => (
        <div key={i} className="leading-relaxed">
          {line || " "}
        </div>
      ))}
      {isRunning && lines.length > 0 && (
        <span className="animate-pulse">▋</span>
      )}
    </div>
  );
}
