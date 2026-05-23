# Work-Agent 多智能体协同系统设计 v2

> 更新于 2026-05-24。v2 变更：右侧面板上下结构、工作空间独立路径、Milkdown 100% 全功能。

## 概述

将 Work 页面的 AI 助手升级为多 agent 协同工作系统。用户可以创建/管理多个 agent，通过 `@agent` 语法在对话中调度它们完成任务。所有 agent 以统一的自包含文件结构组织，支持发布到人才市场和从市场导入。

## 架构

### 编排者模式（Orchestrator）

```
用户 → WorkPage 聊天 → work-agent（唯一对话入口）
                          │
              ┌───────────┼───────────┐
              │           │           │
          agent-A     agent-B     agent-C
              │           │           │
              └───────────┼───────────┘
                          │
                    work-agent 汇总
                          │
                    任务卡片 → 用户
```

- work-agent 是唯一和用户对话的主体
- sub-agent 通过 tool calling 调用——work-agent 拥有 `call_agent` 工具
- 每个 sub-agent 从自身文件目录读取 system prompt + context
- sub-agent 产出写入文件树，以任务卡片形式展示给用户

### 对话流

```
用户: @designer 帮我设计一个登录页，@reviewer 审查一下代码

work-agent: (思考) 先让 designer 出设计，然后 reviewer 审查代码...
  │
  ├─ tool_call: call_agent("designer", "设计登录页", ...)
  │     ├─ 读取 agents/designer/AGENTS.md → system prompt
  │     ├─ 读取 agents/designer/Context/* → 上下文
  │     ├─ 调用 LLM
  │     ├─ 产出 → agents/designer/Context/登录页设计.md
  │     ├─ 更新 agents/designer/System/heartbeat/latest.md
  │     └─ 返回结果给 work-agent
  │
  ├─ tool_call: call_agent("reviewer", "审查代码", ...)
  │     └─ ...
  │
  └─ 汇总输出，展示任务卡片
```

## 文件路径结构

### 路径约定

| 路径 | 所属 | 说明 |
|------|------|------|
| `workspace/*` | 工作空间 | AI 对话产出的用户文档 |
| `AGENTS.md` | work-agent 配置 | agent system prompt |
| `System/*` | work-agent 配置 | 心跳/记忆/技能 |
| `Context/*` | work-agent 配置 | 知识库/上下文 |
| `agents/<name>/*` | sub-agent | 团队成员 agent 文件 |

### work-agent 文件结构

```
AGENTS.md                       ← agent 设定 / system prompt
├── System/
│   ├── heartbeat/              ← 运行状态
│   ├── memory/                 ← 长期记忆
│   └── skill/                  ← 技能定义
└── Context/                    ← 知识库 / 上下文
```

### sub-agent 文件结构

```
agents/<name>/
├── AGENTS.md                   ← agent 设定 / system prompt
├── System/
│   ├── heartbeat/
│   ├── memory/
│   └── skill/
└── Context/
```

### 工作空间

```
workspace/
├── 需求文档.md                  ← AI 对话产出的文档
├── 设计方案.md
└── ...
```

## 服务端设计

### API

| 方法 | 路由 | 说明 |
|------|------|------|
| GET | `/api/work/files?prefix=agents/designer` | 列出目录下文件 |
| GET | `/api/work/files/agents/designer/AGENTS.md` | 读取文件内容 |
| PUT | `/api/work/files/agents/designer/AGENTS.md` | 写入/更新文件 |
| DELETE | `/api/work/files/agents/designer` | 删除文件或目录 |
| POST | `/api/work/chat` | work-agent 对话（含 tool calling） |

### Chat API 改造

```
POST /api/work/chat { message, model?, conversationId? }

处理流程:
1. 构建 system prompt:
   - 根 AGENTS.md 内容
   - 列出 agents/ 下可用 agent 名称和能力摘要
   - Context/ 下文件内容
2. 注入 call_agent tool 定义
3. LLM streaming 调用（Work-Agent）
4. 如果 LLM 返回 tool_call:
   call_agent(name, task, context):
     a. 读取 agents/<name>/AGENTS.md + Context/* + System/skill/*
     b. 构建 sub-agent 的 system prompt + 上下文
     c. 调用 LLM（作为该 sub-agent）
     d. 产出写入 agents/<name>/Context/ 
     e. 更新 agents/<name>/System/heartbeat/latest.md
     f. 返回结果给 work-agent，继续对话
5. 对话结束后自动提取记忆 → System/memory/
```

### SSE 事件类型

