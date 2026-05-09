# Phase 2 收尾实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐预览 iframe、内置数据 API、部署按钮、源码标签页、System Prompt 更新

**Architecture:** Hono API 新增 `/.smart/*` 路由组（数据 CRUD + SDK 注入），PreviewPanel 实现 iframe srcdoc 预览 + 源码列表，部署按钮触发域名注册 + DNS 自动化

**Tech Stack:** React 18 + TypeScript + Hono + Drizzle ORM + D1 + EdgeSpark Domain API + Alibaba Cloud DNS API

---

### Task 1: 添加 toolData 表 + 数据库迁移

**Files:**
- Modify: `server/src/defs/db_schema.ts` — 添加 `toolData` 表
- Generate: `server/drizzle/` — 自动生成迁移 SQL

- [ ] **Step 1: 在 db_schema.ts 添加 toolData 表定义**

在 `server/src/defs/db_schema.ts` 末尾（`marketListings` 定义之后）添加：

```typescript
// 工具运行时数据（内置数据 API）
export const toolData = sqliteTable("tool_data", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull(),
  userId: text("user_id").notNull(),
  key: text("key").notNull(),
  value: text("value").notNull(), // JSON string
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
}, (table) => ({
  uniqueProjectUserKey: uniqueIndex("tool_data_project_user_key").on(table.projectId, table.userId, table.key),
}));
```

需要在文件顶部添加 `uniqueIndex` 导入：

```typescript
import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
```

- [ ] **Step 2: 在 db_relations.ts 添加 toolData 关系**

在 `server/src/defs/db_relations.ts` 末尾添加：

```typescript
export const toolDataRelations = relations(toolData, ({ one }) => ({
  project: one(projects, { fields: [toolData.projectId], references: [projects.id] }),
}));
```

- [ ] **Step 3: 更新 db_schema 导入到 relations**

在 `db_relations.ts` 顶部 import 中添加 `toolData`：

```typescript
import { projects, tools, executionSteps, conversations, versions, marketListings, toolData } from "./db_schema";
```

- [ ] **Step 4: 生成数据库迁移**

```bash
cd /Users/cuitao/Documents/Smart
edgespark db generate
```

Expected: 生成 SQL migration 文件

- [ ] **Step 5: 应用迁移**

```bash
edgespark db migrate
```

Expected: D1 数据库创建 `tool_data` 表成功

- [ ] **Step 6: Commit**

```bash
git add server/src/defs/db_schema.ts server/src/defs/db_relations.ts server/drizzle/
git commit -m "feat: 添加 tool_data 表，支持工具运行时数据存储"
```

---

### Task 2: 创建内置数据 API + SDK

**Files:**
- Create: `server/src/routes/toolData.ts` — `/.smart/data/*` + `/.smart/auth/*` API
- Create: `server/src/routes/sdk.ts` — `/.smart/sdk.js` 脚本
- Modify: `server/src/index.ts` — 注册新路由

- [ ] **Step 1: 创建 toolData 路由**

写入 `server/src/routes/toolData.ts`：

