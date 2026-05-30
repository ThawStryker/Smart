/**
 * useAgents — Agent list management
 */
import { useState, useCallback } from "react";

export function useAgents() {
  const [agents, setAgents] = useState<string[]>([]);

  const load = useCallback(async () => {
    const res = await fetch("/api/agents");
    if (res.ok) {
      const data: Array<{ name: string }> = await res.json();
      setAgents(data.map((a) => a.name));
    }
  }, []);

  return { agents, load };
}
