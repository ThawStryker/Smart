# 内置能力集成 + 斜杠命令 + Superpowers 分级流程 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 smart-deploy/superpowers 隐藏为内置能力，Agent 按任务复杂度分级使用 Superpowers 流程，增加 `/` 斜杠命令系统

**Architecture:** DB 新增 hidden 列 → API 过滤 → 前端隐藏 + Agent System Prompt 更新 → ChatInput 新增斜杠命令弹窗

**Tech Stack:** Hono + Drizzle ORM + React + TypeScript

---

### Task 1: Database — Add `hidden` column to skills and mcps

**Files:**
- Modify: `server/src/defs/db_schema.ts:134-161`

- [ ] **Step 1: Add `hidden` field to skills table**

In `server/src/defs/db_schema.ts`, add `hidden` to the skills table definition (after `errorMessage`):

```typescript
export const skills = sqliteTable("skills", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  visibility: text("visibility").default("private"),
  ownerId: text("owner_id").notNull(),
  sourceType: text("source_type").notNull(),
  sourceUrl: text("source_url"),
  storagePath: text("storage_path").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).default(true),
  status: text("status").default("installing"),
  errorMessage: text("error_message"),
  hidden: integer("hidden", { mode: "boolean" }).default(false),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});
```

- [ ] **Step 2: Add `hidden` field to mcps table**

In the same file, add `hidden` to the mcps table definition (after `enabled`):

```typescript
export const mcps = sqliteTable("mcps", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  visibility: text("visibility").default("private"),
  ownerId: text("owner_id").notNull(),
  config: text("config"),
  enabled: integer("enabled", { mode: "boolean" }).default(true),
  hidden: integer("hidden", { mode: "boolean" }).default(false),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});
```

- [ ] **Step 3: Generate migration**

Run: `cd server && npx drizzle-kit generate`
Expected: New SQL migration file created in `drizzle/`

- [ ] **Step 4: Apply migration**

Run: `cd /Users/cuitao/Documents/Smart && edgespark db migrate`
Expected: Migration applied successfully

- [ ] **Step 5: Commit**

```bash
git add server/src/defs/db_schema.ts server/drizzle/
git commit -m "feat: add hidden column to skills and mcps tables"
```

---

### Task 2: API — Filter hidden records from frontend GET endpoints

**Files:**
- Modify: `server/src/routes/mcps.ts:8-21`
- Modify: `server/src/routes/skills.ts:46-63`

- [ ] **Step 1: Filter hidden MCPs in GET /api/mcps**

In `server/src/routes/mcps.ts`, update the GET handler to exclude `hidden === true`:

```typescript
.get("/api/mcps", async (c) => {
    const userId = auth.user!.id;
    const rows = await db
      .select()
      .from(mcps)
      .where(
        and(
          eq(mcps.hidden, false),
          or(
            eq(mcps.visibility, "global"),
            and(eq(mcps.visibility, "private"), eq(mcps.ownerId, userId))
          )
        )
      )
      .orderBy(mcps.createdAt);
    return c.json(rows);
  })
```

Note: Add `and` to the drizzle-orm import at line 4:
```typescript
import { eq, and, or } from "drizzle-orm";
```
(already present, no change needed)

- [ ] **Step 2: Filter hidden Skills in GET /api/skills**

In `server/src/routes/skills.ts`, update the GET handler:

```typescript
.get("/api/skills", async (c) => {
    try {
      const userId = auth.user!.id;
      const rows = await db
        .select()
        .from(skills)
        .where(
          and(
            eq(skills.hidden, false),
            or(
              eq(skills.visibility, "global"),
              and(eq(skills.visibility, "private"), eq(skills.ownerId, userId))
            )
          )
        )
        .orderBy(skills.createdAt);
      return c.json(rows);
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  })
```

- [ ] **Step 3: Type check**

Run: `cd /Users/cuitao/Documents/Smart/server && npm run typecheck 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/mcps.ts server/src/routes/skills.ts
git commit -m "feat: filter hidden MCPs/Skills from frontend API responses"
```

---

### Task 3: API — Add GET /api/skills/commands endpoint

**Files:**
- Modify: `server/src/routes/skills.ts` (append new route)

- [ ] **Step 1: Add the commands endpoint**

Append to the skillsRoutes chain in `server/src/routes/skills.ts`:

