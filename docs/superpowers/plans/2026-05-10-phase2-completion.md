# Phase 2 接入与补全 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `worktree-phase1-continue` 分支的 Phase 2 代码合并到 master，补全集成缺口

**Architecture:** 14 个 commit 的 worktree 分支已实现核心能力（SSE 流式 Agent Loop、Monaco 编辑器、执行日志 UI、对话持久化），需合并后修复 5 个集成缺口

**Tech Stack:** React 18 + TypeScript + Vite + Hono + Drizzle ORM + DeepSeek API + Monaco Editor + EdgeSpark Platform

---

## 当前状态

`worktree-phase1-continue` 分支领先 master 24 个文件（+1973 / -73 lines），工作区干净无未提交变更。

已实现：
- SSE 流式 Agent Loop（`server/src/routes/vibe.ts`，DeepSeek Function Calling + 工具执行）
- 对话气泡 UI（`ChatMessages.tsx`，用户/助手/系统消息 + 自动滚动）
- Monaco 编辑器（`MonacoEditor.tsx`，只读代码查看）
- PreviewPanel 代码标签页（文件标签切换 + 语法高亮）
- 执行日志 UI（`ExecutionLogPanel.tsx`，可折叠步骤卡片 + 状态图标）
- 终端输出（`TerminalOutput.tsx`，伪终端样式）
- 对话持久化（`data.ts`，历史恢复 + 文件列表 API）
- `@monaco-editor/react` 依赖已添加

待补全：
1. ExecutionLogPanel 未集成到 ProjectDetail 页面布局
2. 客户端未处理 `tool_exec` SSE 事件
3. 执行步骤状态永远是 `completed`（缺少 pending→running→completed 流转）
4. 文件恢复靠解析代码块，未使用 R2 overview API
5. 预览 iframe / 源码标签页为占位符

---

### Task 1: 合并 worktree 分支到 master

**Files:**
- Merge: `worktree-phase1-continue` → `master`
- Install: `web/node_modules`（新增 monaco 依赖）

- [ ] **Step 1: 合并分支**

```bash
cd /Users/cuitao/Documents/Smart
git merge worktree-phase1-continue --no-edit
```

Expected: 合并成功（两分支无冲突，master 落后于 worktree）

- [ ] **Step 2: 安装新依赖**

```bash
cd /Users/cuitao/Documents/Smart/web && npm install
```

Expected: `@monaco-editor/react` 安装成功

- [ ] **Step 3: 验证文件结构**

```bash
ls web/src/components/chat/ChatMessages.tsx
ls web/src/components/chat/TerminalOutput.tsx
ls web/src/components/preview/MonacoEditor.tsx
ls web/src/components/preview/PreviewPanel.tsx
ls web/src/components/workspace/ExecutionLogPanel.tsx
ls web/src/hooks/useExecutionSteps.ts
ls server/src/routes/vibe.ts
ls server/src/routes/steps.ts
ls server/src/routes/data.ts
```

Expected: 所有文件存在

- [ ] **Step 4: Commit（如有冲突解决）**

---

### Task 2: 集成 ExecutionLogPanel 到 ProjectDetail

**Files:**
- Modify: `web/src/pages/ProjectDetail.tsx`

**问题：** ExecutionLogPanel 组件存在但未在页面中渲染，用户看不到执行日志。

- [ ] **Step 1: 在 ProjectDetail.tsx 左侧面板添加对话/日志标签切换**

当前左侧布局：
```
ProjectConfigBar
ChatMessages (flex-1, overflow-y-auto)
ChatInput
```

