# Comet Design Handoff

- Change: project-cleanup
- Phase: design
- Mode: compact
- Context hash: ee79e6df2a572e0c7cc07c3e4cbf3db99cbf4d5974fa99d07b5e8728ffe93e39

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/project-cleanup/proposal.md

- Source: openspec/changes/project-cleanup/proposal.md
- Lines: 1-33
- SHA256: 3f74689abe1cf8b205711b0fcf26a5648b323bcdd926a9ff944da3268737a8e5

```md
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
```

## openspec/changes/project-cleanup/design.md

- Source: openspec/changes/project-cleanup/design.md
- Lines: 1-47
- SHA256: 7b0d46a15274e279fba8194233207e1dd446a7b8ade46b05dc1f86354a997fc4

```md
## Context

项目前期迭代开发中产生以下技术债务：
1. `server/src/engine/` 和 `server/src/agent/hermes/` 是同一套代码的完整副本（14 个文件），仅一个导入路径不同。实际运行使用的是 `agent/hermes/`，CLAUDE.md 却指向 `engine/`
2. 根目录残留孤立原型 HTML 文件
3. 旧的构建产物和测试残留文件仍在仓库中
4. openspec 有两个空壳变更（仅初始化了 .openspec.yaml）
5. hooks 桶文件未完整导出、modules 目录为空壳

## Goals / Non-Goals

**Goals:**
- 删除 `server/src/engine/` 重复代码，统一为 `server/src/agent/hermes/`
- 修正 CLAUDE.md 中的引擎路径引用
- 删除孤立文件（原型 HTML、旧构建产物、测试残留）
- 清理空壳 openspec 变更
- 补全 hooks/index.ts 导出

**Non-Goals:**
- 不修改任何业务逻辑或 API
- 不重构 agent/hermes/ 内部结构
- 不清理 docs/superpowers/ 中的历史文档（有归档参考价值）
- 不修改 web/index.html 中的水印移除脚本（需用户确认是否需要）
- 不清理 Drizzle 迁移历史

## Decisions

1. **保留 `agent/hermes/`，删除 `engine/`**
   - 理由：`server/src/index.ts` 和 `server/src/routes/work/chat.ts` 实际导入路径是 `agent/` 和 `agent/hermes/`，`engine/` 无任何有效引用
   - 备选：保留 `engine/` 删除 `agent/hermes/` → 需要改所有导入路径，改动面更大

2. **不清理 docs/superpowers/ 历史文档**
   - 理由：已完成阶段的 design doc 和 plan 有归档参考价值，且文件量不大（~288KB）
   - 备选：删除旧文档 → 可能丢失设计上下文

3. **不清理 Drizzle 迁移历史**
   - 理由：迁移是数据库版本控制的核心，不可删除
   - 备选：合并迁移 → 风险极高，D1 不支持回滚

4. **保留 watermark 移除脚本，不做改动**
   - 理由：该脚本解决的是 EdgeSpark 平台水印问题，移除可能导致水印重新出现；不在本次清理范围

## Risks / Trade-offs

- **删除 engine/ 后如有遗漏引用会导致编译失败** → 删除前用 `grep -r "engine/" server/src/` 全局搜索残留引用
- **CLAUDE.md 路径修正后需确认无误** → 逐行检查 CLAUDE.md 中所有路径引用
- **删除空壳 openspec 变更不影响运行** → 零风险，仅 `rm -rf`
```

## openspec/changes/project-cleanup/tasks.md

- Source: openspec/changes/project-cleanup/tasks.md
- Lines: 1-27
- SHA256: 44c5a88b1b5d7ac38104a163d68379ff75f6e228f4265156a0963d04d2c6b6ab

```md
## 1. 删除重复代码

- [ ] 1.1 全局搜索 `server/src/` 中所有对 `engine/` 的引用，确认无有效依赖
- [ ] 1.2 删除 `server/src/engine/` 整个目录
- [ ] 1.3 修正 `CLAUDE.md` 中引擎路径从 `server/src/engine/` 改为 `server/src/agent/hermes/`

## 2. 删除废弃文件

- [ ] 2.1 删除 `ai-tool-platform-prototype.html`
- [ ] 2.2 删除 `server/dist/dev-bundle.js`
- [ ] 2.3 删除 `web/test-results/.last-run.json`

## 3. 清理 OpenSpec 空壳变更

- [ ] 3.1 删除 `openspec/changes/fix-delete-file-persistence/`
- [ ] 3.2 删除 `openspec/changes/session-storage-deleted-files-filter/`

## 4. 修正结构不完整

- [ ] 4.1 补全 `web/src/hooks/index.ts`，导出所有 hook 模块
- [ ] 4.2 评估并处理 `web/src/modules/` 空壳目录（删除或填实）

## 5. 最终验证

- [ ] 5.1 运行 `grep -r "engine/" server/src/` 确认无残留引用
- [ ] 5.2 确认 `server/src/agent/hermes/` 代码完整可用
- [ ] 5.3 运行 `git status` 确认清理范围正确
```

## openspec/changes/project-cleanup/specs/project-cleanup/spec.md

- Source: openspec/changes/project-cleanup/specs/project-cleanup/spec.md
- Lines: 1-52
- SHA256: 9a851c8c04469e6293613ebd4ddc418868403c44b513db8f1e1fd570bddfcd21

```md
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
```