```typescript
  .get("/api/skills/commands", async (c) => {
    const userId = auth.user!.id;
    const rows = await db
      .select()
      .from(skills)
      .where(
        and(
          eq(skills.enabled, true),
          eq(skills.status, "installed"),
          or(
            eq(skills.visibility, "global"),
            and(eq(skills.visibility, "private"), eq(skills.ownerId, userId))
          )
        )
      );

    const result: Array<{ skillName: string; skillId: number; commands: Array<{ name: string; description: string }> }> = [];

    for (const skill of rows) {
      if (!skill.storagePath) continue;
      const skillMd = await storage.from(buckets.sourceBuckets).get(skill.storagePath + "SKILL.md");
      let content: string | null = null;
      if (skillMd) {
        content = new TextDecoder().decode(skillMd.body);
      } else {
        const list = await storage.from(buckets.sourceBuckets).list({ prefix: skill.storagePath, limit: 50 });
        const mdPath = list.files.find(f => f.path.endsWith("/SKILL.md") || f.path.endsWith("SKILL.md"));
        if (mdPath) {
          const obj = await storage.from(buckets.sourceBuckets).get(mdPath.path);
          if (obj) content = new TextDecoder().decode(obj.body);
        }
      }
      if (!content) continue;

      // Parse "### Commands" section
      const commandsMatch = content.match(/###\s+Commands\s*\n([\s\S]*?)(?=\n###|\n##|$)/i);
      if (!commandsMatch) continue;

      const commands: Array<{ name: string; description: string }> = [];
      const lines = commandsMatch[1].split("\n");
      for (const line of lines) {
        const cmdMatch = line.match(/-\s+`(\/[a-z_-]+)`\s*[—–-]?\s*(.*)/i);
        if (cmdMatch) {
          commands.push({ name: cmdMatch[1], description: cmdMatch[2].trim() });
        }
      }
      if (commands.length > 0) {
        result.push({ skillName: skill.name, skillId: skill.id, commands });
      }
    }

    return c.json(result);
  });
```

- [ ] **Step 2: Type check**

Run: `cd /Users/cuitao/Documents/Smart/server && npm run typecheck 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/skills.ts
git commit -m "feat: add GET /api/skills/commands endpoint for slash command discovery"
```

---

### Task 4: Agent — Update System Prompt and remove hardcoded smart_deploy

**Files:**
- Modify: `server/src/routes/vibe.ts:150-248` (System Prompt)
- Modify: `server/src/routes/vibe.ts:660-663` (remove smart_deploy case)

- [ ] **Step 1: Add Superpowers grading strategy to System Prompt**

In `server/src/routes/vibe.ts`, after the "## 上下文管理" section (around line 240), insert before the closing backtick:

```typescript
## Superpowers 研发流程

你是 Smart Agent，内置 Superpowers 研发方法论。根据用户任务复杂度，自动采用分级流程：

### 复杂度判断

| 等级 | 判断标准 | 流程 |
|------|---------|------|
| **轻量** | 样式微调、文案修改、单行 fix、简单问答 | 直接实施 → 验证结果 |
| **中等** | Bug 修复、小功能追加、单文件改动 | 简要分析 → 实施 → 验证 → 完成 |
| **重量** | 新功能、架构改动、跨文件重构、多步骤任务 | 需求分析 → 设计方案 → 编写计划 → 分步实施 → 验证 → 审查 → 完成 |

### 执行规则

- 接到任务后，**先声明任务等级和将采用的流程**，再开始工作
- 重量级任务：先理解现状，提出 2-3 种方案和权衡，让用户确认后再实施
- 中等任务：简要说明问题原因和修复思路，然后实施
- 轻量任务：直接动手，完成后验证
- 所有任务完成后必须验证结果——文件存在、内容正确、编译通过
- 对于重量级任务，在实施完成后提示用户可以生成项目说明文档
```

- [ ] **Step 2: Replace hardcoded smart_deploy with dynamic MCP-based deploy**

