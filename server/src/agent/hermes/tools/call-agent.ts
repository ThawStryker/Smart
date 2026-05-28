import type { HermesLoopParams } from "../types";

export async function callAgent(
  args: Record<string, unknown>,
  params: HermesLoopParams,
  eventQueue: Array<Record<string, unknown>>,
  hermesLoop: (params: HermesLoopParams) => Promise<string>,
): Promise<string> {
  const agentName = args.name as string | undefined;
  const task = args.task as string | undefined;
  if (!agentName || !task) return "Error: name and task required";
  const isSelfCall = agentName === params.targetAgent;
  const result = await hermesLoop({ ...params, userMessage: task, targetAgent: agentName, suppressAgentCard: isSelfCall });
  return result;
}
