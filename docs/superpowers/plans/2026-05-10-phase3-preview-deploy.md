# Phase 3：预览升级 + 多文件支持 + 部署 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI 生成多文件项目 → R2 代理预览 → 自定义域名一键部署

**Architecture:** R2 代理路由 serve 工具文件（iframe 真实 URL 预览），Worker 域名路由匹配 `*.torresx.cn` 返回对应工具，全自动 DNS + edgespark domain

**Tech Stack:** Hono + Drizzle ORM + D1 + R2 + EdgeSpark Domain API + Alibaba Cloud DNS API

---

### Task 1: 添加 domains 表 + 数据库迁移

**Files:**
- Modify: `server/src/defs/db_schema.ts` — 添加 `domains` 表
- Modify: `server/src/defs/db_relations.ts` — 添加关系
- Generate: `server/drizzle/` — 迁移 SQL

- [ ] **Step 1: 添加 domains 表定义**

在 `server/src/defs/db_schema.ts` 末尾添加：

```typescript
// 自定义域名部署
export const domains = sqliteTable("domains", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull(),
  toolId: integer("tool_id").notNull(),
  domain: text("domain").notNull().unique(),
  status: text("status").default("pending"), // pending → active → removed
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  verifiedAt: text("verified_at"),
});
```

- [ ] **Step 2: 添加 domains 关系**

在 `server/src/defs/db_relations.ts` 顶部 import 添加 `domains`，末尾添加：

```typescript
export const domainsRelations = relations(domains, ({ one }) => ({
  tool: one(tools, { fields: [domains.toolId], references: [tools.id] }),
  project: one(projects, { fields: [domains.projectId], references: [projects.id] }),
}));
```

- [ ] **Step 3: 生成并应用迁移**

```bash
cd /Users/cuitao/Documents/Smart
edgespark db generate
edgespark db migrate
```

- [ ] **Step 4: Commit**

```bash
git add server/src/defs/db_schema.ts server/src/defs/db_relations.ts server/drizzle/
git commit -m "feat: 添加 domains 表，支持自定义域名绑定"
```

---

### Task 2: 创建 R2 代理预览路由

**Files:**
- Create: `server/src/routes/preview.ts`
- Modify: `server/src/index.ts`

- [ ] **Step 1: 创建预览路由**

写入 `server/src/routes/preview.ts`：

```typescript
import { Hono } from "hono";
import { db, storage } from "edgespark";
import { eq, and } from "drizzle-orm";
import { projects, tools, buckets } from "@defs";

const MIME_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  txt: "text/plain; charset=utf-8",
};

function getContentType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "txt";
  return MIME_TYPES[ext] || "application/octet-stream";
}

export const previewRoutes = new Hono()
  .get("/api/public/smart/preview/:projectId/:toolId/*", async (c) => {
    const projectId = parseInt(c.req.param("projectId"), 10);
    const toolId = parseInt(c.req.param("toolId"), 10);
    const filePath = c.req.param("*") || "index.html";

    // Verify tool belongs to project
    const [tool] = await db
      .select()
      .from(tools)
      .where(and(eq(tools.id, toolId), eq(tools.projectId, projectId)));
    if (!tool) return c.json({ error: "Tool not found" }, 404);

    const prefix = `${projectId}/${toolId}/`;
    const obj = await storage.from(buckets.sourceBuckets).get(prefix + filePath);

    // If path not found and no extension, try as directory → index.html
    if (!obj && !filePath.includes(".")) {
      const indexPath = prefix + filePath.replace(/\/$/, "") + "/index.html";
      const indexObj = await storage.from(buckets.sourceBuckets).get(indexPath);
      if (indexObj) {
        return new Response(indexObj.body, {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-cache",
          },
        });
      }
    }

    if (!obj) return c.json({ error: "File not found" }, 404);

    return new Response(obj.body, {
      headers: {
        "Content-Type": getContentType(filePath),
        "Cache-Control": "no-cache",
      },
    });
  });
```