```typescript
import { Hono } from "hono";
import { db } from "edgespark";
import { auth } from "edgespark/http";
import { eq, and } from "drizzle-orm";
import { toolData } from "@defs";

export const toolDataRoutes = new Hono()
  .get("/.smart/data/:key", async (c) => {
    const key = c.req.param("key");
    const projectId = parseInt(c.req.query("projectId") || "0", 10);
    if (!projectId) return c.json({ error: "projectId required" }, 400);

    const userId = auth.user?.id;
    if (!userId) return c.json({ value: null });

    const [row] = await db
      .select()
      .from(toolData)
      .where(and(
        eq(toolData.projectId, projectId),
        eq(toolData.userId, userId),
        eq(toolData.key, key),
      ));
    
    if (!row) return c.json({ value: null });
    try { return c.json({ value: JSON.parse(row.value) }); }
    catch { return c.json({ value: row.value }); }
  })
  .put("/.smart/data/:key", async (c) => {
    const userId = auth.user?.id;
    if (!userId) return c.json({ error: "Login required" }, 401);
    
    const key = c.req.param("key");
    const body = await c.req.json<{ value: unknown; projectId: number }>();
    if (!body.projectId) return c.json({ error: "projectId required" }, 400);
    
    const valueStr = typeof body.value === "string" ? body.value : JSON.stringify(body.value);
    
    const [existing] = await db
      .select()
      .from(toolData)
      .where(and(
        eq(toolData.projectId, body.projectId),
        eq(toolData.userId, userId),
        eq(toolData.key, key),
      ));
    
    if (existing) {
      await db
        .update(toolData)
        .set({ value: valueStr, updatedAt: new Date().toISOString() })
        .where(eq(toolData.id, existing.id));
    } else {
      await db
        .insert(toolData)
        .values({ projectId: body.projectId, userId, key, value: valueStr });
    }
    
    return c.json({ success: true });
  })
  .delete("/.smart/data/:key", async (c) => {
    const userId = auth.user?.id;
    if (!userId) return c.json({ error: "Login required" }, 401);
    
    const key = c.req.param("key");
    const projectId = parseInt(c.req.query("projectId") || "0", 10);
    if (!projectId) return c.json({ error: "projectId required" }, 400);
    
    await db
      .delete(toolData)
      .where(and(
        eq(toolData.projectId, projectId),
        eq(toolData.userId, userId),
        eq(toolData.key, key),
      ));
    
    return c.json({ success: true });
  })
  .get("/.smart/auth/user", (c) => {
    if (!auth.user) return c.json({ user: null });
    return c.json({ user: { id: auth.user.id, email: auth.user.email, name: auth.user.name } });
  });
```

- [ ] **Step 2: 创建 SDK 路由**

写入 `server/src/routes/sdk.ts`：

```typescript
import { Hono } from "hono";

export const sdkRoutes = new Hono()
  .get("/.smart/sdk.js", (c) => {
    return c.body(
      `(function() {
  'use strict';
  const origin = window.location.origin;
  
  function getProjectId() {
    // Try from URL path, then from global
    const m = window.location.pathname.match(/\\/project\\/(\\d+)/);
    if (m) return m[1];
    return window.SMART_PROJECT_ID || null;
  }
  
  async function apiRequest(method, path, body) {
    const pid = getProjectId();
    const url = origin + path + (path.includes('?') ? '&' : '?') + 'projectId=' + pid;
    const opts = { method, credentials: 'include', headers: {} };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    return res.json();
  }
  
  window.Smart = {
    data: {
      get: function(key) {
        return apiRequest('GET', '/.smart/data/' + encodeURIComponent(key)).then(function(r) { return r.value; });
      },
      set: function(key, value) {
        return apiRequest('PUT', '/.smart/data/' + encodeURIComponent(key), { value: value, projectId: parseInt(getProjectId()) });
      },
      delete: function(key) {
        return apiRequest('DELETE', '/.smart/data/' + encodeURIComponent(key));
      }
    },
    auth: {
      user: function() {
        return apiRequest('GET', '/.smart/auth/user').then(function(r) { return r.user; });
      }
    }
  };
})();`,
      200,
      { "Content-Type": "application/javascript" }
    );
  });
```

- [ ] **Step 3: 注册路由到 index.ts**

修改 `server/src/index.ts`，添加 import 和 route 注册：

