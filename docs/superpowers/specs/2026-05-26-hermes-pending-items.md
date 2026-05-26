# Hermes 待完成事项记录

**Date:** 2026-05-26

## 1. Agent 目录结构定义（待讨论）

```
agents/<name>/
  AGENTS.md         — 角色定义：我是谁，我的职责是什么
  memory/           — Agent 自动写入的经验记忆
  skills/           — 用户手动定义的技能（每个技能一个文件夹，SKILL.md 为入口）
  context/          — 用户手动放入的参考资料
  heartbeat.md      — 系统自动维护的运行状态
```

**已确定的：**
- `context/` — 用户手动放，不变，Agent 按需 `read_file` 读取（P0 已实现按需加载）
- `memory/` — Agent 自动写入，记录从任务中学到的经验
- `skills/` — 保持用户手动定义，不做自主创建（放弃了 P1）

**待讨论：**
- `context/` 内的文档是否需要 Agent 执行前预索引（文件名+标题摘要列表，供 LLM 判断相关性）
- `memory/` 的读写策略细节：何时写？写什么格式？写多少？

## 2. 对话回复的表现方式（最终目标）

用户期望的聊天回复格式：

```
[@教研 帮我写一份关于xxx的教学逐字稿]

[图标]Thinking...
> 好的，我来帮你完成一份 xxx 的教学逐字稿。

[图标]Agent - [头像]教研

[图标]Read: xxxxxxxxxxx.md
[图标]Skill: xxxxxxxxxxxxxxx
[图标]Thinking...
[图标]Writing: xxxxxxxxxxx.md

逐字稿写好了：xxxxxxxxxxxx.md
教学思路：1.  2.  3.
设计点：教学目标参考了.....
如果你的学员是....可以告诉我，我可以做xxx样的修改。
```

**核心需求：**
- 每个步骤有独立图标（Thinking / Read / Skill / Writing）
- Agent 名称和头像可见
- 工具调用结果以卡片形式展示
- 最终输出包含：正文 + 思路 + 设计点 + 可修改建议

**实现方式：** 前端 SSE 事件渲染升级（已有 `tool_exec`、`agent_start`、`doc` 事件，需加 `thinking` 事件）