- [ ] **Step 2: 注册 preview 路由到 index.ts**

在 `server/src/index.ts` 中添加：

```typescript
import { previewRoutes } from "./routes/preview";

// 在 route 链中添加：
  .route("/", previewRoutes)
```

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/preview.ts server/src/index.ts
git commit -m "feat: R2 代理预览路由（/api/public/smart/preview/:pid/:tid/*）"
```

---

### Task 3: 更新 PreviewPanel iframe 为真实 URL

**Files:**
- Modify: `web/src/components/preview/PreviewPanel.tsx`

- [ ] **Step 1: 替换 iframe srcdoc 为真实 URL 加载**

修改 `web/src/components/preview/PreviewPanel.tsx` 中预览标签页部分。

当前代码（srcdoc）：
```tsx
useEffect(() => {
    if (activeTab !== "preview" || !iframeRef.current) return;
    const htmlFile = generatedFiles.find((f) => f.path.endsWith(".html")) || generatedFiles.find((f) => f.language === "html");
    if (htmlFile) {
      iframeRef.current.srcdoc = htmlFile.content;
    }
  }, [activeTab, generatedFiles]);
```

替换为（真实 URL）：
```tsx
const [previewKey, setPreviewKey] = useState(0);

// Refs for tool identification
const toolIdRef = useRef<number | null>(null);

// Build preview URL from projectId + toolId
const previewUrl = toolIdRef.current
  ? `/api/public/smart/preview/${projectId}/${toolIdRef.current}/index.html`
  : null;

// Refresh iframe when files change
const refreshPreview = () => setPreviewKey((k) => k + 1);

