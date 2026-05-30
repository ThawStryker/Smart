/**
 * useSessions — Session list + CRUD
 */
import { useState, useCallback } from "react";

interface WorkSession {
  id: number;
  title: string;
  summary: string;
}

export function useSessions() {
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/work/sessions");
      if (res.ok) setSessions(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  const create = useCallback(async () => {
    const res = await fetch("/api/work/sessions", { method: "POST" });
    if (res.ok) {
      const s = await res.json();
      setSessions((prev) => [s, ...prev]);
      return s as WorkSession;
    }
    return null;
  }, []);

  const rename = useCallback(async (id: number, title: string) => {
    await fetch(`/api/work/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)));
  }, []);

  const remove = useCallback(async (id: number) => {
    await fetch(`/api/work/sessions/${id}`, { method: "DELETE" });
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  return { sessions, loading, load, create, rename, remove };
}
