import { emit } from "../../stream";
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
  emit(eventQueue, { type: "agent_start", agentName });
  const result = await hermesLoop({ ...params, userMessage: task, targetAgent: agentName });
  emit(eventQueue, { type: "agent_done", agentName });
  return result;
}