修改为标签切换：
```tsx
// 在 import 区域添加：
import { ExecutionLogPanel } from "@/components/workspace/ExecutionLogPanel";
import { useState } from "react";  // 已存在，无需重复

// 在组件内添加状态：
const [leftTab, setLeftTab] = useState<"chat" | "log">("chat");

// 在 return 的 JSX 中，替换 left 属性为：
left={
  <div className="h-full flex flex-col overflow-hidden">
    <ProjectConfigBar
      projectId={project.id}
      projectName={project.name}
      onNameChange={(name) => setProject((prev) => prev ? { ...prev, name } : null)}
    />
    {/* 标签切换栏 */}
    <div className="border-b border-neutral-200 bg-neutral-50 px-4 flex gap-0">
      {[
        { key: "chat", label: "对话" },
        { key: "log", label: "执行日志" },
      ].map((tab) => (
        <button
          key={tab.key}
          onClick={() => setLeftTab(tab.key as typeof leftTab)}
          className={`px-4 py-2 text-sm border-b-2 transition-colors ${
            leftTab === tab.key
              ? "border-blue-600 text-blue-600 font-medium"
              : "border-transparent text-neutral-500 hover:text-neutral-700"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
    {leftTab === "chat" ? (
      <>
        <ChatMessages messages={messages} />
        <ChatInput
          value={input}
          onChange={setInput}
          onSubmit={handleSend}
          onGenerate={handleSend}
          isLoading={isStreaming}
        />
      </>
    ) : (
      <div className="flex-1 overflow-y-auto">
        <ExecutionLogPanel projectId={numProjectId} />
      </div>
    )}
  </div>
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
cd /Users/cuitao/Documents/Smart/web && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/ProjectDetail.tsx
git commit -m "feat: 集成执行日志面板到项目详情页（对话/日志标签切换）"
```

---

### Task 3: 修复执行步骤状态流转

**Files:**
- Modify: `server/src/routes/vibe.ts:429-448`

**问题：** 步骤创建时直接标记为 `completed`，前端轮询（检测 `running` 状态）永远不会生效。

- [ ] **Step 1: 将步骤保存改为三阶段状态流转**

在 `vibe.ts` 的 `ctx.runInBackground` 块中，将步骤保存改为三阶段：

```typescript
// 在工具执行前（约第 318 行 for 循环开始处），先插入 running 状态的步骤
const stepValues = {
  toolId,
  stepOrder: existingSteps.length + 1,
  type: name,
  title: `${name}: ${argsStr.slice(0, 80)}`,
  detail: result.slice(0, 200),
  terminalOutput: result.slice(0, 500),
  startedAt: new Date().toISOString(),
  completedAt: new Date().toISOString(),
};

// 替换原来的 ctx.runInBackground 块（约第 430-448 行）：
ctx.runInBackground(
  (async () => {
    // Phase 1: pending → running
    const [step] = await db
      .insert(executionSteps)
      .values({
        ...stepValues,
        status: "running",
        startedAt: new Date().toISOString(),
      })
      .returning();
    if (!step) return;

    // Phase 2: running → completed
    await db
      .update(executionSteps)
      .set({
        status: "completed",
        detail: result.slice(0, 200),
        terminalOutput: result.slice(0, 500),
        completedAt: new Date().toISOString(),
      })
      .where(eq(executionSteps.id, step.id));
  })()
);
```

同时发送 SSE `step` 事件通知前端：

在 `sse(controller, { type: "tool_result", ... })` 之后添加：
```typescript
sse(controller, {
  type: "step",
  toolCallId: tc.id,
  status: "completed",
  title: `${name}: ${argsStr.slice(0, 80)}`,
});
```

- [ ] **Step 2: 客户端处理 step SSE 事件**

在 `ProjectDetail.tsx` 的 SSE switch 中添加 `step` 事件处理：

```typescript
// 在 switch 块中（约第 201 行 done 之前）添加：
case "step":
  // 执行步骤更新 — ExecutionLogPanel 通过轮询获取，此处可触发即时刷新
  break;
```

- [ ] **Step 3: 处理 tool_exec 事件**

客户端当前未处理 `tool_exec` 事件，添加处理：

```typescript
// 在 switch 块中 tool_start 之后添加：
case "tool_exec":
  if (event.name) {
    setMessages((prev) => [
      ...prev,
      { id: `exec-${event.toolCallId || Date.now()}`, role: "system", content: `⚙️ 执行: ${event.name}` },
    ]);
  }
  break;
```

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/vibe.ts web/src/pages/ProjectDetail.tsx
git commit -m "fix: 执行步骤状态流转（pending→running→completed）+ SSE step/tool_exec 事件处理"
```

---

### Task 4: 修复文件恢复优先级（R2 API 优先，代码块降级）

**Files:**
- Modify: `web/src/pages/ProjectDetail.tsx:53-98`

**问题：** 文件恢复只解析对话中的代码块，不查询 R2 overview API。如果对话历史超过 80 条限制，早期文件可能丢失。

- [ ] **Step 1: 优先从 R2 overview API 恢复文件列表**

修改 `loadAll` 中的文件恢复逻辑：

```typescript
// 替换代码块解析逻辑（约第 74-92 行）为：
// Restore files from R2 overview API first, fallback to code block parsing
try {
  const overviewRes = await fetch(`/api/projects/${numProjectId}/overview`, { credentials: "include" });
  if (overviewRes.ok) {
    const overview = await overviewRes.json() as Array<{ toolId: number; status: string; files: string[] }>;
    const allPaths: string[] = [];
    for (const tool of overview) {
      if (tool.files) allPaths.push(...tool.files);
    }
    if (allPaths.length > 0) {
      // Fetch first file's content to set generatedFiles (PreviewPanel needs content)
      const firstPath = allPaths[0];
      const fileRes = await fetch(`/api/projects/${numProjectId}/tools/${overview[0].toolId}/files/${encodeURIComponent(firstPath)}`, { credentials: "include" });
      if (fileRes.ok) {
        const content = await fileRes.text();
        setGeneratedFiles([{
          path: firstPath,
          language: firstPath.split(".").pop() || "text",
          content,
        }]);
      }
    }
  }
} catch { /* fallback to code block parsing below */ }

// Fallback: parse code blocks from conversation history (existing logic)
if (generatedFiles.length === 0) {
  const codeBlockRegex = /```(\w+)?:?(\S+)?\n([\s\S]*?)```/g;
  const restoredFiles: StoredFile[] = [];
  const seen = new Set<string>();
  for (const c of convData) {
    if (c.role !== "assistant") continue;
    let match;
    while ((match = codeBlockRegex.exec(c.content)) !== null) {
      const path = match[2] || `code.${match[1] || "txt"}`;
      if (seen.has(path)) continue;
      seen.add(path);
      restoredFiles.push({
        path,
        language: match[1] || "text",
        content: match[3],
      });
    }
  }
  if (restoredFiles.length > 0) setGeneratedFiles(restoredFiles);
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/pages/ProjectDetail.tsx
git commit -m "fix: 文件恢复优先使用 R2 overview API，代码块解析作为降级方案"
```

---

### Task 5: 部署验证

- [ ] **Step 1: 部署**

```bash
cd /Users/cuitao/Documents/Smart
edgespark deploy
```

Expected: 部署成功，显示项目 URL

- [ ] **Step 2: 功能验证清单**

在浏览器中验证：
1. 打开项目 URL → 看到登录页
2. 登录 → 跳转 Dashboard
3. 进入项目 → 看到对话/日志标签切换
4. 发送消息 → AI 流式回复显示在对话区
5. 切换到执行日志标签 → 看到执行步骤
6. 右侧预览区 → 代码标签页显示生成的文件
7. 刷新页面 → 对话历史和文件恢复

---

### 不在本次范围（后续 Phase 处理）

- 预览 iframe 实际运行（需构建服务 + HMR）
- 真正的 xterm.js 集成（当前伪终端满足展示需求）
- 源码标签页实现
- 部署按钮功能

---

### 验证

Phase 2 完成后验收标准：
1. `edgespark deploy` 部署成功
2. 项目详情页左侧支持对话/执行日志标签切换
3. AI 对话流式显示正常（SSE text 事件）
4. 执行日志展示步骤状态（running → completed 图标正确）
5. 工具调用通知显示（tool_start / tool_exec / tool_result）
6. Monaco 编辑器显示生成的代码文件
7. 刷新页面后对话历史和文件正确恢复
