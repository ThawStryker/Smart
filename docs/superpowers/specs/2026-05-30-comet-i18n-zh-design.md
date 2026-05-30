---
comet_change: comet-i18n-zh
role: technical-design
canonical_spec: openspec
archived-with: 2026-05-30-comet-i18n-zh
status: final
---

# Comet 中文本地化 — 技术设计

## 概述

将 Comet 工作流全部 9 个 SKILL.md / 参考文档从英文翻译为简体中文，技术标识符保持原文不变。

## 翻译规则

### 三层处理

| 层级 | 内容 | 处理方式 |
|------|------|----------|
| 代码块 | bash 命令、YAML、JSON | 不翻译 |
| 行内代码 | `` `字段名` ``、`` `路径` `` | 不翻译 |
| 正文 | 步骤说明、流程引导、错误提示 | 翻译为中文 |

### 术语表

| 英文 | 中文 |
|------|------|
| workflow | 工作流 |
| phase | 阶段 |
| artifact | 产物 |
| preset | 预设 |
| guard | 守卫 |
| state machine | 状态机 |
| handoff | 交接 |
| delta spec | 增量规格 |
| blocking point | 阻断点 |
| change | 变更 |
| isolation | 隔离 |
| verification | 验证 |

## 涉及文件

1. `comet/SKILL.md` — 主工作流（294 行）
2. `comet-open/SKILL.md` — Phase 1（113 行）
3. `comet-design/SKILL.md` — Phase 2（166 行）
4. `comet-build/SKILL.md` — Phase 3（190 行）
5. `comet-verify/SKILL.md` — Phase 4（201 行）
6. `comet-archive/SKILL.md` — Phase 5（73 行）
7. `comet-hotfix/SKILL.md` — Hotfix 预设（169 行）
8. `comet-tweak/SKILL.md` — Tweak 预设（154 行）
9. `comet/reference/dirty-worktree.md` — 参考（58 行）

## 执行顺序

1. 核心工作流文件（comet + reference）
2. Phase 子命令（open → design → build → verify → archive）
3. 预设路径（hotfix + tweak）
4. 一致性检查

## 验证策略

- 每个文件翻译后立即阅读检查
- 代码块 `grep` 对比确认未被修改
- 全部完成后交叉检查术语一致性
- 回滚：`git checkout` 还原原始文件
