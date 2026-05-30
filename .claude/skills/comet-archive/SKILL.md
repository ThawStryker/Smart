---
name: comet-archive
description: "Comet Phase 5: Archive。使用 /comet-archive 调用。将 delta spec 同步到 main spec，归档变更。"
---

# Comet Phase 5: Archive（归档）

## 前置条件

- 验证已通过（Phase 4 完成）
- 分支已处理
- `openspec/changes/<name>/.comet.yaml` 中 `verify_result: pass`

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
bash "$COMET_STATE" check <name> archive
```

验证通过后进入 Step 1。验证失败时脚本会输出具体失败原因。

### 1. 执行归档

运行归档脚本自动完成所有步骤：

```bash
bash "$COMET_ARCHIVE" "<change-name>"
```

脚本自动执行：
1. 入口状态验证（phase=archive、verify_result=pass、archived=false）
2. Delta spec 同步到 main spec（覆写）
3. Design doc 文件头注释（archived-with、status）
4. Plan 文件头注释（archived-with）
5. 将变更移至归档目录
6. 通过 `comet-state transition <archive-name> archived` 更新 `archived: true`

如果脚本返回非零退出码，报告错误并停止。
如果脚本返回零退出码，归档完成。
摘要 `X/Y 步骤成功` 统计实际执行的步骤，不重复计算 delta spec 同步或文档注释。

当 delta spec 与已有 main spec 不同时，脚本在覆写前打印 unified diff 预览，以帮助确认归档同步内容。

使用 `--dry-run` 标志预览而不执行。

### 2. 生命周期闭环

Spec 生命周期在此完成：
```
brainstorming → delta spec → 实现 → 验证 → main spec 覆写 → design doc 注释 → 归档
```

## 退出条件

- 归档脚本执行成功（退出码 0）
- 归档目录 `openspec/changes/archive/YYYY-MM-DD-<change-name>/` 存在
- 归档后的 `.comet.yaml` 包含 `archived: true`

归档脚本将 `openspec/changes/<name>/` 移至 `openspec/changes/archive/YYYY-MM-DD-<name>/`。归档成功后，**不要**对旧的活动变更名运行 `bash "$COMET_GUARD" <change-name> archive`；活动目录已不存在。归档完整性由脚本退出码和归档目录状态决定。

## 完成

Comet 工作流完成。要开始新工作，调用 `/comet` 或 `/comet-open`。
