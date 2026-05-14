# 内置能力集成 + 斜杠命令 + Superpowers 分级流程

## 概述

将 smart-deploy MCP 和 superpowers Skill 从用户可见列表中隐藏，集成为 Smart Agent 内置能力。同时增加斜杠命令系统和支持 Superpowers 分级研发流程。

## 一、隐藏内置 MCP/Skill

- MCP 和 Skill 表各加 `hidden` 列（boolean，默认 false）
- `hidden=true` 的记录：前端市场页、聊天选择弹窗均不展示，但 API 对 Agent 可见
- `smart-deploy`：创建为 `hidden=true, visibility=global` 的 MCP 记录，config 定义 deploy 工具
- `superpowers`：创建为 `hidden=true, visibility=global` 的 Skill 记录，SKILL.md 包含完整工作流指令

## 二、smart-deploy 工具化

- vibe.ts 中删除硬编码 `smart_deploy` case（switch 中的字符串返回）
- 改为从 MCP config 动态注册为工具，走统一 MCP 工具调用流程
- deploy 工具被调用时返回前端部署指令，触发 DeployModal 展示

## 三、Superpowers 分级策略

写入 System Prompt，Agent 接到任务后先评估复杂度并声明流程：

| 任务等级 | 判断标准 | 启用流程 |
|---------|---------|---------|
| 轻量 | 样式微调、文案修改、单行 fix | 直接实施 → verify |
| 中等 | Bug 修复、小功能追加 | 简化分析 → implement → verify → finish |
| 重量 | 新功能、架构改动、跨文件重构 | brainstorming → plan → subagent → verify → review → finish |

## 四、斜杠命令系统

### SKILL.md 命令声明
每个 Skill 的 SKILL.md 中用 `### Commands` 区域声明命令：
```markdown
### Commands
- `/brainstorming` — 需求分析和方案设计
- `/writing-plans` — 编写实施计划
```

### 服务端
- 新增 `GET /api/skills/commands`：读取所有 enabled+installed Skill 的 SKILL.md，解析 `### Commands` 区域，返回 `[{ skillName, skillId, commands: [{ name, description }] }]`

### 前端 ChatInput
- 用户按 `/` 触发命令面板弹出
- 面板列出所有可用命令（按 skill 分组）
- 支持输入过滤（`/brai` → 过滤出 `/brainstorming`）
- 点击或回车选中 → 填入输入框
- Escape 关闭面板

## 五、改动清单

| 层 | 文件 | 改动 |
|---|------|------|
| DB | 新迁移 | MCP + Skill 表加 `hidden` 列 |
| API | skills.ts | 新增 `GET /api/skills/commands` |
| API | mcps.ts, skills.ts | GET 列表过滤 `hidden=true` 记录 |
| Agent | vibe.ts | 删硬编码 smart_deploy case；System Prompt 增加分级策略 |
| 前端 | ChatInput.tsx | 斜杠命令弹窗 |
| 前端 | SkillsPage/McpsPage | 已有 UI 不展示 hidden 记录（API 层已过滤） |
| 管理 | AdminPage.tsx | 创建全局 Skill/MCP 时可设 hidden |
