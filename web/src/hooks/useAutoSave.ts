import { useCallback, useEffect, useRef } from "react";

export function useAutoSave(options: {
  getContent: () => string;
  getFilePath: () => string | null;
  onSave: (path: string, content: string) => void;
}) {
  const lastSavedRef = useRef("");
  const onSaveRef = useRef(options.onSave);
  onSaveRef.current = options.onSave;

  const doSave = useCallback(() => {
    const fp = options.getFilePath();
    if (!fp) return;
    const content = options.getContent();
    if (content !== lastSavedRef.current) {
      lastSavedRef.current = content;
      onSaveRef.current(fp, content);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handler = () => doSave();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [doSave]);

  return { doSave, lastSavedRef };
}
