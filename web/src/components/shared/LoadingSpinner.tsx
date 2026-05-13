export function LoadingSpinner({ text = "加载中..." }: { text?: string }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
      <div className="text-center">
        <div className="animate-spin w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-3" />
        <p className="text-sm text-neutral-400">{text}</p>
      </div>
    </div>
  );
}
