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
