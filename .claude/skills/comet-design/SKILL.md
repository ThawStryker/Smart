---
name: comet-design
description: "Comet Phase 2: Deep Design。使用 /comet-design 调用。通过 brainstorming 生成 Design Doc 和 delta spec。"
---

# Comet Phase 2: Deep Design（设计）

## 前置条件

- 活动变更存在（proposal.md、design.md、tasks.md）
- 无 Design Doc（`docs/superpowers/specs/` 下无对应文件）

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
bash "$COMET_STATE" check <name> design
```

验证通过后进入 Step 1。验证失败时脚本会输出具体失败原因。

**幂等性**：所有 design 阶段操作均可安全重复执行。如果 `handoff_context` 和 `handoff_hash` 已存在，确认它们与当前产物匹配后再决定是否重新生成。

### 1a. 生成 OpenSpec → Superpowers 交接包

**必须由脚本生成。禁止 agent 自行编写摘要。**

```bash
bash "$COMET_HANDOFF" <change-name> design --write
```

脚本生成并记录：

```
openspec/changes/<name>/.comet/handoff/design-context.json
openspec/changes/<name>/.comet/handoff/design-context.md
```

并写入 `.comet.yaml`：

```yaml
handoff_context: openspec/changes/<name>/.comet/handoff/design-context.json
handoff_hash: <sha256>
```

默认交接包是**紧凑的可溯源摘录**，而非 agent 摘要：
- `design-context.json`：机器索引，包含变更、阶段、规范规格、源路径、哈希
- `design-context.md`：供 Superpowers 读取的上下文，包含脚本标记、源路径、行范围、sha256、确定性摘录
- 超出摘录预算时，标记 `[TRUNCATED]` 并保留完整源路径

如果确实需要完整上下文，显式运行：

```bash
bash "$COMET_HANDOFF" <change-name> design --write --full
```

交接包来源为 OpenSpec open 阶段产物：
- `proposal.md`：目标、动机、范围、非目标
- `design.md`：高层架构决策、方案约束
- `tasks.md`：初始任务边界
- `specs/*/spec.md`：增量能力规格

### 1b. 执行 Brainstorming（带上下文）

**立即执行：** 使用 Skill 工具加载 `superpowers:brainstorming` 技能，ARGUMENTS 包含：

```
Change: <change-name>
OpenSpec Context Pack: openspec/changes/<name>/.comet/handoff/design-context.md
Machine handoff: openspec/changes/<name>/.comet/handoff/design-context.json

OpenSpec artifacts are the upstream source of truth. Do not redefine requirements, do not rewrite proposal/spec.
Your task is to perform deep technical design based on the handoff package: implementation approach, technical risks, testing strategy, boundary conditions.
If you find OpenSpec delta spec missing acceptance scenarios, you may only propose Spec Patches and write them back to OpenSpec delta spec; do not create a second requirements spec in the Design Doc.

Design Doc frontmatter must be minimal, containing only:
---
comet_change: <change-name>
role: technical-design
canonical_spec: openspec
---

Skip redundant context exploration, proceed directly to design questions.
```

禁止跳过此步骤。禁止在未加载此技能的情况下继续。

如果 `superpowers:brainstorming` 不可用，停止流程并提示安装或启用 Superpowers 技能。不要用普通对话替代此步骤。

技能加载后，遵循其引导生成设计方案（以对话形式呈现）：
- 技术路线：架构、数据流、关键技术选择与风险
- 测试策略
- 如需补充验收场景，指明要写回的 delta spec 变更

Brainstorming 阶段不写入 Design Doc 文件；仅生成设计方案供 Step 1c 用户确认。仅在确认后才创建 `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` 并写回 delta spec。

### 1c. 用户确认设计方案（阻断点）

Brainstorming 生成设计方案后，**必须使用 AskUserQuestion 工具暂停并等待用户明确确认设计方案**。不得在用户确认前创建最终 Design Doc、写入 `design_doc`、运行 design 守卫或进入 `/comet-build`。不得仅输出文本提示后继续执行。

暂停时仅呈现关键摘要：
- 采用的技术路线
- 关键权衡与风险
- 测试策略
- 如有 Spec Patches，列出要写回的 delta spec 变更

仅在用户明确确认后，进入 Step 2。如用户要求调整，继续 brainstorming 迭代直至用户确认。

### 2. 更新 Comet 状态

首先记录 design_doc 路径。如果 Step 1c 写回了 delta spec（新增或修改了 `specs/*/spec.md`），必须重新生成交接包以更新哈希：

```bash
# 记录 design_doc 路径
bash "$COMET_STATE" set <name> design_doc docs/superpowers/specs/YYYY-MM-DD-topic-design.md

# 如果存在 delta spec 变更，重新生成交接包（更新哈希）
bash "$COMET_HANDOFF" <change-name> design --write

# 自动流转至下一阶段
bash "$COMET_GUARD" <change-name> design --apply
```

如果没有 delta spec 变更，跳过交接包重新生成步骤。状态文件自动更新；无需手动编辑其他字段。

## 退出条件

- Design Doc 已创建并保存
- Design Doc 文件头包含 `comet_change`、`role: technical-design`、`canonical_spec: openspec`
- `handoff_context` 和 `handoff_hash` 已写入 `.comet.yaml`（由 guard 强制执行）
- `handoff_hash` 与当前 OpenSpec open 阶段产物匹配（由 guard 强制执行）
- `design-context.md` 必须由脚本生成，包含源路径、模式、sha256 可溯源标记（由 guard 强制执行）
- 如有新能力或补充验收场景，OpenSpec delta spec 已创建/更新
- `design_doc` 已写入 `.comet.yaml`
- **阶段守卫**：运行 `bash "$COMET_GUARD" <change-name> design --apply`；全部 PASS 后自动流转至 `phase: build`

退出前必须使用 `--apply`：

```bash
bash "$COMET_GUARD" <change-name> design --apply
```

## 上下文压缩恢复

Design 阶段可能在 brainstorming 过程中触发上下文压缩。恢复时首先运行：

```bash
bash "$COMET_STATE" check <change-name> design --recover
```

脚本输出结构化恢复上下文（阶段、已完成字段、待处理字段、恢复操作）。按恢复操作指示确定下一步。

## 自动流转

退出条件满足后（包括用户确认设计方案），自动流转至下一阶段：

> **必需的下一技能：** 调用 `comet-build` 技能进入规划和构建阶段。
