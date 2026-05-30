## ADDED Requirements

### Requirement: 无重复代码
项目中 SHALL NOT 存在两份完全相同的代码副本。Agent 引擎的代码路径 MUST 唯一指向 `server/src/agent/hermes/`。

#### Scenario: engine 目录已删除
- **WHEN** 检查 `server/src/engine/` 目录
- **THEN** 该目录不存在

#### Scenario: 所有导入指向正确路径
- **WHEN** 在 `server/src/` 中搜索 `engine/` 引用
- **THEN** 无任何残留引用

### Requirement: 无废弃文件
项目根目录和源码目录中 SHALL NOT 存在孤立原型文件、旧构建产物、测试残留文件。

#### Scenario: 根目录无孤立文件
- **WHEN** 检查项目根目录
- **THEN** `ai-tool-platform-prototype.html` 不存在

#### Scenario: 无旧构建产物
- **WHEN** 检查 `server/dist/` 目录
- **THEN** `dev-bundle.js` 不存在

#### Scenario: 无测试残留
- **WHEN** 检查 `web/test-results/` 目录
- **THEN** `.last-run.json` 不存在或整个 `test-results/` 目录被 .gitignore 排除

#### Scenario: 无空壳目录
- **WHEN** 检查 `web/src/modules/` 目录
- **THEN** 该目录不存在

### Requirement: CLAUDE.md 路径正确
CLAUDE.md 中引用的引擎路径 MUST 与实际代码路径一致。

#### Scenario: 引擎路径指向正确位置
- **WHEN** 阅读 CLAUDE.md 中的模块边界部分
- **THEN** Agent 引擎路径写为 `server/src/agent/hermes/` 而非 `server/src/engine/`

### Requirement: Hooks 桶文件完整导出
`web/src/hooks/index.ts` SHALL 导出所有可用的 hooks。

#### Scenario: 所有 hooks 可通过桶文件导入
- **WHEN** 检查 `web/src/hooks/index.ts`
- **THEN** 该文件导出 `web/src/hooks/` 下所有 hook 模块

### Requirement: 无空壳 OpenSpec 变更
openspec/changes/ 下 SHALL NOT 存在仅有 `.openspec.yaml` 而无实际内容的空壳变更。

#### Scenario: 空壳变更已清理
- **WHEN** 列出 `openspec/changes/` 下的活动变更
- **THEN** 不存在 `fix-delete-file-persistence` 和 `session-storage-deleted-files-filter`
