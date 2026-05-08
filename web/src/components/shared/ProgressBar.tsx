interface ProgressBarProps {
  progress: number; // 0-100
  showLabel?: boolean;
}

export function ProgressBar({ progress, showLabel = true }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, progress));
  return (
    <div>
      {showLabel && (
        <div className="text-xs text-neutral-500 mb-2 flex justify-between">
          <span>生成进度</span>
          <span>{clamped}%</span>
        </div>
      )}
      <div className="w-full h-2 bg-neutral-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-green-500 transition-all duration-500 ease-out rounded-full"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
