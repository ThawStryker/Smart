---
name: comet-verify
description: "Comet Phase 4: Verify and Close。使用 /comet-verify 调用。验证实现与设计匹配，处理开发分支。"
---

# Comet Phase 4: Verify and Close（验证）

## 前置条件

- 代码已提交（Phase 3 完成）
- 所有 tasks.md 任务已完成

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
bash "$COMET_STATE" check <change-name> verify
```

验证通过后进入 Step 1。验证失败时脚本会输出具体失败原因。

**幂等性**：所有 verify 阶段检查均可安全重复执行。如果 `verify_result` 已为 `pass` 且 `branch_status` 为 `handled`，验证已完成 — 执行 guard 流转。如果 `verify_result` 为 `pending`，从头开始验证。

### 1. 规模评估

执行规模评估：

```bash
bash "$COMET_STATE" scale <change-name>
```

脚本自动统计任务数、delta spec 数量、变更文件数，判定轻量或完整验证模式，并设置 verify_mode 字段。

验证开始前，通过 `comet/reference/dirty-worktree.md` 协议处理未提交变更。Verify 阶段特殊处理：

1. 如果脏 diff 属于当前变更且涉及实现、测试、任务、delta spec 或 design doc 变更，不要在 verify 阶段直接修复或提交；报告失败并进入 Step 1b 验证失败决策阻断点
2. 如果脏 diff 仅为 verify 阶段产物（如验证报告草稿、分支处理记录），可继续并在 verify 阶段记录状态
3. 如果脏 diff 显示实现已完成但 tasks.md 未勾选，视为 build 状态滞后；报告失败并进入 Step 1b，让用户决定回滚修复或接受偏差

仅在用户选择修复后，才允许回滚到 build 阶段：

```bash
# 仅在用户确认修复后执行
bash "$COMET_STATE" transition <change-name> verify-fail
```

注意：如果 build 阶段每个任务都已提交，脚本基于工作树 diff 的文件计数可能低估变更规模。此时必须读取 plan 文件头 `base-ref` 并用提交范围验证：

```bash
PLAN=$(bash "$COMET_STATE" get <change-name> plan)
BASE_REF=$(grep '^base-ref:' "$PLAN" 2>/dev/null | head -1 | sed 's/^base-ref: *//')
git diff --stat "$BASE_REF"...HEAD
```

如果提交范围显示变更超出轻量阈值（> 4 个文件、跨模块协调或 delta spec 跨越超过 1 个能力），手动设置为完整验证：

```bash
bash "$COMET_STATE" set <change-name> verify_mode full
```

### 1b. 验证失败决策（阻断点）

验证未通过时，**必须使用 AskUserQuestion 工具暂停并等待用户决定修复或接受偏差**。不得自动运行 `bash "$COMET_STATE" transition <change-name> verify-fail`，也不得自动调用 `/comet-build`。不得仅输出文本提示后继续执行。

暂停时必须列出：
- 失败项
- 是否为 CRITICAL（构建失败、测试失败、安全问题、核心验收场景失败）
- 推荐处理方式

**不确定性原则**：严重程度不明确时，降级处理（SUGGESTION > WARNING > CRITICAL）。仅对构建失败、测试失败和安全问题使用 CRITICAL；模糊或不确定的问题应为 WARNING 或 SUGGESTION。

用户选择后，按以下方式继续：
- **全部修复**：运行 `bash "$COMET_STATE" transition <change-name> verify-fail`，然后调用 `/comet-build` 修复
- **逐项处理**：CRITICAL 失败必须修复；非 CRITICAL 失败可选择接受偏差，但必须在验证报告中记录接受原因和影响范围。如果存在任何 CRITICAL 失败，不允许跳过修复直接接受全部

### 2a. 轻量验证（小变更）

规模评估结果为"小"时，跳过 `openspec-verify-change`，直接执行以下检查：

1. 所有 tasks.md 任务已完成 `[x]`
2. 变更文件与 tasks.md 描述匹配（`git diff --stat` / `git diff --cached --stat` / `git diff --stat <base-ref>...HEAD` 与任务内容对比）
3. 构建通过（运行项目特定构建命令，如 `npm run build`、`mvn compile`、`cargo build` 等）
4. 相关测试通过
5. 无明显安全问题（无硬编码密钥、无新增不安全操作）

**通过标准**：5 项全部 OK，无 CRITICAL 问题。

**未通过时**：报告失败项，进入 Step 1b 验证失败决策阻断点。仅在用户确认修复后，执行以下命令记录失败并回滚到 build 阶段，然后调用 `/comet-build` 修复：

```bash
# 仅在用户确认修复后执行
bash "$COMET_STATE" transition <change-name> verify-fail
```

**报告格式**：简要表格列出 5 项检查结果 + PASS/FAIL。

**跳过项**（轻量验证不检查）：
- spec 场景覆盖
- design doc 一致性深度对比
- 代码模式一致性建议
- delta spec 与 design doc 漂移检测

### 2b. 完整验证（大变更）

规模评估结果为"大"时：

**立即执行：** 使用 Skill 工具加载 `openspec-verify-change` 技能。禁止跳过此步骤。

技能加载后，遵循其引导进行验证。检查项：
1. 所有 tasks.md 任务已完成（`[x]`）
2. 实现与 `openspec/changes/<name>/design.md` 高层设计决策匹配
3. 实现与 Design Doc（`docs/superpowers/specs/` 下的技术设计文档）匹配
4. 所有能力 spec 场景通过
5. proposal.md 目标已满足
6. delta spec 与 design doc 之间无矛盾（如 Build 阶段有增量 spec 修改，检查 design doc 是否有对应记录）
7. `docs/superpowers/specs/` 下的关联设计文档可定位（文件存在且与当前变更关联）

验证未通过时：报告缺失项，进入 Step 1b 验证失败决策阻断点。仅在用户确认修复后，执行以下命令记录失败并回滚到 build 阶段，然后调用 `/comet-build` 补充：

```bash
# 仅在用户确认修复后执行
bash "$COMET_STATE" transition <change-name> verify-fail
```

**Spec 漂移处理**（用户决策点）：
- 如果检查项 6 发现矛盾（delta spec 有内容但 design doc 未反映），**必须使用 AskUserQuestion 工具以单选形式暂停并等待用户选择处理方式**；不得自动选择。选项：
  - 选项 A：在 design doc 追加"实现偏离"部分记录偏离原因。选项 A 是 verify 阶段允许的产物；写入后不得因该 design doc 变更重新触发 Step 1b dirty-worktree 决策
  - 选项 B：用户选择 B 后，运行 `bash "$COMET_STATE" transition <change-name> verify-fail`，然后调用 `/comet-build`；`/comet-build` 的 Spec 增量更新规则将加载 `superpowers:brainstorming` 更新 Design Doc + delta spec
  - 选项 C：确认偏差可接受，继续验证（design doc 将在归档时标记为 `superseded-by-main-spec`）

### 3. 收尾（Superpowers）

**立即执行：** 使用 Skill 工具加载 `superpowers:finishing-a-development-branch` 技能。禁止跳过此步骤。

如果 `superpowers:finishing-a-development-branch` 不可用，停止流程并提示安装或启用 Superpowers 技能。不要用普通对话替代此步骤。

技能加载后，遵循其引导进行收尾。分支处理选项：
1. 本地合并到主分支
2. 推送并创建 PR
3. 保留分支（稍后处理）
4. 丢弃工作

这是用户决策点。**必须使用 AskUserQuestion 工具暂停并等待用户选择分支处理方式**。不得根据推荐、默认值或当前分支状态选择。不得仅输出文本提示后继续执行。仅在用户完成选择且对应操作完成后，才能写入 `branch_status: handled`。

**确认项**：
- 所有测试通过
- 无硬编码密钥或安全问题

### 4. 记录验证证据

验证报告必须保存到磁盘并记录到 `.comet.yaml`；分支处理完成后，状态字段也须写入。不要手动设置 `verify_result: pass`；使用 guard 自动流转。

```bash
mkdir -p docs/superpowers/reports
# 将验证结论写入报告文件，例如：
# docs/superpowers/reports/YYYY-MM-DD-<change-name>-verify.md

