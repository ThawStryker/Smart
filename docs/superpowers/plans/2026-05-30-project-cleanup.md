---
change: project-cleanup
design-doc: docs/superpowers/specs/2026-05-30-project-cleanup-design.md
base-ref: 0f1f85391a5f3fc761abc76a479f30309ef7f578
archived-with: 2026-05-30-project-cleanup
---

# 项目清理 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 清理重复代码、废弃文件、空壳结构，修正路径引用

**Architecture:** 逐项删除为主，风险从低到高执行

**Tech Stack:** 纯文件操作，无代码变更

archived-with: 2026-05-30-project-cleanup
---

### Task 1: 删除废弃文件

**Files:**
- Delete: `ai-tool-platform-prototype.html`
- Delete: `server/dist/dev-bundle.js`
- Delete: `web/test-results/.last-run.json`

- [ ] **Step 1: 删除文件**
```bash
rm ai-tool-platform-prototype.html
rm server/dist/dev-bundle.js
rm web/test-results/.last-run.json
```

- [ ] **Step 2: 提交**
```bash
git add -A
git commit -m "cleanup: remove abandoned files (prototype, old build, test residue)"
```

### Task 2: 删除空壳 OpenSpec 变更

- [ ] **Step 1: 删除空壳变更目录**
```bash
rm -rf openspec/changes/fix-delete-file-persistence
rm -rf openspec/changes/session-storage-deleted-files-filter
```

- [ ] **Step 2: 提交**
```bash
git add -A
git commit -m "cleanup: remove empty openspec change shells"
```

### Task 3: 删除 web/src/modules/ 空壳目录

- [ ] **Step 1: 删除**
```bash
rm -rf web/src/modules
```

- [ ] **Step 2: 提交**
```bash
git add -A
git commit -m "cleanup: remove empty web/src/modules directory"
```

### Task 4: 补全 hooks/index.ts 导出

- [ ] **Step 1: 读取当前 index.ts 和所有 hook 文件，补全导出**
- [ ] **Step 2: 提交**
```bash
git add web/src/hooks/index.ts
git commit -m "fix: complete hooks barrel exports"
```

### Task 5: 删除 server/src/engine/ 重复代码

- [ ] **Step 1: 搜索残留引用**
```bash
grep -r "engine/" server/src/ --include="*.ts" --include="*.tsx"
```

- [ ] **Step 2: 确认无引用后删除**
```bash
rm -rf server/src/engine
```

- [ ] **Step 3: 提交**
```bash
git add -A
git commit -m "cleanup: remove duplicate server/src/engine (use agent/hermes instead)"
```

### Task 6: 修正 CLAUDE.md 引擎路径

- [ ] **Step 1: 修改路径**
将 `server/src/engine/` 改为 `server/src/agent/hermes/`

- [ ] **Step 2: 提交**
```bash
git add CLAUDE.md
git commit -m "fix: correct agent engine path in CLAUDE.md"
```

### Task 7: 最终验证

- [ ] **Step 1: 确认无残留引用**
```bash
grep -r "engine/" server/src/ --include="*.ts" --include="*.tsx"
```

- [ ] **Step 2: 确认改动范围**
```bash
git diff --stat 0f1f85391a5f3fc761abc76a479f30309ef7f578...HEAD
```

- [ ] **Step 3: 更新 tasks.md 状态**
