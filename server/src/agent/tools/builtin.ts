export interface ToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export const BUILTIN_TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "读取项目中的文件内容",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "文件路径，如 src/index.html" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "创建或覆盖文件",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "文件路径" },
          content: { type: "string", description: "文件内容" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description: "在文件中搜索并替换指定内容（比完整重写更高效）",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "文件路径" },
          old_string: { type: "string", description: "要替换的原始文本" },
          new_string: { type: "string", description: "替换后的新文本" },
        },
        required: ["path", "old_string", "new_string"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description: "列出项目中的所有文件",
      parameters: {
        type: "object",
        properties: { prefix: { type: "string", description: "可选的路径前缀过滤" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "grep_files",
      description: "在项目文件中搜索匹配的文本模式（正则）",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "要搜索的正则表达式模式" },
          path: { type: "string", description: "可选的文件路径限制" },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "在网络上搜索实时信息",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "搜索关键词" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "smart_market",
      description: "浏览 Smart 工具市场中的已发布工具",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "load_skill",
      description: "加载指定 Skill 的完整内容。当需要使用某个可用但未加载的 Skill 时调用此工具获取详细指令。",
      parameters: {
        type: "object",
        properties: { name: { type: "string", description: "Skill 名称" } },
        required: ["name"],
      },
    },
  },
];

// Tools allowed per phase
const READ_TOOLS = new Set(["read_file", "list_files", "grep_files", "web_search", "smart_market", "load_skill"]);
const WRITE_TOOLS = new Set(["write_file", "edit_file"]);

export function filterToolsForPhase(tools: ToolDef[], phase: string): ToolDef[] {
  if (phase === "brainstorm" || phase === "plan" || phase === "verify") {
    return tools.filter(t => READ_TOOLS.has(t.function.name));
  }
  return tools; // execute phase: all tools
}
