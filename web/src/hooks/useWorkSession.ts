import { useState, useCallback, useEffect } from "react";
import type { WorkSession } from "@/types/work";

export function useWorkSession() {
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [loading, setLoading] = useState(true);

  const loadSessions = useCallback(async () => {
    const res = await fetch("/api/work/sessions");
    if (res.ok) {
      const data = await res.json();
      setSessions(data);
      return data;
    }
    return [];
  }, []);

  const createSession = useCallback(async () => {
    const res = await fetch("/api/work/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "新对话" }),
    });
    if (res.ok) {
      const s = await res.json();
      setSessions((prev) => [...prev, s]);
      return s;
    }
    return null;
  }, []);

  const renameSession = useCallback(async (id: number, title: string) => {
    await fetch(`/api/work/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)));
  }, []);

  const deleteSession = useCallback(async (id: number) => {
    await fetch(`/api/work/sessions/${id}`, { method: "DELETE" });
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  useEffect(() => {
    loadSessions().then(() => setLoading(false));
  }, [loadSessions]);

  return { sessions, loading, loadSessions, createSession, renameSession, deleteSession };
}
