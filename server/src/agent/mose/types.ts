// ── Agent 文件上下文（由 loader 分层加载） ──
export interface AgentFileContext {
  // AGENTS.md — 角色定义
  identity: string;
  // context/ — 行为准则、工作方式（全量加载）
  contexts: string[];
  // memory/USER.md — 记忆索引（全量加载，让模型知道有哪些记忆可用）
  memoryIndex: string;
  // skills 列表（名称 + 摘要，不含全文）
  skills: Array<{ name: string; summary: string }>;
}
