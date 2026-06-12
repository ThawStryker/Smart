import { register } from "./registry";

// confirm_task — 强制检查任务信息是否充足
// 当用户布置任务时，模型调用此工具确认必要信息。
// 工具返回需要确认的字段列表，模型据此向用户提问。
register({
  name: "confirm_task",
  description: "确认任务信息是否充足。在执行任务前调用，返回需要向用户确认的信息。如果信息已充足则返回 OK。",
  parameters: {
    type: "object",
    properties: {
      task_description: {
        type: "string",
        description: "对用户任务的理解和描述",
      },
      required_info: {
        type: "array",
        items: { type: "string" },
        description: "完成此任务需要但用户未提供的信息列表",
      },
      ready: {
        type: "boolean",
        description: "信息是否充足，true 表示可以开始执行",
      },
    },
    required: ["task_description", "ready"],
  },
  phase: "text",
  meta: (args) => ({ task: args.task_description }),
  handler: async (args) => {
    const ready = args.ready as boolean;
    const task = args.task_description as string;
    const missing = (args.required_info as string[]) || [];

    if (ready) {
      return `Task confirmed: ${task}. All required information is available. Proceed with execution.`;
    }

    if (missing.length > 0) {
      return `Task: ${task}\n\nMissing information that must be confirmed with the user:\n${missing.map((m) => `- ${m}`).join("\n")}\n\nPlease ask the user for this information before proceeding.`;
    }

    return `Task: ${task}. Some information may be missing. Please clarify with the user.`;
  },
});
