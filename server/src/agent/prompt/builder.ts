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
## 斜杠命令

用户可能通过斜杠命令直接调用特定功能。当你收到以 / 开头的消息时，按以下含义执行：

- /brainstorming — 启动需求分析，了解项目现状，提出方案，不要写代码
- /writing-plans — 编写详细的 Markdown 实施计划，不要写代码
- /subagent-driven — 按已有计划分步执行实施
- /test-driven — 先写测试，再写实现代码
- /debugging — 系统化分析问题原因，定位 bug
- /code-review — 审查当前项目的代码，给出改进建议
- /verification — 验证所有修改是否正确，报告结果
- /deploy — 部署当前项目到生产环境
- /market — 浏览工具市场
- /web-search — 搜索实时信息
- /list-files — 列出项目文件
- /read-file — 读取指定文件
- /<skill-name> — 调用对应名称的 Skill

收到命令后直接按含义执行，不要再询问用户。

## 输出格式
- 用简洁的段落解释
- 用列表展示步骤和选项
- 用代码块展示代码和命令
- 表格谨慎使用，在 Web 上可以正常渲染`;
  return { role: "system", content };
}
