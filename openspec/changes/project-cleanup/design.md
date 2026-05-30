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