bash "$COMET_STATE" set <change-name> verification_report docs/superpowers/reports/YYYY-MM-DD-<change-name>-verify.md
bash "$COMET_STATE" set <change-name> branch_status handled
```

## 退出条件

- 验证报告通过
- 分支已处理
- `.comet.yaml` 中 `verification_report` 指向已存在的验证报告文件
- `.comet.yaml` 中 `branch_status: handled`
- **阶段守卫**：运行 `bash "$COMET_GUARD" <change-name> verify --apply`；全部 PASS 后通过 `comet-state transition verify-pass` 自动流转至 `phase: archive`

验证和分支处理均完成后，运行 guard 自动流转：

```bash
bash "$COMET_GUARD" <change-name> verify --apply
```

状态文件自动更新为 `phase: archive`、`verify_result: pass`、`verified_at: YYYY-MM-DD`。

## 自动流转

退出条件满足后（包括用户选择分支处理方式），自动流转至下一阶段：

> **必需的下一技能：** 调用 `comet-archive` 技能进入归档阶段。

## 上下文压缩恢复

Verify 阶段可能触发上下文压缩。恢复时首先运行：

```bash
bash "$COMET_STATE" check <change-name> verify --recover
```

脚本输出结构化恢复上下文（阶段、验证状态、分支状态、恢复操作）。按恢复操作指示确定下一步。