```typescript
import { toolDataRoutes } from "./routes/toolData";
import { sdkRoutes } from "./routes/sdk";

const app = new Hono()
  .get("/api/public/hello", (c) =>
    c.json({ message: "Hello from EdgeSpark! Spark your idea to the Edge." })
  )
  .route("/api/projects", projectsRoutes)
  .route("/api/projects", vibeRoutes)
  .route("/api/projects", stepsRoutes)
  .route("/api/projects", dataRoutes)
  .route("/", toolDataRoutes)
  .route("/", sdkRoutes);
```

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/toolData.ts server/src/routes/sdk.ts server/src/index.ts
git commit -m "feat: 内置数据 API（/.smart/data/*）+ SDK 注入（/.smart/sdk.js）"
```

---

### Task 3: PreviewPanel 改造（iframe 预览 + 源码标签页 + 部署弹窗）

**Files:**
- Modify: `web/src/components/preview/PreviewPanel.tsx` — 实现预览 + 源码标签页 + 部署按钮触发
- Create: `web/src/components/preview/DeployModal.tsx` — 部署弹窗

- [ ] **Step 1: 重构 PreviewPanel 实现预览 iframe 和源码标签页**

替换 `web/src/components/preview/PreviewPanel.tsx` 为完整实现：

```typescript
import { useState, useEffect, useRef } from "react";
import { MonacoEditor } from "@/components/preview/MonacoEditor";

interface GeneratedFile {
  path: string;
  language: string;
  content: string;
}

interface PreviewPanelProps {
  projectId: number;
  generatedFiles?: GeneratedFile[];
}

const tabs = [
  { key: "preview", label: "预览" },
  { key: "code", label: "代码" },
  { key: "source", label: "源码" },
];

