---
name: comet-build
description: "Comet Phase 3: Plan and Build。使用 /comet-build 调用。创建计划并选择执行方式（子代理或直接执行）进行实施。"
---

# Comet Phase 3: Plan and Build（构建）

## 前置条件

- Design Doc 已创建（Phase 2 完成）
- 活动变更存在

## 步骤

### 0. 入口状态验证（入口检查）

执行入口验证：

```bash
COMET_ENV="${COMET_ENV:-$(find . "$HOME"/.*/skills "$HOME/.config" "$HOME/.gemini" -path '*/comet/scripts/comet-env.sh' -type f -print -quit 2>/dev/null)}"
if [ -z "$COMET_ENV" ]; then
  echo "ERROR: comet-env.sh not found. Ensure the comet skill is installed." >&2
  return 1
fi
. "$COMET_ENV"
bash "$COMET_STATE" check <name> build
```

验证通过后进入 Step 1。验证失败时脚本会输出具体失败原因。

**幂等性**：所有 build 阶段操作均可安全重复执行。读取 `.comet.yaml` 的 `phase` 字段确认仍在 build 阶段，读取 plan 文件头的 `base-ref`，然后读取 tasks.md 找到第一个未勾选任务。已提交的任务不得重复提交。

### 1. 创建计划

**立即执行：** 使用 Skill 工具加载 `superpowers:writing-plans` 技能。禁止跳过此步骤。

技能加载后，遵循其引导创建计划。计划要求：
- 保存到 `docs/superpowers/plans/YYYY-MM-DD-<feature>.md`
- 引用设计文档，分解为可执行任务
- **计划文件头必须包含关联元数据**：

```yaml
---
change: <openspec-change-name>
design-doc: docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md
base-ref: <git rev-parse HEAD before implementation>
---
```

`base-ref` 用于验证阶段衡量完整实施范围内的提交变更。创建计划时记录当前提交：

```bash
git rev-parse HEAD
```

### 2. 更新计划状态

记录计划路径：

```bash
bash "$COMET_STATE" set <name> plan docs/superpowers/plans/YYYY-MM-DD-feature.md
```

无需手动更新阶段 — guard 在退出条件满足时自动流转。

### 3. 选择工作流配置

计划已写入当前分支。开始执行前，**在一次交互中询问用户选择工作空间隔离方式和执行方式**：

**工作空间隔离**：

| 选项 | 方式 | 描述 |
|--------|--------|-------------|
| A | 创建分支 | 在当前仓库创建新分支，简单快速 |
| B | 创建工作树 | 隔离工作空间，完全独立，适合并行开发 |

**推荐规则**：
- 变更涉及 ≤ 3 个文件 → 推荐 A
- 需要并行开发，当前分支有未提交工作 → 推荐 B

**执行方式**：

| 选项 | 技能 | 适用场景 |
|------|------|-------------------|
| A | `superpowers:subagent-driven-development` | 独立任务、高复杂度、需要两阶段审查 |
| B | `superpowers:executing-plans` | 简单任务、无子代理环境、轻量快速 |

**执行方式推荐规则**：
- 任务数 ≥ 3 → 推荐 A
- 任务数 ≤ 2 且无跨模块依赖 → 推荐 B
- 来自 hotfix 路径 → 推荐 B

这是用户决策点。**必须使用 AskUserQuestion 工具暂停并等待用户明确选择隔离方式和执行方式**。不得根据推荐规则选择 `branch` 或 `worktree`，也不得根据推荐规则选择执行方式。推荐规则仅供参考，不能替代用户确认。不得仅输出文本提示后继续执行。

用户选择后，更新 `isolation` 和 `build_mode` 字段：

```bash
bash "$COMET_STATE" set <name> isolation <branch|worktree>
bash "$COMET_STATE" set <name> build_mode <subagent-driven-development|executing-plans|direct>
```

`isolation` 是脚本强制执行的硬约束。Full 工作流初始化时可暂时留为 `null`，但仅在此步骤之前。如果保持 `null`，`build → verify` guard 和 `comet-state transition build-complete` 均会失败。

`build_mode` 仅对 hotfix/tweak 预设默认为 `direct`。Full 工作流不得默认为 `direct`。仅在用户明确要求跳过计划执行技能时使用，并需记录显式覆盖：

```bash
bash "$COMET_STATE" set <name> direct_override true
bash "$COMET_STATE" set <name> build_mode direct
```

没有 `direct_override: true`，full 工作流中的 `build_mode=direct` 会被 guard 和状态流转同时阻止。

**执行隔离**：