| 事件 | 前端行为 |
|------|---------|
| `text` | work-agent 逐字输出 |
| `agent_start` { name, task } | 插入"进行中"任务卡片 |
| `agent_progress` { name, text } | 更新卡片进度文字 |
| `agent_done` { name, files[] } | 卡片变为"已完成"，显示产出文件 |
| `done` | 对话结束 |

### 数据模型

**新增表 `work_files`**：持久化文件树

```sql
CREATE TABLE work_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  path TEXT NOT NULL,          -- 相对于 agent 根目录，如 "agents/designer/AGENTS.md"
  content TEXT NOT NULL DEFAULT '',
  is_folder INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, path)
);
```

**已有表复用**：
- `workAgents` → 可废弃，agent 信息从文件树 `agents/*/AGENTS.md` 读取
- `workConversations` → 继续使用，messagesJson 需扩展支持任务卡片

## 前端设计

### WorkPage 布局

```
┌──────────┬──────────────────────┬──────────────────┐
│ 左侧聊天  │     中间 Milkdown     │    右侧面板        │
│ 400px    │  flex-1              │  272px            │
│          │  100% Crepe 全功能    │  ┌──────────────┐ │
│ 对话+卡片 │  TopBar / Cursor /   │  │  工作空间      │ │
│          │  CodeMirror / Latex  │  │  workspace/* │ │
│          │  AI / 所有 features  │  ├──────────────┤ │
│          │  自动保存 3s          │  │ [助理] [团队]  │ │
│          │                      │  │ System/      │ │
│          │                      │  │ Context/     │ │
│          │                      │  │ AGENTS.md    │ │
│          │                      │  │ agents/...   │ │
└──────────┴──────────────────────┴──────────────────┘
```

### 中间栏：Milkdown Crepe 编辑器

100% 完整 Milkdown + Crepe 集成，**所有 features 全开**：
- TopBar（标题选择器、格式化按钮）
- Cursor（光标跟随）
- CodeMirror（代码块语法高亮）
- Latex（数学公式支持）
- AI（AI 辅助功能）
- 自动保存（3 秒间隔 + 失焦保存）

### 右侧面板

**整体结构**：上下分屏（各 50%）

**上方 — 工作空间**：
- 显示 `workspace/*` 路径下的文件
- 扁平文件列表（文件名 + 路径）
- + 新建文件按钮
- 点击文件 → 中间栏 Milkdown 打开

**下方 — 助理 / 团队 Tab**：

**助理 Tab**（work-agent 配置）：
- 可展开的目录树：System/、Context/、AGENTS.md
- 右键菜单：新建/重命名/删除
- 点击文件 → 中间栏 Milkdown 打开
- 用户可自由编辑 agent 配置

**团队 Tab**（sub-agent 管理）：
- 成员列表（展开查看目录结构）
- + 创建成员 → 生成 `agents/<name>/` 完整结构
- 编辑/删除成员

### 市场页面：新增"人才"tab

在现有工具市场旁边增加人才 tab：

```
市场页面
├─ 工具 tab（现有）
└─ 人才 tab（新增）
   ├─ 搜索：名称、标签、能力描述
   ├─ 浏览已发布 agent 列表
   ├─ 查看 agent 详情（设定+上下文预览）
   └─ 一键加入我的团队
```

## 发布与导入

### 发布

用户编辑好 agent 后，在团队页面点击"发布到市场"。

**发布内容**（完整 agent 包）：
```
agents/<name>/
├── AGENTS.md      ← system prompt + 能力描述
├── System/
│   ├── heartbeat/  ← 空文件夹
│   ├── memory/     ← 空文件夹
│   └── skill/      ← 技能定义（如有）
└── Context/        ← 知识库 / 上下文资料
```

**元信息**：
- 名称、标签、分类
- 能力摘要（从 AGENTS.md 前 200 字符提取）
- 发布者

### 导入

从市场一键导入：完整复制 agent 文件包到本地 `agents/<name>/`。heartbeat 和 memory 为空，运行时自动填充。

## 实施优先级

| 优先级 | 模块 | 说明 |
|--------|------|------|
| P0 | 文件树持久化 + API | 所有功能的基础 |
| P0 | Chat API 改造（call_agent） | 核心编排能力 |
| P1 | 任务卡片组件 | 对话中的可视化 |
| P1 | 团队管理（创建/删除 agent） | agent 生命周期 |
| P2 | heartbeat / memory 自动运转 | agent "成长" |
| P2 | 市场人才 tab + 发布/导入 | agent 生态闭环 |
| P3 | 市场搜索 + 标签 | 发现能力 |
