# Work-Agent 多智能体协同系统设计

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

## 统一 Agent 文件结构

每个 agent（包括 work-agent 自身）遵循相同的目录结构：

```
agents/<name>/                  ← work-agent 自身在根目录
├── AGENTS.md                   ← agent 设定 / system prompt
├── System/
│   ├── heartbeat/              ← 运行状态（私有，发布时为空）
│   │   ├── latest.md           ← 最新状态
│   │   └── 2026-05-18-10:30.md ← 历史心跳
│   ├── memory/                 ← 长期记忆（私有，发布时为空）
│   └── skill/                  ← 技能定义
└── Context/                    ← 知识库 / 上下文 / 产出存放
```

| 目录/文件 | 用途 | 是否发布 |
|-----------|------|---------|
| AGENTS.md | agent 的 system prompt + 能力描述 | 发布 |
| System/heartbeat/ | 运行状态，断点恢复，进度展示 | 结构发布，内容不发布 |
| System/memory/ | 自动提取的长期记忆 | 结构发布，内容不发布 |
| System/skill/ | 自定义技能定义 | 发布 |
| Context/ | 知识库、上下文资料、产出文件 | 发布 |

work-agent 自身的文件在根级别（AGENTS.md、System/、Context/），sub-agent 在 `agents/<name>/` 下。

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

### WorkPage 布局（不变）

```
┌──────────┬───────────────────┬──────────┐
│ 左侧聊天  │   中间编辑区       │ 右侧面板  │
│ 400px    │  flex-1           │ 272px    │
│          │  (Milkdown编辑器)  │          │
│ 对话+卡片 │                   │ 文件树    │
│          │                   │ 团队列表  │
└──────────┴───────────────────┴──────────┘
```

### 对话区新增组件

**任务卡片**：当 SSE 事件 `agent_start` 触发时嵌入对话

```
┌──────────────────────────────────┐
│ 🎨 designer · 进行中...          │
│ ▸ 正在设计登录页...              │
└──────────────────────────────────┘
```

完成后自动更新为：

```
┌──────────────────────────────────┐
│ 🎨 designer · 已完成             │
│ 📄 登录页设计.md  [点击预览]      │
└──────────────────────────────────┘
```

### 右侧面板改造

**助理 tab**：文件树（持久化，非内存状态）
- 显示完整 agent 文件结构
- 右键菜单：新建/重命名/删除
- 点击文件 → 中间栏 Milkdown 打开
- 修改自动保存

**团队 tab**：成员管理

```
团队 tab
├─ 团队成员列表（扫描 agents/ 目录）
│  ├─ 🟢 designer — 空闲
│  ├─ 🟢 reviewer — 工作中  
│  └─ 🟡 coder — 空闲
├─ + 创建成员
│  └─ 输入名称 → 生成 agents/<name>/ 完整结构
├─ + 从市场导入
│  └─ 打开市场搜索 → 一键导入
└─ 点击成员 → 展开详情
   ├─ 编辑 AGENTS.md（Milkdown）
   ├─ 查看 Context/ 文件
   ├─ 发布到市场
   └─ 删除成员
```

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
