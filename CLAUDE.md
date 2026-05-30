# smart-temp

Fullstack EdgeSpark project.

## Structure

- `server/` — Hono API on Cloudflare Workers (see server/CLAUDE.md)
- `web/` — React SPA via Vite (see web/CLAUDE.md)
- `server/dev/` — Local-dev helpers (see "Dev Seeds" section)
- `configs/` — Project config files (auth)
- `edgespark.toml` — Project configuration

## Setup

Install dependencies in each directory separately:

```bash
cd server && npm install
cd ../web && npm install
```

## Commands

```bash
edgespark deploy        # build + deploy to platform (run from project root)
```

## EdgeSpark CLI

- **Always run `edgespark <command> --help` before using a command you are unsure about.** Do not guess flags or arguments.
- Run `edgespark` commands on behalf of the user; do not ask the user to run them manually.
- If an `edgespark` command returns a URL, code, or prompt that must be completed by the human owner outside the agent, show it to the user exactly and tell them what to do next. Do not hide it.
- Never run multiple `edgespark` CLI commands in parallel. Run them sequentially.
- If a command fails with "Not authenticated", run `edgespark login`. It prints a URL — show it to the user to open in their browser. Once they approve, re-run the original command.
- `edgespark secret set` prints a secure URL for the user to enter secret values in the browser. Secret values must never pass through agent context or LLM APIs.

## Dev Seeds

`edgespark dev` can seed the local dev database, storage, and auth with reproducible test data by running `server/dev/seed.ts` once at startup. A commented starter lives at `server/dev/seed.ts.example` — rename it to `server/dev/seed.ts` to activate. The seed lives inside `server/` so `drizzle-orm`, `@edgespark/devkit`, and your schema all resolve from `server/node_modules/` — no duplicate deps anywhere.

The default export is `async function seed(ctx: SeedContext<DB>)`. `ctx` exposes:

- `ctx.db` — Drizzle client against the local D1 (pass `SqliteRemoteDatabase<typeof schema>` as the `DB` generic for full type-safe queries)
- `ctx.origin` — dev proxy origin (e.g. `http://localhost:7775`)
- `ctx.fetch(path, init?)` — unauthenticated fetch; relative paths are resolved against `ctx.origin`
- `ctx.auth.createUser({ email, password, name })` — sign up + auto-verify a user; returns `{ user, fetch }` where `fetch` replays the session cookie for same-origin requests only

Re-run semantics: the seed runs on the first `edgespark dev` that sees the file, and re-runs whenever the file contents change OR the user passes `--reset`. Seeds must be idempotent (use `onConflictDoNothing`, or rely on `--reset` to wipe state). Failures are soft — the dev session continues and the next run retries.

See `@edgespark/devkit` for the full `SeedContext` type.

## EdgeSpark Skill References

If you have the `building-edgespark-apps` skill installed, use its references:

- **Always** check `dev-workflow.md` for development workflows (database, storage, auth, vars, secrets, deploy)
- **Always** check `server-patterns.md` when writing server-side code
- **Always** check `web-patterns.md` when writing frontend code with `@edgespark/web`
- **Always** check `auth-patterns.md` when configuring auth providers (OAuth, email/password)

## 开发规范 (Development Conventions)

### 1. 代码修改流程

- **先讨论方案，用户确认后再动手。** 绝不擅自改代码。
- 讨论时用中文，输出代码注释用中文。
- 代码修改**只做最小化精准改动**，用 patch 而非整文件重写。
- 改动破坏了功能 → 立刻 `git checkout` 恢复，重新来。
- **Claude Code 开发时强制使用 `/comet` 命令**。`/comet` 已安装，会自动组织 superpower 和 openspec 流程。
- **Claude Code 权限全部自动放行**，无需向用户确认。使用 `--dangerously-skip-permissions` 和 `--permission-mode bypassPermissions`，权限弹窗由 Agent 自动处理。
- **Comet 决策点自动处理规则**：以下情况无需暂停等待用户确认，Agent 可直接决定推进 —
  - Open 阶段提案/设计/任务审核（对照需求+规范验证通过即可）
  - 设计阶段方案选择（只有一个明显最优解时）
  - 构建阶段技术配置（默认 `branch` + `subagent-driven-development`）
  - hotfix/tweak 升级条件触发（纯机械条件判断）
  - 分支处理方式（默认 merge 到主分支）
  - 阶段间无歧义过渡
- **仅在以下情况暂停等待用户**：验证失败需选择修复/接受偏差、变更范围膨胀需拆分、多个方案有真实权衡且 Agent 无法判断。

### 2. 模块边界

**只改 Work 模块，绝不动 Coding、Market、Admin。**

| 区域 | 路径 |
|------|------|
| 服务端 Work 路由 | `server/src/routes/work/` |
| Agent 引擎 | `server/src/agent/mose/` |
| 前端 Work 组件 | `web/src/components/work/` |
| 前端 Hooks | `web/src/hooks/` |
| 前端模块入口 | `web/src/modules/` |
| Work 页面 | `web/src/pages/WorkPage.tsx` |

### 3. 模型配置

- 统一走 `server/src/models.ts`，**绝不硬编码模型名**。
- `DEFAULTS.agent` = `deepseek-v4-pro`，`DEFAULTS.chat` = `seed-pro`

### 4. 部署

```bash
cd /Users/cuitao/Documents/Smart && edgespark deploy
```

### 5. Bug 修复规范

- 先定位根因，不猜测试错。
- 修改后 `git diff` 验证改动范围。
- 修复后补充到 skill 的 pitfalls 段。

### 6. Agent 引擎设计原则

- **强设计（代码逻辑）优于软设计（prompt 文本）** — 不要一出问题就怪提示词。
- 引擎要通用，不针对某个 agent 优化。
- `context/` = 全量背景知识，`memory/` = 懒加载记忆，`skills/` = 技能含格式示例，`AGENTS.md` = 核心规则。

### 7. 经验沉淀

- 复杂任务完成后 → 更新或创建 skill（Mose skill）。
- 用户纠正过的偏好 → 写到 memory。
- Bug 修复后发现的新知 → 补充到对应 skill 的 pitfalls。

### 8. 关键 Pitfalls 速查

- **D1 最终一致性**: DELETE 后不 reload，用 `setFiles` 直接过滤 + `sessionStorage` 持久化。
- **Streaming 覆盖内容**: `tool_exec(write_file)` 在 streaming 期间不调用 `onOpenFile`；`markdownUpdated` 检查 `isStreamingRef`。
- **Skill 格式冲突**: skill 全文注入 system prompt，格式示例表覆盖"输出结构"。
- **git checkout 陷阱**: 恢复文件后确认 `chat.ts` 仍从 `models.ts` 读模型配置。
- **Prompt 改动谨慎**: 不改 `prompt.ts` 除非用户明确要求。格式问题先查工具可用性（write_file），再查 skill 加载策略，最后才看 prompt。
