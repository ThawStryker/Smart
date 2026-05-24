# Hermes 多智能体文档协作系统

**Date:** 2026-05-24
**Status:** Draft

## Goal

在 Smart 项目中新增 Work 页面，实现 Hermes 多智能体协作系统。用户通过 @mention 召唤子 Agent 完成文档写作，Agent 每次调用无状态，上下文由 Hermes 注入，产出流式写入 Milkdown 编辑器并自动保存。

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Work Page                                          │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Agent    │  │  Document    │  │  Chat        │  │
│  │ 列表     │  │  Editor      │  │  Panel       │  │
│  │ + 工作区 │  │  (Milkdown   │  │  (@mention)  │  │
│  │ 文件树   │  │   流式+自存)  │  │              │  │
│  └──────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────┘
                         │
         ┌───────────────┴───────────────┐
         │  Hermes (上下文管理器)         │
         │  - 维护对话历史                │
         │  - 维护工作区文件索引           │
         │  - 解析 @mention 分发任务       │
         │  - 组装上下文注入 Agent         │
         │  - 模型: seed-2.0-lite         │
         └───────────────┬───────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
   ┌──────────┐   ┌──────────┐   ┌──────────┐
   │ Agent A  │   │ Agent B  │   │ Agent C  │
   │ (无状态) │   │ (无状态) │   │ (无状态) │
   │ 模型:pro │   │ 模型:pro │   │ 模型:pro │
   └──────────┘   └──────────┘   └──────────┘
         │               │               │
         └───────────────┴───────────────┘
                         │
              ┌──────────┴──────────┐
              │  共享文件工作区      │
              │  (每个 Work 一个)   │
              └─────────────────────┘
```

**核心原则：**
- Hermes 是唯一有状态的，维护完整对话历史和工作区快照
- Agent 每次调用无状态：被 @ 时 Hermes 注入上下文，运行 Loop 产出结果后销毁会话
- 上下文注入 = 对话摘要 + 相关文件内容 + 用户消息 + Agent 文件目录
- 产出回写：Agent 产出的文档写回工作区，Hermes 更新摘要和索引

**模型分配：**
- Hermes 自身：`seed-2.0-lite` — 只做路由、摘要、上下文组装
- 子 Agent：默认 `seed-2.0-pro` — 写文档、用工具、推理。Agent 可在 AGENTS.md 中覆盖

## Agent 文件目录结构

```
agents/
  <agent-name>/
    AGENTS.md              # 系统提示词 / 角色定义（必需）
    memory/                # 记忆目录（可多个文件）
      <memory-a>.md
      <memory-b>.md
    skills/                # 技能目录
      <skill-a>/           # 每个技能是独立文件夹
        SKILL.md           # 技能定义（必需）
        script.py          # 脚本（可选）
        data.json          # 数据文件（可选）
        ...
      <skill-b>/
        SKILL.md
        ...
    context/               # 参考上下文
      <doc>.md             # 任何参考材料
    heartbeat.md           # 最后运行状态（系统自动维护）
