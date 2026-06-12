import { register } from "./registry";
import type { ToolContext } from "./registry";

// call_agent 的实际执行在 engine.ts 中通过递归 run() 处理，
// 这里注册一个占位 handler 让 registry 知道这个工具存在。
register({
  name: "call_agent",
  description: "Delegate a subtask to another agent",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "Agent name" },
      task: { type: "string", description: "Task description" },
    },
    required: ["name", "task"],
  },
  phase: "agent_start",
  meta: (args) => ({ agentName: args.name as string }),
  handler: async (_args, _ctx) => {
    // 由 engine.ts 拦截处理，不应走到这里
    return "call_agent handled by engine";
  },
});
