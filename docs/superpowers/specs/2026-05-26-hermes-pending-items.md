# Hermes 待完成事项记录

**Date:** 2026-05-26

## 1. Agent 目录结构定义（已确定）

```
agents/<name>/
  AGENTS.md              — 角色定义 + 约束（系统提示词补充）
  memory/
    USER.md              — 用户固定偏好 + 文档索引（删除按钮置灰）
    MEMORY.md            — Agent 自驱成长记忆（删除按钮置灰）
  skills/                — 用户手动定义的技能（摘要列表，按需加载）
  context/               — 常驻背景知识（全量加载）
  heartbeat/
    HEARTBEAT.md         — 定时任务配置（cron 格式）
```

### 加载策略

| 文件 | 加载方式 | 说明 |
|------|---------|------|
| AGENTS.md | 全量 | 身份定义 |
| context/*.md | 全量 | 背景知识 |
| memory/USER.md | 全量 | 用户偏好 + 文档索引 |
| memory/MEMORY.md | 全量 | Agent 成长日志 |
| USER.md 引用的文档 | 按需 read_file | 用户手动维护引用 |
| skills/*/SKILL.md | 摘要列表，按需 read_file | 按触发条件匹配 |
| heartbeat/HEARTBEAT.md | 定时读取 | 调度引擎读取 |

## 2. 对话回复的表现方式（待实现）

用户期望的聊天回复格式：

```
[@教研 帮我写一份关于xxx的教学逐字稿]

[图标]Thinking...
[图标]Agent - [头像]教研
[图标]Read: xxxxxxxxxxx.md
[图标]Skill: xxxxxxxxxxxxxxx
[图标]Writing: xxxxxxxxxxx.md

逐字稿写好了：xxxxxxxxxxxx.md
教学思路 / 设计点 / 可修改建议
```

**实现方式：** 前端 SSE 事件渲染升级（已有 tool_exec、agent_start、doc 事件，需加 thinking 事件）

## 3. Heartbeat 调度引擎（待实现）

- `heartbeat/HEARTBEAT.md` 已定义配置格式（cron + 任务描述）
- 调度引擎尚未实现——需要后台服务定时读取配置并触发 Agent 执行
- 实现时考虑：Cloudflare Workers Cron Triggers 或 Edgespark 内置调度
