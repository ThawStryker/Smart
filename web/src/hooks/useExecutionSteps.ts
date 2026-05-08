import { useQuery } from "@tanstack/react-query";
import { client } from "@/lib/edgespark";

interface ExecutionStep {
  id: number;
  toolId: number;
  stepOrder: number;
  type: string;
  status: string;
  title: string | null;
  detail: string | null;
  terminalOutput: string | null;
  startedAt: string | null;
  completedAt: string | null;
  metadata: string | null;
}

export function useExecutionSteps(projectId: number | undefined) {
  const { data: steps = [], isLoading, error } = useQuery({
    queryKey: ["executionSteps", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await client.api.fetch(`/api/projects/${projectId}/steps`);
      if (!res.ok) return [];
      return (await res.json()) as ExecutionStep[];
    },
    enabled: !!projectId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data || data.length === 0) return false;
      const hasRunning = data.some((s) => s.status === "running");
      return hasRunning ? 2000 : false;
    },
  });

  return { steps, isLoading, error };
}
