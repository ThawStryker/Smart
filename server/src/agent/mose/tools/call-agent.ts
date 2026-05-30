import type { MoseLoopParams } from "../types";

export async function callAgent(
  args: Record<string, unknown>,
  params: MoseLoopParams,
  eventQueue: Array<Record<string, unknown>>,
  moseLoop: (params: MoseLoopParams) => Promise<string>,
): Promise<string> {
  const agentName = args.name as string | undefined;
  const task = args.task as string | undefined;
  if (!agentName || !task) return "Error: name and task required";
  const isSelfCall = agentName === params.targetAgent;
  const result = await moseLoop({ ...params, userMessage: task, targetAgent: agentName, suppressAgentCard: isSelfCall });
  return result;
}
