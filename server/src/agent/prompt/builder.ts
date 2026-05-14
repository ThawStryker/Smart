import type { Phase } from "../workflow";
import { SYSTEM_PROMPT } from "./system";
import { getPhasePrompt } from "./phases";

export function buildSystemMessage(
  phase: Phase,
  memoryCtx: string,
  skillCtx: string,
  mcpCtx: string,
): { role: string; content: string } {
  let content = SYSTEM_PROMPT;
  content += getPhasePrompt(phase);
  if (memoryCtx) content += memoryCtx;
  if (skillCtx) content += skillCtx;
  if (mcpCtx) content += mcpCtx;
  content += `
## 输出格式
- 用简洁的段落解释
- 用列表展示步骤和选项
- 用代码块展示代码和命令
- 表格谨慎使用，在 Web 上可以正常渲染`;
  return { role: "system", content };
}