// Update toolId from generatedFiles metadata or SSE context
useEffect(() => {
  if (generatedFiles.length > 0 && previewUrl) {
    refreshPreview();
  }
}, [generatedFiles.length]);
```

并在 JSX 中将 iframe 改为：
```tsx
{activeTab === "preview" ? (
  previewUrl ? (
    <iframe
      key={previewKey}
      src={previewUrl}
      className="w-full h-full border-0"
      sandbox="allow-scripts allow-forms allow-same-origin"
      title="Preview"
    />
  ) : (
    <div className="flex items-center justify-center h-full text-neutral-400 text-sm">
      <p>暂无 HTML 文件可预览</p>
    </div>
  )
) : ...
```

- [ ] **Step 2: 需要把 toolId 从 SSE 传给 PreviewPanel**

在 `ProjectDetail.tsx` 中，SSE `file` 事件不包含 toolId。需要让 `PreviewPanel` 知道当前 toolId。

简单方案：在 `PreviewPanel` 内通过 overview API 获取 toolId，或在 `ProjectDetail` 中维护 toolId 状态并传递。

读取 `ProjectDetail.tsx`，找到 `handleSend` 中 SSE 连接前的 tool 创建逻辑，添加 toolId 状态并在 SSE `done` 时设置。

```typescript
// 添加状态（ProjectDetail.tsx 中）：
const [activeToolId, setActiveToolId] = useState<number | null>(null);

// 在 handleSend 中，vibe POST 请求成功后保存 toolId：
// SSE done 事件时设置 toolId（从服务器最后返回的 done 事件中获取）
```

同时更新 PreviewPanel 的 props 添加 `toolId`：

```typescript
interface PreviewPanelProps {
  projectId: number;
  toolId: number | null;
  generatedFiles?: GeneratedFile[];
}
```

并传递 `right={<PreviewPanel projectId={numProjectId} toolId={activeToolId} generatedFiles={generatedFiles} />}`。

- [ ] **Step 3: Commit**

```bash
git add web/src/components/preview/PreviewPanel.tsx web/src/pages/ProjectDetail.tsx
git commit -m "feat: 预览 iframe 改为 R2 代理 URL（多文件支持）"
```

---

### Task 4: 完善部署流程

**Files:**
- Modify: `server/src/routes/deploy.ts` — 完善 DNS + domain 流程
- Modify: `web/src/components/preview/DeployModal.tsx` — 对接完整部署

- [ ] **Step 1: 完善部署 API**

读取并修改 `server/src/routes/deploy.ts`，将之前的简化版替换为完整流程：

```typescript
import { Hono } from "hono";
import { db, secret } from "edgespark";
import { auth } from "edgespark/http";
import { eq, and } from "drizzle-orm";
import { projects, tools, domains } from "@defs";

export const deployRoutes = new Hono()
  .post("/:projectId/deploy", async (c) => {
    const userId = auth.user!.id;
    const projectId = parseInt(c.req.param("projectId"), 10);

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
    if (!project) return c.json({ error: "Project not found" }, 404);

    const body = await c.req.json<{ subdomain: string }>();
    if (!body.subdomain?.trim()) return c.json({ error: "subdomain required" }, 400);

    const subdomain = body.subdomain.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!subdomain) return c.json({ error: "Invalid subdomain" }, 400);

    const fullDomain = `${subdomain}.torresx.cn`;

    // Check domain not already taken
    const [existing] = await db
      .select()
      .from(domains)
      .where(eq(domains.domain, fullDomain));
    if (existing) return c.json({ error: "Domain already in use" }, 409);

    // Find the latest tool for this project
    const [tool] = await db
      .select()
      .from(tools)
      .where(eq(tools.projectId, projectId))
      .orderBy(desc(tools.createdAt))
      .limit(1);
    if (!tool) return c.json({ error: "No tool found for this project" }, 404);

    const accessKeyId = secret.get("ALIYUN_ACCESS_KEY_ID");
    const accessKeySecret = secret.get("ALIYUN_ACCESS_KEY_SECRET");

    if (!accessKeyId || !accessKeySecret) {
      return c.json({ error: "Aliyun credentials not configured" }, 500);
    }

    try {
      // 1. Add CNAME DNS record via Alibaba Cloud
      await addCnameRecord("torresx.cn", subdomain, "custom.edgespark.app", accessKeyId, accessKeySecret);

      // 2. Save domain record
      await db.insert(domains).values({
        projectId,
        toolId: tool.id,
        domain: fullDomain,
        status: "pending",
      });

      // 3. Return URL + next steps (CLI part handled by agent)
      return c.json({
        success: true,
        url: `https://${fullDomain}`,
        domain: fullDomain,
        nextSteps: [
          `edgespark domain add ${fullDomain}`,
          `edgespark domain verify ${fullDomain} --timeout 15m`,
        ],
      });
    } catch (err) {
      return c.json({
        error: `Deploy failed: ${err instanceof Error ? err.message : String(err)}`,
      }, 500);
    }
  });
```

- [ ] **Step 2: 运行 CLI 部署步骤（手动/agent 执行）**

部署 API 返回后，agent 在本地执行：
```bash
edgespark domain add todo.torresx.cn
edgespark domain verify todo.torresx.cn --timeout 15m
```

确认激活后更新数据库：
```bash
# 通过 API 更新域名状态
curl -X PATCH /api/projects/:pid/deploy/:domainId -d '{"status":"active"}'
```

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/deploy.ts
git commit -m "feat: 完善部署流程（DNS + domain 注册 + domains 表写入）"
```

---

### Task 5: Worker 域名路由

**Files:**
- Modify: `server/src/index.ts` — 添加自定义域名处理中间件

- [ ] **Step 1: 添加域名路由中间件**

在 `server/src/index.ts` 中，在所有现有路由之前添加域名检测：