```

**设计要点：**
- 全部 Markdown 文件，可在 Milkdown 编辑器中直接打开编辑
- AGENTS.md 是 Agent 运行时第一个加载的文件
- memory/ 为文件夹，支持按主题拆分为多个记忆文件
- skills/ 下每个技能是独立文件夹，SKILL.md 为入口，可附带脚本、数据等资源
- context/ 是用户主动放入的参考资料，Agent 执行时作为背景知识
- heartbeat.md 系统自动维护，记录最后运行状态，非用户编辑

**运行时加载优先级：**
```
AGENTS.md → memory/* → skills/*/SKILL.md → context/* → 当前对话上下文
```

## 上下文注入机制

当用户 @Agent 时，Hermes 组装以下上下文包：

1. **当前工作任务描述** — 用户在会话开始时设定的任务目标
2. **对话摘要** — 从完整对话历史中提取的关键信息
3. **用户当前消息** — 去掉 @mention 标记后的纯文本
4. **Agent 文件目录** — AGENTS.md + memory/*.md + skills/*/SKILL.md + context/*.md
5. **相关工作区文件** — Hermes 根据任务自动判断需加载的文件
6. **可委托 Agent 列表** — 该 Agent 有权调用的其他 Agent 白名单

**Agent 产出：**
- 文档 → 流式写入工作区指定文件
- 对话回复 → 流式显示在聊天面板中，说明思路和过程

**对话摘要策略：**
- Hermes 维护完整对话历史，每次 Agent 调用结束后生成摘要
- 摘要融入 Hermes 长期上下文，避免上下文膨胀
- 同一 Work Session 内所有 Agent 调用的摘要共享

## 聊天 & @mention 协议

```
用户输入: "@架构师 帮我设计一下系统架构"
              │
              ▼
    ┌─────────────────────┐
    │ Hermes 解析消息      │
    │ - 识别 @架构师       │
    │ - 提取纯文本         │
    └──────┬──────────────┘
           │
           ▼
    ┌─────────────────────┐
    │ 组装上下文包          │
    └──────┬──────────────┘
           │
           ▼
    ┌─────────────────────┐
    │ Agent Loop 运行       │
    │ - 流式输出到聊天      │
    │ - 流式写文档          │
    │ - 可使用工具          │
    └──────┬──────────────┘
           │
           ▼
    ┌─────────────────────┐
    │ 结束后回写            │
    │ - 更新对话摘要        │
    │ - 更新文件索引        │
    └─────────────────────┘
```

**@mention 规则：**
- `@agent名` 出现在消息任意位置即触发
- 一条消息可 @ 多个 Agent，Hermes 依次调用
- @ 不存在的 Agent 时 Hermes 提示"未找到该角色"
- 无 @mention 时消息为 Hermes 一对一对话模式

**Agent 执行期间交互：**
- Agent 使用工具的过程流式展示在聊天中
- Agent 产出的文档流式显示在编辑器，即时自动保存
- 用户可随时中断 Agent（停止按钮）

## Agent 委托（Agent 调用 Agent）

- Agent A 在执行时可使用 `call_agent` 工具委托 Agent B
- Hermes 同样为 B 注入上下文，B 产出后返回给 A
- A 决定如何整合 B 的结果
- Hermes 追踪调用链，防止循环委托

## 文档流式 + 自动保存

**双路输出：**
- 聊天路：思考过程、工具调用结果 → 聊天面板
- 文档路：文档正文内容 → Milkdown 编辑器，即时渲染

**自动保存：**
- Milkdown 接收到增量内容后实时渲染
- 同时触发自动保存到工作区文件存储
- 保存间隔：每次内容块到达时立即保存

**文档状态指示：**
- 正在编写中：编辑器顶部显示"Agent 正在编辑..."
- 写完后：标记为已保存，可审阅

## 工具系统

### 基础工具

| 工具 | 说明 |
|------|------|
| `read_file` | 读取工作区文件 |
| `write_file` | 写入/覆盖工作区文件 |
| `edit_file` | 精确替换文件片段 |
| `list_files` | 列出工作区目录 |
| `grep_files` | 搜索文件内容 |
| `web_search` | 网络搜索 |

### 特殊工具

| 工具 | 说明 |
|------|------|
| `call_agent` | 委托另一个 Agent 执行子任务（受白名单限制） |
| `load_skill` | 从 Agent 自己的 `skills/` 目录加载技能 |

### 工具来源

- Agent 本地 skills/ — Agent 自带技能，通过 `load_skill` 加载
- 全局 MCP — 和现有 Smart Agent 共用 MCP 工具注册表

## 数据模型

### work_sessions

| 字段 | 类型 | 说明 |
|------|------|------|
| id | text (PK) | UUID |
| userId | text | 用户 ID |
| title | text | 会话标题 |
| summary | text (JSON) | 对话摘要，每次 Agent 调用后更新 |
| createdAt | integer | 创建时间戳 |
| updatedAt | integer | 更新时间戳 |

### work_files

统一存储 Agent 配置和产出文档。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | text (PK) | UUID |
| sessionId | text (FK) | 所属会话 |
| path | text | 文件路径（agents/... 或 workspace/...） |
| content | text | 文件内容 |
| isFolder | integer | 是否文件夹 |
| createdAt | integer | 创建时间戳 |
| updatedAt | integer | 更新时间戳 |

Unique index: `(sessionId, path)`

### work_messages

| 字段 | 类型 | 说明 |
|------|------|------|
| id | text (PK) | UUID |
| sessionId | text (FK) | 所属会话 |
| agentName | text (nullable) | null = Hermes 或用户，非 null = 特定 Agent |
| role | text | user / assistant / tool |
| content | text | 消息内容 |
| createdAt | integer | 创建时间戳 |

## 前端组件

### WorkPage

三栏布局：

- **左栏（Agent + 工作区）**：Agent 列表（创建/编辑/删除角色）+ 工作区文件树（浏览、打开文档）
- **中栏（文档编辑器）**：Milkdown Crepe 编辑器，100% 完整功能，从 GitHub 拉源码集成。支持流式内容接收和即时渲染
- **右栏（聊天面板）**：消息列表 + @mention 输入框，展示 Hermes 对话和 Agent 执行过程

### ChatPanel

- 消息列表渲染：用户消息、Hermes 回复、Agent 执行卡片
- @mention 输入：支持自动补全 Agent 名称
- SSE 事件流：text、tool_start、tool_exec、tool_result、agent_done

### AgentPanel

- Agent 列表展示
- 创建/编辑 Agent 对话框：名称、系统提示词（写入 AGENTS.md）
- 点击 Agent 展开文件树（memory/skills/context/heartbeat）
- 右键菜单：新建文件/文件夹、删除、重命名

### DocumentEditor

- 100% Milkdown Crepe 集成
- 接收 SSE 文档流事件，增量追加内容
- 自动保存到工作区存储
- 编辑状态指示

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/work/chat | Hermes 聊天 + @mention 编排 |
| GET | /api/work/sessions | 列出工作会话 |
| POST | /api/work/sessions | 创建工作会话 |
| DELETE | /api/work/sessions/:id | 删除工作会话 |
| GET | /api/work/files/:sessionId?prefix= | 列出文件 |
| GET | /api/work/files/:sessionId/* | 读取文件 |
| PUT | /api/work/files/:sessionId/* | 写入/更新文件 |
| DELETE | /api/work/files/:sessionId/* | 删除文件 |
| GET | /api/work/messages/:sessionId | 获取消息列表 |

## SSE 事件

| 事件 | 数据 | 说明 |
|------|------|------|
| text | { delta, agentName } | 聊天文本增量（agentName=null 为 Hermes） |
| doc | { path, delta } | 文档增量内容 |
| tool_start | { toolName, agentName } | 工具开始执行 |
| tool_exec | { toolName, args, agentName } | 工具调用详情 |
| tool_result | { toolName, result, agentName } | 工具执行结果 |
| agent_start | { agentName } | Agent 开始执行 |
| agent_done | { agentName, outputFiles } | Agent 执行完成 |
| error | { message, agentName } | 错误 |
| done | {} | 整个请求结束 |

## 模型配置

| 角色 | 模型 | 说明 |
|------|------|------|
| Hermes | seed-2.0-lite | 仅路由+摘要+上下文组装，轻量低成本 |
| 子 Agent | seed-2.0-pro（默认） | 文档写作+工具使用+推理，可覆盖 |
