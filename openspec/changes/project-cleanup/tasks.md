## 1. 删除重复代码

- [x] 1.1 全局搜索 `server/src/` 中所有对 `engine/` 的引用，确认无有效依赖
- [x] 1.2 删除 `server/src/engine/` 整个目录
- [x] 1.3 修正 `CLAUDE.md` 中引擎路径从 `server/src/engine/` 改为 `server/src/agent/hermes/`

## 2. 删除废弃文件

- [x] 2.1 删除 `ai-tool-platform-prototype.html`
- [x] 2.2 删除 `server/dist/dev-bundle.js`
- [x] 2.3 删除 `web/test-results/.last-run.json`

## 3. 清理 OpenSpec 空壳变更

- [x] 3.1 删除 `openspec/changes/fix-delete-file-persistence/`
- [x] 3.2 删除 `openspec/changes/session-storage-deleted-files-filter/`

## 4. 修正结构不完整

- [x] 4.1 补全 `web/src/hooks/index.ts`，导出所有 hook 模块
- [x] 4.2 删除 `web/src/modules/` 空壳目录

## 5. 最终验证

- [x] 5.1 运行 `grep -r "engine/" server/src/` 确认无残留引用
- [x] 5.2 确认 `server/src/agent/hermes/` 代码完整可用
- [x] 5.3 运行 `git status` 确认清理范围正确