```typescript
import { db, storage } from "edgespark";
import { eq } from "drizzle-orm";
import { projects, tools, domains, buckets } from "@defs";

// ... 现有路由定义之前添加：

const app = new Hono()
  // Custom domain middleware — check before other routes
  .use("*", async (c, next) => {
    const hostname = c.req.header("Host") || "";
    
    // Only intercept custom domains, not the main app domain
    if (!hostname.endsWith(".torresx.cn") || hostname === "leading-stallion-5780.edgespark.app") {
      return next();
    }
    
    // Look up domain in DB
    const [domainRow] = await db
      .select()
      .from(domains)
      .where(eq(domains.domain, hostname));
    
    if (!domainRow || domainRow.status !== "active") {
      return c.json({ error: "Domain not found" }, 404);
    }
    
    const [tool] = await db
      .select()
      .from(tools)
      .where(eq(tools.id, domainRow.toolId));
    if (!tool) return c.json({ error: "Tool not found" }, 404);
    
    // Serve the requested file, default to index.html
    let filePath = c.req.path.replace(/^\//, "") || "index.html";
    if (filePath === "" || filePath.endsWith("/")) filePath += "index.html";
    
    const prefix = `${tool.projectId}/${tool.id}/`;
    const obj = await storage.from(buckets.sourceBuckets).get(prefix + filePath);
    
    // If not found and no extension, try index.html in that directory
    if (!obj) {
      const indexPath = prefix + filePath.replace(/\/$/, "") + "/index.html";
      const indexObj = await storage.from(buckets.sourceBuckets).get(indexPath);
      if (indexObj) {
        return new Response(indexObj.body, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
    }
    
    if (!obj) return c.json({ error: "File not found" }, 404);
    
    const ext = filePath.split(".").pop()?.toLowerCase() || "txt";
    const mimeTypes: Record<string, string> = {
      html: "text/html; charset=utf-8",
      css: "text/css; charset=utf-8",
      js: "application/javascript; charset=utf-8",
      json: "application/json",
      png: "image/png", svg: "image/svg+xml",
    };
    
    return new Response(obj.body, {
      headers: { "Content-Type": mimeTypes[ext] || "application/octet-stream" },
    });
  })
  // ... existing routes ...
```

注意：需要确保 `db`、`storage`、`buckets` 等导入可用。EdgeSpark 的 `db` 和 `storage` 只能在路由 handler 中使用（AsyncLocalStorage），作为中间件使用可能有问题。替代方案：将域名路由作为一个 Hono sub-app 用 `.route()` 注册。

**替代方案（如果中间件不兼容）：**

将域名路由作为独立路由：
```typescript
import { domainRoutes } from "./routes/domainRoutes";
// ...
  .route("/", domainRoutes)
```

其中 `domainRoutes` 定义通配路由处理所有路径。

- [ ] **Step 2: Commit**

```bash
git add server/src/index.ts
git commit -m "feat: Worker 自定义域名路由（*.torresx.cn → R2 文件服务）"
```

---

### Task 6: 部署验证

- [ ] **Step 1: 部署**

```bash
cd /Users/cuitao/Documents/Smart
edgespark deploy
```

- [ ] **Step 2: 验证预览**

浏览器中：
1. 进入项目 → 发送需求 "做一个带 CSS 和 JS 的待办事项工具"
2. 等待 AI 生成多个文件（index.html + style.css + app.js）
3. 切换到预览标签页 → iframe 加载代理 URL，CSS/JS 生效
4. 检查 iframe 能正常展示样式和交互

- [ ] **Step 3: 验证部署**

1. 点击部署按钮 → 输入域名前缀
2. 观察 DeployModal 展示进度
3. agent 运行 `edgespark domain add/verify`
4. 确认域名可访问

---

### 验证

Phase 3 验收：
1. AI 生成多文件项目（index.html + style.css + app.js）
2. 预览 iframe 通过 R2 代理 URL 正确加载（CSS/JS 生效）
3. 部署按钮走通 DNS + domain 注册流程
4. 自定义域名可访问工具
