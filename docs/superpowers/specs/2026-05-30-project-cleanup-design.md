---
comet_change: project-cleanup
role: technical-design
canonical_spec: openspec
archived-with: 2026-05-30-project-cleanup
status: final
---

# 项目清理 — 技术设计

## 概述

系统性清理 Smart 项目前期迭代产生的重复代码、废弃文件和空壳结构。

## 清理清单

### 删除项（6 类）

| 目标 | 路径 | 说明 |
|------|------|------|
| 重复代码 | `server/src/engine/` | 与 `agent/hermes/` 完全重复，14 个文件 |
| 孤立原型 | `ai-tool-platform-prototype.html` | 根目录，无引用 |
| 旧构建 | `server/dist/dev-bundle.js` | 旧版开发构建产物 |
| 测试残留 | `web/test-results/.last-run.json` | Playwright 缓存残留 |
| 空壳变更 | `openspec/changes/fix-delete-file-persistence/` | 无实际内容 |
| 空壳变更 | `openspec/changes/session-storage-deleted-files-filter/` | 无实际内容 |
| 空壳目录 | `web/src/modules/` | 仅有 index.ts 空壳 |

### 修正项（2 项）

| 目标 | 路径 | 说明 |
|------|------|------|
| 引擎路径 | `CLAUDE.md` | `server/src/engine/` → `server/src/agent/hermes/` |
| hooks 导出 | `web/src/hooks/index.ts` | 补全所有 hook 导出 |

## 验证策略

- 删除 engine/ 前：`grep -r "engine/" server/src/` 确认无残留引用
- 删除后：确认 `agent/hermes/` 代码完整
- 最终：`git status` 确认改动范围