- **branch**：运行 `git checkout -b <change-name>`，后续工作在新分支上进行
- **worktree**：必须使用 Skill 工具加载 `superpowers:using-git-worktrees` 技能创建隔离工作空间。不要用普通 shell 命令或原生工具绕过此技能；如果该技能不可用，停止流程并提示安装或启用 Superpowers 技能。

创建隔离后，确认计划文件可访问（分支方式自然可访问；工作树方式需确认计划已提交）。

**加载执行技能**：使用 Skill 工具加载对应技能。禁止跳过此步骤。

如果选定的 Superpowers 技能不可用，停止流程并提示安装或启用对应技能。不要用普通对话替代此步骤。

技能加载后，遵循其引导执行：
- 按计划执行任务
- 完成 tasks.md 勾选（`- [ ]` → `- [x]`）
- 每个任务完成后提交代码

### 4. Spec 增量更新

实施过程中发现初始 spec 不完整时，按规模处理：

| 规模 | 触发条件 | 处理方式 |
|------|-------------------|----------|
| 小 | 缺少验收场景、边界情况 | 直接编辑 delta spec + design.md，追加 tasks.md 任务 |
| 中 | 接口变更、新组件、数据流变更 | **必须使用 AskUserQuestion 工具暂停并等待用户明确确认**，然后必须使用 Skill 工具加载 `superpowers:brainstorming` 更新 Design Doc + delta spec |
| 大 | 全新能力需求 | **必须使用 AskUserQuestion 工具暂停并等待用户明确确认拆分**；用户确认后，通过 `/comet-open` 创建独立变更 |

**50% 阈值判定**：以 tasks.md 中初始任务数为基准，如果新增任务超过该总数的一半，视为超出原计划范围，**必须使用 AskUserQuestion 工具暂停并等待用户决定是否拆分为新变更**。不得仅输出文本提示后继续执行。

创建独立变更时，必须调用 `/comet-open`，而非直接调用 `/opsx:new`。`/comet-open` 同时创建 OpenSpec 产物和 `.comet.yaml`，防止新变更脱离 Comet 状态机。

**原则**：
- Delta spec 是活文档，可在此阶段随时修改
- 每次更新应附带提交信息说明变更原因
- 不要提前同步到 main spec，归档时统一同步
- 对于小规模增量直接 delta spec 编辑，在提交信息中注明，便于归档时评估 design doc 漂移

### 5. 上下文管理

Build 是最长的阶段，可能跨多个任务。为支持上下文压缩后恢复：

- **每个任务后**：立即勾选 tasks.md 并提交代码，使 `.comet.yaml` 和文件状态持久化
- **上下文压缩后**：首先运行 `bash "$COMET_STATE" check <change-name> build --recover` — 脚本输出结构化恢复上下文（isolation/build_mode 状态、plan 路径、任务进度、恢复操作）。按恢复操作指示确定下一步。
- **用户手动变更恢复**：通过 `comet/reference/dirty-worktree.md` 处理未提交变更。该协议定义了检查、归属和禁止项。Build 阶段特定处理：
  1. 归属确认后，如果 diff 暗示 plan 或 spec 变更，通过 Step 4 "Spec 增量更新"处理
- **长任务拆分**：如果单个任务超过 200 行代码变更，考虑拆分为多个子任务和提交

## 退出条件

- 所有 tasks.md 已勾选
- 代码已提交
- 项目特定的构建/测试已显式运行并通过；不要仅依赖 guard 自动检测
- `isolation` 已写入为 `branch` 或 `worktree`
- `build_mode` 已写入为 `subagent-driven-development`、`executing-plans` 或带显式覆盖的 `direct`
- **阶段守卫**：运行 `bash "$COMET_GUARD" <change-name> build --apply`；全部 PASS 后状态推进至 `phase: verify`

Guard 首先读取项目命令配置：

```yaml
build_command: <build command>
verify_command: <verify command>
```

配置可位于变更的 `.comet.yaml`，或仓库根目录的 `.comet.yaml` / `comet.yaml` / `.comet.yml` / `comet.yml`。
仅当没有配置命令时，guard 才回退到 `npm run build`、Maven 或 Cargo 自动检测。命令失败时，guard 打印命令输出作为调试证据。

退出前运行 guard 自动流转：

```bash
bash "$COMET_GUARD" <change-name> build --apply
```

状态文件自动更新为 `phase: verify`，`verify_result: pending`。

## 自动流转

退出条件满足后（包括用户选择工作流配置），自动流转至下一阶段：

> **必需的下一技能：** 调用 `comet-verify` 技能进入验证和完成阶段。