First, update the TOOLS array to include web_search and smart_market as built-in tool definitions (they're not MCP-backed, they use the DuckDuckGo API and DB queries). The smart_deploy case should be replaced with a proper MCP tool that gets dynamically registered.

In the switch statement (line 660-663), remove the `smart_deploy` case:
```typescript
                  // REMOVE these lines:
                  case "smart_deploy": {
                    result = "使用 Smart 部署功能需要用户在 Smart 前端操作。当前项目部署地址：部署按钮在编辑页面右上角。已部署的项目可在工具市场中查看。";
                    break;
                  }
```

Keep `web_search` and `smart_market` as they are (they're built-in infrastructure tools, not MCP-backed).

- [ ] **Step 3: Update the MCP tool registration to always include smart-deploy for all conversations**

In the MCP injection section (around line 287-309), add logic to always include the smart-deploy MCP if it exists in DB (regardless of whether user selected it):

After `const activeTools: Array<Record<string, unknown>> = [...TOOLS];`, add:

```typescript
    // Always inject smart-deploy as a built-in tool
    const [smartDeployMcp] = await db.select().from(mcps).where(eq(mcps.name, "smart-deploy"));
    if (smartDeployMcp && smartDeployMcp.enabled && smartDeployMcp.config) {
      try {
        const cfg = JSON.parse(smartDeployMcp.config);
        const name = "smart_deploy";
        activeTools.push({
          type: "function",
          function: {
            name,
            description: cfg.description || smartDeployMcp.description || "Deploy the current project",
            parameters: cfg.parameters || { type: "object", properties: {} },
          },
        });
      } catch {}
    }
```

- [ ] **Step 4: Type check**

Run: `cd /Users/cuitao/Documents/Smart/server && npm run typecheck 2>&1 | head -20`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/vibe.ts
git commit -m "feat: add Superpowers grading workflow to System Prompt, smart-deploy as dynamic MCP tool"
```

---

### Task 5: Frontend — Slash command popup in ChatInput

**Files:**
- Modify: `web/src/components/chat/ChatInput.tsx`

- [ ] **Step 1: Add commands state and fetch logic**

Add to the top of `ChatInput` function, after the existing state declarations:

```typescript
  const [commands, setCommands] = useState<Array<{ skillName: string; skillId: number; commands: Array<{ name: string; description: string }> }>>([]);
  const [showCommands, setShowCommands] = useState(false);
  const [commandFilter, setCommandFilter] = useState("");
  const [commandIndex, setCommandIndex] = useState(0);
```

Add a useEffect to fetch commands:

```typescript
  useEffect(() => {
    client.api.fetch("/api/skills/commands").then(r => r.json()).then(data => {
      if (Array.isArray(data)) setCommands(data);
    }).catch(() => {});
  }, []);
```

- [ ] **Step 2: Add slash key handler and filtered command list**

Add helper logic before the return statement:

```typescript
  const allCommands = commands.flatMap(c => c.commands.map(cmd => ({ ...cmd, skillName: c.skillName })));
  const filteredCommands = commandFilter
    ? allCommands.filter(c => c.name.toLowerCase().includes(commandFilter.toLowerCase()))
    : allCommands;

  const handleSlashSelect = (cmdName: string) => {
    // Replace the '/' and filter text with the selected command
    const beforeSlash = value.slice(0, value.lastIndexOf("/"));
    onChange(beforeSlash + cmdName + " ");
    setShowCommands(false);
    setCommandFilter("");
    setCommandIndex(0);
  };

  const handleInputChange = (newValue: string) => {
    onChange(newValue);
    // Detect '/' trigger
    const cursorPos = newValue.length; // simplified - assume typing at end
    const textBeforeCursor = newValue.slice(0, cursorPos);
    const lastSlashIdx = textBeforeCursor.lastIndexOf("/");
    if (lastSlashIdx !== -1) {
      const afterSlash = textBeforeCursor.slice(lastSlashIdx + 1);
      // Only trigger if no space after the slash
      if (!afterSlash.includes(" ")) {
        setShowCommands(true);
        setCommandFilter(afterSlash);
        setCommandIndex(0);
        return;
      }
    }
    setShowCommands(false);
    setCommandFilter("");
  };

  const handleCommandKeyDown = (e: React.KeyboardEvent) => {
    if (!showCommands) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCommandIndex(prev => Math.min(prev + 1, filteredCommands.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCommandIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && filteredCommands.length > 0) {
      e.preventDefault();
      handleSlashSelect(filteredCommands[commandIndex].name);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setShowCommands(false);
      setCommandFilter("");
    }
  };
```

- [ ] **Step 3: Replace onChange handler and add command popup UI**

Change the textarea's `onChange` from `onChange={(e) => onChange(e.target.value)}` to:
```tsx
onChange={(e) => handleInputChange(e.target.value)}
```

Add `onKeyDown` for command navigation (merge with existing handler):

```tsx
onKeyDown={(e) => {
  if (showCommands) { handleCommandKeyDown(e); return; }
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
}}
```

Add the command popup right after the textarea (before the toolbar div):

```tsx
        {showCommands && (
          <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-neutral-200 rounded-xl shadow-xl z-[100] max-h-64 overflow-y-auto">
            {filteredCommands.length === 0 ? (
              <p className="text-xs text-neutral-400 p-3">无匹配命令</p>
            ) : (
              filteredCommands.map((cmd, i) => (
                <button
                  key={cmd.name}
                  onClick={() => handleSlashSelect(cmd.name)}
                  className={`w-full text-left px-4 py-2.5 flex items-center gap-3 text-xs hover:bg-neutral-50 transition-colors ${i === commandIndex ? "bg-amber-50" : ""}`}
                >
                  <span className="text-amber-600 font-mono font-medium">{cmd.name}</span>
                  <span className="text-neutral-400 flex-1 truncate">{cmd.description}</span>
                  <span className="text-neutral-300 text-[10px]">{cmd.skillName}</span>
                </button>
              ))
            )}
          </div>
        )}
```

Note: The parent container `<div className="border rounded-lg ...">` needs `relative` positioning added:
```tsx
<div className={`border rounded-lg relative transition-colors ${isLoading ? "border-amber-300" : "border-neutral-200"}`}>
```

- [ ] **Step 4: Type check**

Run: `cd /Users/cuitao/Documents/Smart/web && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add web/src/components/chat/ChatInput.tsx
git commit -m "feat: add slash command popup with skill command discovery"
```

---

### Task 6: Admin — Add hidden checkbox to global Skill/MCP creation

**Files:**
- Modify: `web/src/pages/AdminPage.tsx:175-191`
- Modify: `server/src/routes/admin.ts:102-130`

- [ ] **Step 1: Add hidden state and checkbox to AdminPage frontend**

Add state variables near the other admin state:
```typescript
  const [skillHidden, setSkillHidden] = useState(false);
  const [mcpHidden, setMcpHidden] = useState(false);
```

In the skill tab, add a checkbox before the submit button:
```tsx
<label className="flex items-center gap-2 text-sm text-neutral-600">
  <input type="checkbox" checked={skillHidden} onChange={e => setSkillHidden(e.target.checked)} className="rounded" />
  隐藏（不在前端展示，仅 Agent 可用）
</label>
```

In the mcp tab, add the same:
```tsx
<label className="flex items-center gap-2 text-sm text-neutral-600">
  <input type="checkbox" checked={mcpHidden} onChange={e => setMcpHidden(e.target.checked)} className="rounded" />
  隐藏（不在前端展示，仅 Agent 可用）
</label>
```

- [ ] **Step 2: Pass hidden to admin API calls**

Update `addGlobalSkill` to include hidden:
```typescript
body: JSON.stringify({ name: skillName, description: skillDesc, gitUrl: skillGitUrl || undefined, hidden: skillHidden }),
```

Update `addGlobalMcp` to include hidden:
```typescript
body: JSON.stringify({ name: mcpName, description: mcpDesc, config: mcpConfig ? JSON.parse(mcpConfig) : undefined, hidden: mcpHidden }),
```

- [ ] **Step 3: Accept hidden in server-side admin routes**

In `server/src/routes/admin.ts`, update the skill creation to accept hidden:

```typescript
.post("/api/admin/skills", async (c) => {
    const body = await c.req.json<{ name: string; description?: string; gitUrl?: string; hidden?: boolean }>();
    if (!body.name) return c.json({ error: "name required" }, 400);

    const [row] = await db.insert(skills).values({
      name: body.name,
      description: body.description || "",
      visibility: "global",
      ownerId: auth.user!.id,
      sourceType: body.gitUrl ? "git" : "zip",
      sourceUrl: body.gitUrl || null,
      storagePath: `skills/global/${Date.now()}/`,
      hidden: body.hidden ?? false,
    }).returning();
    return c.json(row, 201);
  })
```

Update the MCP creation similarly:

```typescript
.post("/api/admin/mcps", async (c) => {
    const body = await c.req.json<{ name: string; description?: string; config?: Record<string, unknown>; hidden?: boolean }>();
    if (!body.name) return c.json({ error: "name required" }, 400);

    const [row] = await db.insert(mcps).values({
      name: body.name,
      description: body.description || "",
      visibility: "global",
      ownerId: auth.user!.id,
      config: body.config ? JSON.stringify(body.config) : null,
      hidden: body.hidden ?? false,
    }).returning();
    return c.json(row, 201);
  })
```

- [ ] **Step 4: Type check both projects**

Run: `cd /Users/cuitao/Documents/Smart/web && npx tsc --noEmit 2>&1 | head -20`
Run: `cd /Users/cuitao/Documents/Smart/server && npm run typecheck 2>&1 | head -20`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/AdminPage.tsx server/src/routes/admin.ts
git commit -m "feat: add hidden checkbox to admin global Skill/MCP creation"
```

---

### Task 7: Deploy and verify

- [ ] **Step 1: Deploy**

Run: `cd /Users/cuitao/Documents/Smart && edgespark deploy`
Expected: Deploy succeeds

- [ ] **Step 2: Verify hidden filtering**

Open the app, navigate to Skills and MCPs pages — hidden records should not appear.
In chat, the MCP/Skill selector popups should not show hidden records.

- [ ] **Step 3: Verify slash commands**

In a project chat, type `/` — the command popup should appear.
Type `/brai` — should filter commands.
Press ArrowDown/ArrowUp — should navigate.
Press Enter — should insert selected command.
Press Escape — should close popup.

- [ ] **Step 4: Verify Agent grading**

Start a chat and ask for a complex feature — Agent should declare the task level and workflow.
Ask for a simple change — Agent should skip the full workflow.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: built-in integration, slash commands, Superpowers grading workflow"
```
