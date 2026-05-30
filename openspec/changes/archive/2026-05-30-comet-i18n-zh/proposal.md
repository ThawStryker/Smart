## Why

Comet 工作流的所有 SKILL.md 文件均为英文，用户（中文母语）在与 Comet 交互时看到的是英文提示和流程引导。需要将全部文案翻译为中文，使工作流交互语言与用户偏好一致。

## What Changes

- 翻译 `comet/SKILL.md` 主工作流文件（294 行）
- 翻译 6 个子命令 SKILL.md 文件：`comet-open`、`comet-design`、`comet-build`、`comet-verify`、`comet-archive`、`comet-hotfix`、`comet-tweak`
- 翻译参考文档 `comet/reference/dirty-worktree.md`
- 保留技术术语和脚本命令原文（如 `openspec`、`bash`、字段名等）

## Capabilities

### New Capabilities

- `comet-i18n-zh`: Comet 工作流技能的中文翻译，覆盖全部 9 个文件，技术标识符和脚本命令保持原文不变

### Modified Capabilities

<!-- 无现有 spec 需要修改 -->

## Impact

- 影响文件：`.claude/skills/comet*/SKILL.md` 及 `.claude/skills/comet/reference/dirty-worktree.md`（共 9 个文件）
- 不影响脚本逻辑（`.sh` 文件不翻译）
- 不影响 OpenSpec 工具链
