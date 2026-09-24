/**
 * useAgents — Agent list management
 */
import { useState, useCallback } from "react";
import type { WorkAgent } from "@/types/work";
import { getAgentAvatar } from "@/components/work/icons";

export function useAgents() {
  const [agents, setAgents] = useState<WorkAgent[]>([]);

  const load = useCallback(async () => {
    const res = await fetch("/api/agents");
    if (res.ok) {
      const data: Array<{ name: string; avatar?: string | null }> = await res.json();
      setAgents(data.map((a) => ({
        name: a.name,
        avatar: a.avatar || getAgentAvatar(a.name),
      })));
    }
  }, []);

  return { agents, load };
}
