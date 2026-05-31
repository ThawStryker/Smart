import { useState, useCallback } from "react";

interface ConfirmOptions {
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

interface ConfirmState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

/**
 * useConfirm — 用 UI 弹窗替代浏览器 confirm()
 *
 * 用法:
 *   const { confirm, ConfirmDialog } = useConfirm();
 *   if (await confirm("确定删除？")) { ... }
 *   // 在 JSX 中渲染 <ConfirmDialog />
 */
export function useConfirm() {
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = useCallback((message: string, opts?: Partial<ConfirmOptions>) => {
    return new Promise<boolean>((resolve) => {
      setState({
        message,
        confirmText: opts?.confirmText || "确定",
        cancelText: opts?.cancelText || "取消",
        danger: opts?.danger ?? true,
        resolve,
      });
    });
  }, []);

  const handleConfirm = () => {
    state?.resolve(true);
    setState(null);
  };

  const handleCancel = () => {
    state?.resolve(false);
    setState(null);
  };

  const Dialog = state ? (
    <>
      <div className="fixed inset-0 z-50 bg-black/30" onClick={handleCancel} />
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="rounded-2xl shadow-2xl border p-5 w-72 max-w-[85vw] bg-[var(--app-surface)] border-[var(--app-border)]" onClick={(e) => e.stopPropagation()}>
          <p className="text-sm text-[var(--app-text)] mb-5 leading-relaxed">{state.message}</p>
          <div className="flex gap-2">
            <button onClick={handleCancel}
              className="flex-1 h-9 rounded-xl text-xs font-medium border bg-[var(--app-bg)] text-[var(--app-text-secondary)] border-[var(--app-border)] hover:bg-[var(--app-accent-bg)] transition-colors">
              {state.cancelText}
            </button>
            <button onClick={handleConfirm}
              className="flex-1 h-9 rounded-xl text-xs font-bold transition-all hover:scale-[1.02]"
              style={{ background: state.danger ? "#ef4444" : "linear-gradient(135deg, var(--app-accent), var(--app-accent-deep))", color: "#fff" }}>
              {state.confirmText}
            </button>
          </div>
        </div>
      </div>
    </>
  ) : null;

  return { confirm, ConfirmDialog: Dialog };
}
