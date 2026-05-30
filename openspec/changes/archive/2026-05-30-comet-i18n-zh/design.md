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
