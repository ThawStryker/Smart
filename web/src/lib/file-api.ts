/**
 * file-api.ts — 文件路径解析工具
 *
 * AgentPanel.tsx 和 useFiles.ts 共享的路径解析逻辑。
 * 两套文件系统 REST API 路由：
 *   - workspace files: /api/work/workspace/:path
 *   - agent files:     /api/agents/:name/files/:path
 */

export interface FileEntry {
  id: number;
  path: string;
  content: string;
  isFolder: number;
}

/** 对路径的每个 segment 做 encodeURIComponent */
export function encodeFilePath(p: string): string {
  return p.split("/").map(encodeURIComponent).join("/");
}

/**
 * 从树路径解析 PUT 写入 URL
 * 树路径格式:
 *   "agents/小明/AGENTS.md" → PUT /api/agents/小明/files/AGENTS.md
 *   "workspace/doc.md"     → PUT /api/work/workspace/doc.md
 */
export function resolveApiUrl(treePath: string, _sessionId: number): { url: string; method: string } | null {
  const agentMatch = treePath.match(/^agents\/([^/]+)\/(.+)$/);
  if (agentMatch) {
    return {
      url: `/api/agents/${encodeURIComponent(agentMatch[1])}/files/${encodeFilePath(agentMatch[2])}`,
      method: "PUT",
    };
  }
  if (treePath.startsWith("workspace/")) {
    return {
      url: `/api/work/workspace/${encodeFilePath(treePath.slice("workspace/".length))}`,
      method: "PUT",
    };
  }
  // Default to workspace
  return {
    url: `/api/work/workspace/${encodeFilePath(treePath)}`,
    method: "PUT",
  };
}

/** 解析 DELETE URL */
export function resolveDeleteUrl(treePath: string, _sessionId: number): string {
  const m = treePath.match(/^agents\/([^/]+)\/(.+)$/);
  if (m) return `/api/agents/${encodeURIComponent(m[1])}/files/${encodeFilePath(m[2])}`;
  if (treePath.startsWith("workspace/")) {
    return `/api/work/workspace/${encodeFilePath(treePath.slice("workspace/".length))}`;
  }
  return `/api/work/workspace/${encodeFilePath(treePath)}`;
}

/**
 * 批量加载所有 Agent 的文件（解决 N+1 问题）
 * 返回: Map<agentName, FileEntry[]>
 */
export async function loadAllAgentFiles(): Promise<Map<string, FileEntry[]>> {
  const agentRes = await fetch("/api/agents").catch(() => ({ ok: false } as Response));
  if (!agentRes.ok) return new Map();

  const agents: Array<{ name: string }> = await agentRes.json();
  if (agents.length === 0) return new Map();

  const names = agents.map((a) => a.name);
  const batchRes = await fetch(`/api/agents/files/batch?names=${names.map(encodeURIComponent).join(",")}`).catch(() => null);
  if (!batchRes || !batchRes.ok) {
    // 降级：逐个请求
    const map = new Map<string, FileEntry[]>();
    for (const name of names) {
      const r = await fetch(`/api/agents/${encodeURIComponent(name)}/files`).catch(() => null);
      if (r?.ok) map.set(name, await r.json());
    }
    return map;
  }

  const data: Array<{ agentName: string; files: FileEntry[] }> = await batchRes.json();
  const map = new Map<string, FileEntry[]>();
  for (const { agentName, files } of data) map.set(agentName, files);
  return map;
}

/** 解析原子化重命名 POST URL */
export function resolveRenameUrl(treePath: string, _sessionId: number): string | null {
  const m = treePath.match(/^agents\/([^/]+)\/(.+)$/);
  if (m) return `/api/agents/${encodeURIComponent(m[1])}/files/rename`;
  if (treePath.startsWith("workspace/")) return "/api/work/workspace/rename";
  return "/api/work/workspace/rename";
}
