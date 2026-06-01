// 工具统一入口 — 从各模块导入以触发 register()，从 registry 导出定义
import "./file-ops";
import "./web-search";
import "./call-agent";
import "./memory";
import "./skill-tools";

export { register, get, getAll, getOpenAITools, execute } from "./registry";
export type { ToolDef, ToolContext } from "./registry";
