# Phase 2 收尾设计文档

**Date:** 2026-05-10
**Status:** Approved

## Goal

补齐 Phase 2 剩余 3 项：预览 iframe、部署按钮（自定义域名）、源码标签页。同时提供内置数据 API 让生成的工具有数据持久化能力。

## Architecture

```
用户提需求 → Agent Loop 生成文件 → R2 存储
                                      ↓
                              PreviewPanel（3 标签页）
                              ├── 预览：iframe srcdoc
                              ├── 代码：Monaco 编辑器
                              └── 源码：文件列表 + 只读 Monaco

部署流程：
  生成文件 → edgespark domain add → 阿里云 DNS API → edgespark domain verify → 部署上线
```

## Components

### 1. PreviewPanel 改造

三个标签页：

**预览标签页（新增实现）**
- `iframe` 元素，`sandbox="allow-scripts allow-forms allow-same-origin"`
- `srcdoc` 属性设置为生成的 HTML 内容
- 当 `generatedFiles` 更新时自动刷新预览
- 优先选择 `index.html`，fallback 到第一个 `.html` 文件
- 无 HTML 文件时显示"暂无预览"提示

**代码标签页（已有）**
- Monaco 编辑器只读查看当前选中文件
- 文件标签切换

**源码标签页（新增实现）**
- 展示所有生成文件的树形列表（扁平路径也行）
- 点击文件名 → Monaco 编辑器展示源码（只读）
- 文件类型图标/颜色区分

### 2. 内置数据 API

**数据库表（D1，已存在 `conversations` 等表）：**

新增 `tool_data` 表：
```sql
CREATE TABLE tool_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,     -- JSON string
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(project_id, user_id, key)
);
```

**API 路由（Hono，新增 `server/src/routes/toolData.ts`）：**

```
GET  /.smart/data/{key}          → 读取当前用户该 key 的数据
PUT  /.smart/data/{key}          → 写入/更新数据（body: { value: any }）
DEL  /.smart/data/{key}          → 删除数据

GET  /.smart/auth/user           → { user: {...} | null }
```

- 路由前缀 `/.smart/`，不在 `/api/` 前缀下（工具是公开访问的，不要求登录）
- `data/*` 读操作：公开项目返回共享数据；私有项目要求登录
- `data/*` 写操作：要求登录，按 userId 隔离
- `auth/user`：返回当前登录用户信息（用于工具页面的登录状态判断）

**SDK 注入（`/.smart/sdk.js`）：**

AI 生成工具时，在 `index.html` 中注入：
```html
<script src="/.smart/sdk.js"></script>
```

SDK 提供全局 `Smart` 对象：
```js
Smart.data.get('key')        // Promise → value | null
Smart.data.set('key', val)   // Promise → void
Smart.data.delete('key')     // Promise → void
Smart.auth.user()            // Promise → { id, email, name } | null
```

### 3. 部署按钮

**UI（PreviewPanel 顶栏）：**
- "部署"按钮 → 弹出域名输入弹窗
- 输入域名前缀（如 `todo`）→ 预览完整域名 `todo.torresx.cn`
- 进度展示：添加域名 → 配置 DNS → 验证 → 完成
- 成功后显示链接 `https://todo.torresx.cn`

**服务端（新增 `server/src/routes/deploy.ts`）：**

```
POST /api/projects/:projectId/deploy
  body: { subdomain: "todo" }
  → 1. edgespark domain add todo.torresx.cn
  → 2. call Aliyun DNS API to add TXT + CNAME records
  → 3. edgespark domain verify todo.torresx.cn
  → 4. deploy the tool's HTML to the domain
  → 5. return { url: "https://todo.torresx.cn" }
```

**阿里云 DNS：**
- 使用 `@alicloud/alidns20150109` SDK（或直接 HTTP API）
- 需要 secret：`ALIYUN_ACCESS_KEY_ID`、`ALIYUN_ACCESS_KEY_SECRET`
- 需要在阿里云 DNS 中预先添加 `torresx.cn` 域名解析

**部署文件策略：**
- 生成的 `index.html` 部署为静态资源
- 如果有多文件（style.css, app.js），打包到同一域名下
- EdgeSpark Workers Static Assets 托管

### 4. System Prompt 更新

AI 的系统提示中加入工具架构说明：

```
生成工具时，遵循以下架构：

项目结构：
  index.html  — 入口页面，包含 SDK 引用和主 UI
  style.css   — 样式（如需要）
  app.js      — 业务逻辑（如需要）

SDK 引用（必须放在 index.html 的 </body> 前）：
  <script src="/.smart/sdk.js"></script>

数据存取（通过 Smart SDK）：
  const todos = await Smart.data.get('todos') || [];
  await Smart.data.set('todos', todos);
  const user = await Smart.auth.user();  // null 表示未登录

样式：使用 Tailwind CSS CDN 或内联样式，保持现代简洁的 UI
```

## File Changes

### New Files
| File | Purpose |
|------|---------|
| `server/src/routes/toolData.ts` | `/.smart/data/*` + `/.smart/auth/*` API |
| `server/src/routes/deploy.ts` | 部署到自定义域名 |
| `server/src/routes/sdk.ts` | `/.smart/sdk.js` 动态生成 |
| `web/src/components/preview/DeployModal.tsx` | 部署弹窗 UI |

### Modified Files
| File | Changes |
|------|---------|
| `server/src/index.ts` | 注册 toolData / deploy / sdk 路由 |
| `server/src/defs/db_schema.ts` | 添加 `toolData` 表 |
| `server/src/defs/runtime.ts` | 添加阿里云 secret key 声明 |
| `server/src/routes/vibe.ts` | 更新 system prompt，注入项目架构说明 |
| `web/src/components/preview/PreviewPanel.tsx` | 实现预览 iframe + 源码标签页 + 部署按钮 |

## Verification

1. 发送需求 "做一个待办事项工具" → AI 生成 index.html
2. 预览标签页 → iframe 显示待办事项 UI，可交互
3. 通过待办事项页面添加数据 → 刷新后数据保留（Smart.data API）
4. 源码标签页 → 显示文件列表，点击查看源码
5. 部署 → 输入域名前缀 → 部署成功 → `https://xxx.torresx.cn` 可访问
6. 自定义域名访问 → 数据和原项目一致
