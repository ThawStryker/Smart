# Phase 3：预览升级 + 多文件支持 + 部署完善 设计文档

**Date:** 2026-05-10
**Status:** Approved

## Goal

AI 生成多文件 Web 项目 → R2 代理预览 → 自定义域名一键部署上线。

## Architecture

```
用户提需求 → AI Agent 生成多文件 → R2 存储（按 projectId/toolId/ 隔离）
    ↓                             ↓
  预览                           部署
  /api/public/smart/preview/:pid/:tid/*    *.torresx.cn → Worker 路由
  iframe 加载真实 URL            从 R2 加载对应工具文件
```

## Design

### 1. 多文件项目支持

每个工具是一个独立目录，R2 路径：`{projectId}/{toolId}/index.html`、`{projectId}/{toolId}/style.css` 等。

System Prompt 已引导 AI 生成多文件结构。`index.html` 使用相对路径引用同目录文件：
```html
<link rel="stylesheet" href="style.css">
<script src="app.js"></script>
```

后续可加"下载源码"功能：列出该目录下所有文件，打包下载（ZIP 从 R2 读取）。

### 2. R2 代理预览

新增路由（无需登录，公开访问）：

```
GET /api/public/smart/preview/:projectId/:toolId/*
```

逻辑：
1. 从路径提取 projectId、toolId、文件路径
2. 从 R2 `{projectId}/{toolId}/{filePath}` 读取文件
3. 根据文件扩展名设置 Content-Type（html/css/js/json 等）
4. 返回文件内容

前端：PreviewPanel 的预览 iframe 从 `srcdoc` 改为加载 URL：
```
<iframe src="https://app.edgespark.app/api/public/smart/preview/{projectId}/{toolId}/index.html" />
```

CSS/JS 相对路径自动解析到同一代理目录，无需内联。

### 3. 自定义域名部署

**数据库新增 `domains` 表：**

```sql
CREATE TABLE domains (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  tool_id INTEGER NOT NULL,
  domain TEXT NOT NULL UNIQUE,        -- todo.torresx.cn
  status TEXT DEFAULT 'pending',       -- pending / active / removed
  created_at TEXT DEFAULT (datetime('now')),
  verified_at TEXT
);
```

**Worker 域名路由：**

Worker 入口检测 Host header：
```typescript
// 在 index.ts 添加通配路由
const hostname = c.req.header("Host") || "";
if (hostname.endsWith(".torresx.cn")) {
  // 查 domains 表获取 toolId
  const [domain] = await db.select().from(domains).where(eq(domains.domain, hostname));
  if (domain && domain.status === "active") {
    // 从 R2 加载文件，默认返回 index.html
    const [tool] = await db.select().from(tools).where(eq(tools.id, domain.toolId));
    const filePath = c.req.path.replace(/^\//, "") || "index.html";
    const prefix = `${tool.projectId}/${tool.id}/`;
    const obj = await storage.from(buckets.sourceBuckets).get(prefix + filePath);
    if (obj) return new Response(obj.body, { headers: contentType(filePath) });
  }
}
```

**部署流程（全自动）：**

1. 用户点"部署" → 输入域名前缀（如 `todo`）
2. 后端验证域名可用性
3. 后端调阿里云 DNS API 添加 CNAME 记录：`todo.torresx.cn → custom.edgespark.app`
4. 后端执行 `edgespark domain add todo.torresx.cn`
5. 后端执行 `edgespark domain verify todo.torresx.cn`
6. 插入 `domains` 表记录，状态设为 `active`
7. 返回部署 URL

### 4. 工具发布体系

已有 `marketListings` 表：
```sql
market_listings (
  tool_id, seller_id, title, description, price,
  category, downloads, rating_avg,
  status DEFAULT 'pending_review'  -- pending_review / approved / rejected / delisted
)
```

流程：
1. 用户在自己的工具上点"发布到市场"
2. 填写标题、描述、分类
3. 提交后 `status = 'pending_review'`
4. 管理审核通过后 `status = 'approved'`，出现在工具市场
5. 自己的 Dashboard 显示所有工具（不论发布状态）

### 5. 工具独立目录

R2 存储已按 `${projectId}/${toolId}/` 隔离，每个工具天然独立：
```
tool-sources/
  7/5/index.html
  7/5/style.css
  7/5/app.js
  7/6/index.html
  7/6/script.js
```

后续"下载源码"功能：列出 `{projectId}/{toolId}/` 下所有文件，逐个读取打包为 ZIP 下载。

## File Changes

### New Files
| File | Purpose |
|------|---------|
| `server/src/routes/preview.ts` | R2 代理预览路由 |
| `server/src/routes/domainRouter.ts` | 自定义域名 Worker 路由 |

### Modified Files
| File | Changes |
|------|---------|
| `server/src/defs/db_schema.ts` | 添加 `domains` 表 |
| `server/src/index.ts` | 注册 preview 路由 + 域名通配处理 |
| `web/src/components/preview/PreviewPanel.tsx` | iframe src 从 srcdoc 改为代理 URL |
| `web/src/components/preview/DeployModal.tsx` | 对接完整部署流程 |

## Data Flow

```
Preview:
  PreviewPanel → iframe src = /api/public/smart/preview/:pid/:tid/index.html
    → Worker 代理 → R2 读取文件 → 返回 HTML
    → HTML 内引用 style.css、app.js → 浏览器自动请求同目录

Deploy:
  DeployModal → POST /api/projects/:pid/deploy { subdomain }
    → DNS API 加 CNAME → edgespark domain add/verify → 写 domains 表
    → 返回 URL

Access:
  Browser → todo.torresx.cn → Worker 识别域名 → R2 加载文件 → 返回
```
