import { writeAgentFile } from "../tools/call-agent";

export async function extractWorkMemories(
  userId: string,
  agentName: string,
  userMessage: string,
  agentResponse: string,
) {
  // Extract explicit "记住" commands
  const rm = userMessage.match(/记住[：:]\s*(.+?)(?:[。.]|$)/);
  if (rm) {
    await writeAgentFile(userId, agentName, "System/memory/用户要求.md", rm[1]);
  }

  // Extract preferences from agent response
  const pm = agentResponse.match(/偏好[：:]\s*(.+)/);
  if (pm) {
    await writeAgentFile(userId, agentName, "System/memory/偏好记录.md", pm[1]);
  }

  // Update heartbeat
  const heartbeat = `## ${new Date().toISOString()}\n\n用户消息: ${userMessage.slice(0, 200)}\n响应摘要: ${agentResponse.slice(0, 300)}`;
  await writeAgentFile(userId, agentName, "System/heartbeat/latest.md", heartbeat);
}