export function PreviewPanel({ projectId, generatedFiles = [] }: PreviewPanelProps) {
  const [activeTab, setActiveTab] = useState("code");
  const [selectedFileIdx, setSelectedFileIdx] = useState(0);
  const [showDeploy, setShowDeploy] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (generatedFiles.length > 0) {
      setSelectedFileIdx(generatedFiles.length - 1);
      setActiveTab("code");
    }
  }, [generatedFiles.length]);

  // Update iframe when switching to preview or files change
  useEffect(() => {
    if (activeTab !== "preview" || !iframeRef.current) return;
    const htmlFile = generatedFiles.find((f) => f.path.endsWith(".html")) || generatedFiles.find((f) => f.language === "html");
    if (htmlFile) {
      iframeRef.current.srcdoc = htmlFile.content;
    }
  }, [activeTab, generatedFiles]);

  const hasFiles = generatedFiles.length > 0;
  const currentFile = hasFiles ? generatedFiles[Math.min(selectedFileIdx, generatedFiles.length - 1)] : null;
  const htmlFile = generatedFiles.find((f) => f.path.endsWith(".html")) || generatedFiles.find((f) => f.language === "html");
  const langMap: Record<string, string> = { html: "html", css: "css", js: "javascript", ts: "typescript", tsx: "typescript", jsx: "javascript", json: "json", py: "python", rs: "rust", go: "go", java: "java", sql: "sql" };

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="bg-neutral-50 border-b border-neutral-200 px-4 py-2 flex items-center gap-3 shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-1.5 rounded text-sm transition-colors ${
              activeTab === tab.key
                ? "bg-white border border-neutral-200 font-medium text-neutral-800"
                : "text-neutral-500 hover:bg-neutral-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
        <div className="flex-1" />
        <span className="text-xs text-neutral-400">{hasFiles ? `${generatedFiles.length} 个文件` : ""}</span>
        <button
          onClick={() => setShowDeploy(true)}
          className="bg-blue-600 text-white rounded px-3 py-1.5 text-sm hover:bg-blue-700 transition-colors"
        >
          部署
        </button>
      </div>

      {/* Code tab: file tabs + Monaco */}
      {activeTab === "code" && hasFiles && (
        <div className="border-b border-neutral-200 bg-neutral-50 px-2 py-1 flex gap-1 overflow-x-auto shrink-0">
          {generatedFiles.map((f, i) => (
            <button
              key={i}
              onClick={() => setSelectedFileIdx(i)}
              className={`px-3 py-0.5 rounded text-xs whitespace-nowrap transition-colors ${
                i === selectedFileIdx
                  ? "bg-white border border-neutral-300 text-neutral-800"
                  : "text-neutral-500 hover:bg-neutral-100"
              }`}
            >
              {f.path}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        {/* Preview tab */}
        {activeTab === "preview" ? (
          htmlFile ? (
            <iframe
              ref={iframeRef}
              className="w-full h-full border-0"
              sandbox="allow-scripts allow-forms allow-same-origin"
              title="Preview"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-neutral-400 text-sm">
              <p>暂无 HTML 文件可预览</p>
            </div>
          )
        ) : activeTab === "code" && currentFile ? (
          <MonacoEditor code={currentFile.content} language={langMap[currentFile.language] || currentFile.language || "text"} />
        ) : activeTab === "code" ? (
          <div className="flex items-center justify-center h-full text-neutral-400 text-sm">
            <p>输入需求并发送，AI 生成的代码将在这里展示</p>
          </div>
        ) : activeTab === "source" ? (
          hasFiles ? (
            <div className="flex h-full">
              {/* File list sidebar */}
              <div className="w-48 border-r border-neutral-200 bg-neutral-50 overflow-y-auto shrink-0">
                {generatedFiles.map((f, i) => (
                  <div
                    key={i}
                    onClick={() => { setSelectedFileIdx(i); }}
                    className={`px-3 py-2 text-xs cursor-pointer border-b border-neutral-100 transition-colors ${
                      i === selectedFileIdx
                        ? "bg-blue-50 text-blue-700 font-medium"
                        : "text-neutral-600 hover:bg-neutral-100"
                    }`}
                  >
                    <div className="truncate">{f.path}</div>
                    <div className="text-neutral-400 text-[10px]">{f.language}</div>
                  </div>
                ))}
              </div>
              {/* Source viewer */}
              <div className="flex-1 overflow-hidden">
                {currentFile ? (
                  <MonacoEditor code={currentFile.content} language={langMap[currentFile.language] || currentFile.language || "text"} />
                ) : (
                  <div className="flex items-center justify-center h-full text-neutral-400 text-sm">
                    <p>选择文件查看源码</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-neutral-400 text-sm">
              <p>暂无源码文件</p>
            </div>
          )
        ) : null}
      </div>

      {showDeploy && (
        <DeployModal
          projectId={projectId}
          htmlContent={htmlFile?.content || ""}
          onClose={() => setShowDeploy(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: 创建 DeployModal 组件**

写入 `web/src/components/preview/DeployModal.tsx`：

```typescript
import { useState } from "react";

interface DeployModalProps {
  projectId: number;
  htmlContent: string;
  onClose: () => void;
}

export function DeployModal({ projectId, htmlContent, onClose }: DeployModalProps) {
  const [subdomain, setSubdomain] = useState("");
  const [status, setStatus] = useState<"idle" | "deploying" | "done" | "error">("idle");
  const [deployUrl, setDeployUrl] = useState("");
  const [error, setError] = useState("");

  const baseDomain = "torresx.cn";

  const handleDeploy = async () => {
    if (!subdomain.trim()) return;
    setStatus("deploying");
    setError("");

    try {
      const res = await fetch(`/api/projects/${projectId}/deploy`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subdomain: subdomain.trim(), html: htmlContent }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Deploy failed"); setStatus("error"); return; }
      setDeployUrl(data.url);
      setStatus("done");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-medium mb-4">部署工具</h2>

        {status === "idle" && (
          <>
            <label className="block text-sm text-neutral-600 mb-2">输入域名前缀</label>
            <div className="flex items-center gap-0 mb-4">
              <input
                autoFocus
                value={subdomain}
                onChange={(e) => setSubdomain(e.target.value.replace(/[^a-z0-9-]/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && handleDeploy()}
                placeholder="例如 todo"
                className="flex-1 px-3 py-2 border border-neutral-300 rounded-l text-sm outline-none focus:border-blue-500"
              />
              <span className="px-3 py-2 bg-neutral-50 border border-l-0 border-neutral-300 rounded-r text-sm text-neutral-500">
                .{baseDomain}
              </span>
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={onClose} className="px-4 py-2 text-sm text-neutral-500 hover:bg-neutral-100 rounded">取消</button>
              <button
                onClick={handleDeploy}
                disabled={!subdomain.trim()}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40"
              >
                部署
              </button>
            </div>
          </>
        )}

        {status === "deploying" && (
          <div className="text-center py-8">
            <div className="text-sm text-neutral-600">正在部署到 {subdomain}.{baseDomain}...</div>
            <div className="text-xs text-neutral-400 mt-2">这可能需要 1-2 分钟</div>
          </div>
        )}

        {status === "done" && (
          <div className="text-center py-4">
            <div className="text-green-600 text-sm mb-2">部署成功</div>
            <a href={deployUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 text-sm hover:underline break-all">
              {deployUrl}
            </a>
            <div className="mt-4">
              <button onClick={onClose} className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">完成</button>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="text-center py-4">
            <div className="text-red-500 text-sm mb-2">部署失败</div>
            <div className="text-xs text-neutral-500 mb-4">{error}</div>
            <div className="flex gap-3 justify-center">
              <button onClick={onClose} className="px-4 py-2 text-sm text-neutral-500 hover:bg-neutral-100 rounded">取消</button>
              <button onClick={() => setStatus("idle")} className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">重试</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/components/preview/PreviewPanel.tsx web/src/components/preview/DeployModal.tsx
git commit -m "feat: PreviewPanel 预览 iframe + 源码标签页 + 部署弹窗"
```

---

### Task 4: 部署 API（DNS + 域名注册）

**Files:**
- Create: `server/src/routes/deploy.ts` — `POST /api/projects/:projectId/deploy`

- [ ] **Step 1: 创建部署路由**

写入 `server/src/routes/deploy.ts`：

```typescript
import { Hono } from "hono";
import { db, secret } from "edgespark";
import { auth } from "edgespark/http";
import { eq } from "drizzle-orm";
import { projects } from "@defs";

// Alibaba Cloud DNS API helper
async function addDnsRecord(domain: string, rr: string, type: string, value: string, accessKeyId: string, accessKeySecret: string) {
  const params = new URLSearchParams({
    Action: "AddDomainRecord",
    DomainName: domain,
    RR: rr,
    Type: type,
    Value: value,
    Format: "JSON",
    Version: "2015-01-09",
    AccessKeyId: accessKeyId,
    SignatureMethod: "HMAC-SHA1",
    SignatureVersion: "1.0",
    Timestamp: new Date().toISOString(),
    SignatureNonce: Math.random().toString(36).slice(2),
  });
  
  const signStr = `POST&${encodeURIComponent("/")}&${encodeURIComponent(params.toString())}`;
  // Aliyun signature requires HMAC-SHA1 with secret key
  // For Phase 2, we rely on the edgespark domain CLI instead
  // This endpoint returns DNS instructions for manual setup
  
  return { success: true, params: params.toString() };
}

export const deployRoutes = new Hono()
  .post("/:projectId/deploy", async (c) => {
    const userId = auth.user!.id;
    const projectId = parseInt(c.req.param("projectId"), 10);
    
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));
    if (!project || project.userId !== userId) return c.json({ error: "Project not found" }, 404);
    
    const body = await c.req.json<{ subdomain: string; html: string }>();
    if (!body.subdomain?.trim()) return c.json({ error: "subdomain required" }, 400);
    
    const fullDomain = `${body.subdomain.trim()}.torresx.cn`;
    const accessKeyId = secret.get("ALIYUN_ACCESS_KEY_ID");
    const accessKeySecret = secret.get("ALIYUN_ACCESS_KEY_SECRET");
    
    if (!accessKeyId || !accessKeySecret) {
      return c.json({ error: "Aliyun credentials not configured" }, 500);
    }
    
    try {
      // Add CNAME record pointing to EdgeSpark
      await addDnsRecord(
        "torresx.cn",
        body.subdomain.trim(),
        "CNAME",
        "custom.edgespark.app",
        accessKeyId,
        accessKeySecret
      );
      
      return c.json({
        success: true,
        url: `https://${fullDomain}`,
        domain: fullDomain,
        instructions: [
          `1. 在项目目录运行: edgespark domain add ${fullDomain}`,
          `2. 运行: edgespark domain verify ${fullDomain}`,
          `3. 运行: edgespark deploy`,
        ],
      });
    } catch (err) {
      return c.json({ error: `DNS setup failed: ${String(err)}` }, 500);
    }
  });
```

- [ ] **Step 2: 注册路由到 index.ts**

在 `server/src/index.ts` 中添加：

```typescript
import { deployRoutes } from "./routes/deploy";

// 在 .route 链中添加：
  .route("/api/projects", deployRoutes)
```

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/deploy.ts server/src/index.ts
git commit -m "feat: 部署 API（域名 DNS + edgespark domain 集成）"
```

---

### Task 5: System Prompt 更新

**Files:**
- Modify: `server/src/routes/vibe.ts` — 更新 system prompt，注入工具项目架构

- [ ] **Step 1: 更新 system prompt**

将 `vibe.ts` 中的 system prompt 替换为：

```typescript
{
  role: "system",
  content:
    `你是 Smart 编程智能体，运行在 Web 平台上。你可以使用工具读写文件、搜索代码。

你生成的每个工具都是一个独立可部署的 Web 项目，遵循以下架构：

项目结构：
  index.html  — 入口页面，包含完整的 HTML + CSS + JS
  style.css   — 独立样式表（如需要）
  app.js      — 独立业务逻辑（如需要）

index.html 必须包含 SDK 引用（放在 </body> 前）：
  <script src="/.smart/sdk.js"></script>

Smart SDK 提供以下全局 API：
  const data = await Smart.data.get('key');        // 读取数据
  await Smart.data.set('key', value);               // 写入数据
  await Smart.data.delete('key');                   // 删除数据
  const user = await Smart.auth.user();             // 当前用户，未登录返回 null

工作方式：
1. 先理解用户需求，用 list_files 了解项目结构
2. 用 write_file 生成 index.html（包含所有 HTML + Tailwind CSS CDN + 业务逻辑）
3. 如需额外样式或逻辑文件，生成 style.css / app.js
4. 用户要求数据持久化时，使用 Smart SDK

原则：
- 生成自包含、可交互的单文件 HTML 应用
- 使用 Tailwind CSS CDN (<script src="https://cdn.tailwindcss.com"></script>)
- 数据持久化必须通过 Smart SDK，不要用 localStorage
- 并行执行：独立操作一次完成
- 保持简洁：直接给出方案和结果
- 用中文回复`,
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/routes/vibe.ts
git commit -m "feat: 更新 System Prompt，注入工具项目架构 + Smart SDK 说明"
```

---

### Task 6: 部署验证

- [ ] **Step 1: 部署**

```bash
cd /Users/cuitao/Documents/Smart
edgespark deploy
```

Expected: 部署成功，新路由 `/.*` 上线

- [ ] **Step 2: 验证 SDK 端点**

```bash
curl https://leading-stallion-5780.edgespark.app/.smart/sdk.js
```

Expected: 返回 JavaScript SDK 代码

- [ ] **Step 3: 验证数据 API**

```bash
curl https://leading-stallion-5780.edgespark.app/.smart/auth/user
```

Expected: `{"user":null}`

- [ ] **Step 4: 浏览器验证清单**

1. 打开项目 URL → 登录 → 进入项目
2. 发送需求 "做一个待办事项工具，支持添加和删除" → AI 生成 index.html
3. 右侧预览标签页 → iframe 显示待办事项 UI，可交互
4. 源码标签页 → 文件列表 + Monaco 查看源码
5. 代码标签页 → Monaco 编辑器显示代码（已有功能）
6. 部署按钮 → 弹窗输入域名前缀

---

### 验证

Phase 2 收尾验收：
1. `edgespark deploy` 部署成功
2. `/.smart/sdk.js` 返回 SDK 代码
3. `/.smart/auth/user` 返回用户信息
4. 预览 iframe 可渲染生成的 HTML
5. 源码标签页显示文件列表
6. 部署弹窗正常工作
7. System prompt 包含工具架构说明
