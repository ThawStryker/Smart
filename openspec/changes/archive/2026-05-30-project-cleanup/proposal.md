## Why

前期迭代开发中产生了代码重复（engine/ 与 agent/hermes/ 两套相同代码）、废弃产物（旧构建文件、孤立原型 HTML）、以及结构不完整（空壳目录、未完整导出的 hooks）等问题。项目需要一次系统性清理，统一代码路径、移除冗余、规范化结构。

## What Changes

- **删除 `server/src/engine/`**：与 `server/src/agent/hermes/` 完全重复（14 个文件），CLAUDE.md 中引用的路径需同步修正
- **删除 `ai-tool-platform-prototype.html`**：根目录孤立原型文件，无引用
- **删除 `server/dist/dev-bundle.js`**：旧的开发构建产物
- **删除 `web/test-results/.last-run.json`**：测试残留文件
- **清理 openspec 空壳变更**：`fix-delete-file-persistence` 和 `session-storage-deleted-files-filter`（仅有 .openspec.yaml，无实际内容）
- **修正 `web/src/hooks/index.ts`**：补全所有 hook 的导出
- **评估 `web/src/modules/`**：如无用则删除空壳目录
- **评估 `web/index.html` 水印移除脚本**：如不再需要则移除
- **清理 `.edgespark/` 旧缓存**：保留最新的 tarball，删除旧版本
- **修正 CLAUDE.md 引擎路径**：从 `server/src/engine/` 改为 `server/src/agent/hermes/`

## Capabilities

### New Capabilities

- `project-cleanup`: 项目清理——移除重复代码、废弃文件、空壳结构，统一代码路径引用

### Modified Capabilities

<!-- 无现有 spec 需要修改 -->

## Impact

- 删除文件：`server/src/engine/` 下 14 个文件、`ai-tool-platform-prototype.html`、`server/dist/dev-bundle.js`、`web/test-results/.last-run.json`
- 修改文件：`CLAUDE.md`（引擎路径）、`web/src/hooks/index.ts`（补全导出）
- 清理：`openspec/changes/` 下 2 个空壳变更、`.edgespark/` 旧 tarball
- 无 API 变更、无功能影响
