# Comet Design Handoff

- Change: comet-i18n-zh
- Phase: design
- Mode: compact
- Context hash: eb23739db5d61ac81a6022dcad7d3e944e3d9ab023c1279c34bfd0be07489307

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/comet-i18n-zh/proposal.md

- Source: openspec/changes/comet-i18n-zh/proposal.md
- Lines: 1-26
- SHA256: 65db9691f51057921bdbf270f663bfd594a3f3a89c24793fbe22a9c268b79661

```md
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
```

## openspec/changes/comet-i18n-zh/design.md

- Source: openspec/changes/comet-i18n-zh/design.md
- Lines: 1-46
- SHA256: 617c67a2016010054bd919b63d7524a2fc259e27f6d83a322b0f89803bdebb32

```md
## Context

Comet 是 OpenSpec + Superpowers 双星开发工作流，当前所有 SKILL.md 文件均为英文编写。用户为中文母语者，希望工作流交互语言为中文。这是一项纯文案翻译任务，不涉及脚本逻辑修改。

当前涉及文件：
- `comet/SKILL.md` — 主工作流（294 行）
- `comet-open/SKILL.md` — Phase 1: Open
- `comet-design/SKILL.md` — Phase 2: Deep Design
- `comet-build/SKILL.md` — Phase 3: Build
- `comet-verify/SKILL.md` — Phase 4: Verify
- `comet-archive/SKILL.md` — Phase 5: Archive
- `comet-hotfix/SKILL.md` — Hotfix 预设
- `comet-tweak/SKILL.md` — Tweak 预设
- `comet/reference/dirty-worktree.md` — 参考文档

## Goals / Non-Goals

**Goals:**
- 将 9 个 SKILL.md / 参考文档的全部文案从英文翻译为简体中文
- 保持技术术语、命令、字段名、文件路径等标识符原文不变
- 保持 Markdown 结构和格式一致

**Non-Goals:**
- 不翻译 `.sh` 脚本文件（脚本注释保持英文）
- 不添加语言切换功能（不做 i18n 框架）
- 不修改任何脚本逻辑
- 不同步维护英文版本

## Decisions

1. **仅翻译 SKILL.md 和参考文档，脚本保持不变**
   - 理由：脚本输出面向开发者/日志，且修改脚本注释有引入 bug 的风险
   - 备选：全部中文化 → 风险过高，收益不大

2. **技术标识符保持原文**
   - 命令名（`openspec`、`bash`）、字段名（`phase`、`build_mode`）、文件路径、YAML 键名、代码块内容均不翻译
   - 理由：这些是机器可读标识符，翻译后会导致功能异常

3. **术语一致性**
   - 常见术语统一译法：workflow → 工作流，phase → 阶段，artifact → 产物，preset → 预设，guard → 守卫，state machine → 状态机
   - 理由：避免同一英文术语出现多种中文译法造成混淆

## Risks / Trade-offs

- **上游 Comet 更新后需重新同步**：如果 Comet 技能上游发布新版本，翻译后的文件需要手动合并 → 记录修改日期，后续更新时逐文件 diff
- **部分术语无统一译法**：如 "handoff"、"delta spec" 等 → 保留英文原文或采用业界通用译法
```

## openspec/changes/comet-i18n-zh/tasks.md

- Source: openspec/changes/comet-i18n-zh/tasks.md
- Lines: 1-22
- SHA256: 7777a3eaee18e664cc1f484c911bb8d2a551c781e13cc54d72f2de3e793c6d51

```md
## 1. 核心工作流文件

- [ ] 1.1 翻译 `comet/SKILL.md` 主工作流文件（294 行）
- [ ] 1.2 翻译 `comet/reference/dirty-worktree.md` 参考文档（58 行）

## 2. Phase 子命令

- [ ] 2.1 翻译 `comet-open/SKILL.md` Phase 1: Open（113 行）
- [ ] 2.2 翻译 `comet-design/SKILL.md` Phase 2: Deep Design（166 行）
- [ ] 2.3 翻译 `comet-build/SKILL.md` Phase 3: Build（190 行）
- [ ] 2.4 翻译 `comet-verify/SKILL.md` Phase 4: Verify（201 行）
- [ ] 2.5 翻译 `comet-archive/SKILL.md` Phase 5: Archive（73 行）

## 3. 预设路径

- [ ] 3.1 翻译 `comet-hotfix/SKILL.md` Hotfix 预设（169 行）
- [ ] 3.2 翻译 `comet-tweak/SKILL.md` Tweak 预设（154 行）

## 4. 一致性检查

- [ ] 4.1 核对全部文件中的术语翻译一致性
- [ ] 4.2 检查所有代码块和命令是否保持原文未变
```

## openspec/changes/comet-i18n-zh/specs/comet-i18n-zh/spec.md

- Source: openspec/changes/comet-i18n-zh/specs/comet-i18n-zh/spec.md
- Lines: 1-30
- SHA256: fc5fcef20b3b8b610ba418840d9b33e54ec189ee67c83e5450dfdddaa60a4554

```md
## ADDED Requirements

### Requirement: Comet 工作流文案为简体中文
Comet 工作流的所有 SKILL.md 文件和参考文档 SHALL 使用简体中文编写，技术标识符（命令、字段名、文件路径、代码块）MUST 保持英文原文不变。

#### Scenario: 用户触发 /comet 命令
- **WHEN** 用户输入 `/comet` 命令
- **THEN** 系统加载的 SKILL.md 内容为简体中文，流程引导和错误提示以中文呈现

#### Scenario: 用户执行 comet-open 阶段
- **WHEN** 用户进入 Open 阶段
- **THEN** `comet-open/SKILL.md` 中的步骤说明、验证要求、退出条件均为简体中文

#### Scenario: 脚本命令和代码块保持原文
- **WHEN** SKILL.md 中包含 bash 命令或代码块
- **THEN** 其中的命令名、参数名、字段名保持英文原文不变

### Requirement: 翻译覆盖全部 Comet 技能文件
所有 Comet 子命令的 SKILL.md 文件和参考文档 SHALL 完成翻译，不遗漏任何文件。

#### Scenario: 检查翻译覆盖率
- **WHEN** 列出 `.claude/skills/comet*/SKILL.md` 和 `.claude/skills/comet/reference/` 下的所有文件
- **THEN** 每个文件的内容均为简体中文（技术标识符除外）

### Requirement: 术语一致性
同一英文术语在所有文件中的中文译法 SHALL 保持一致。

#### Scenario: 跨文件术语一致
- **WHEN** 对比不同 SKILL.md 文件中相同概念的翻译
- **THEN** "workflow" 统一译为"工作流"，"phase" 统一译为"阶段"，"preset" 统一译为"预设"
```

