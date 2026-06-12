import { db } from "edgespark";
import { eq, and, like } from "drizzle-orm";
import { agentFiles, userAgents, workMessages } from "@defs";
import type { AgentFileContext } from "./types";

function extractSummary(content: string): string {
  const firstLine = content.trim().split("\n")[0]?.replace(/^#+\s*/, "") || "";
  return firstLine.slice(0, 80) || "(empty)";
}

// ── 分层加载：context + memory index + skills list ──
export async function loadAgentContext(
  userId: string,
  agentName: string,
): Promise<AgentFileContext> {
  const allFiles = await db
    .select()
    .from(agentFiles)
    .where(
      and(
        eq(agentFiles.userId, userId),
        eq(agentFiles.agentName, agentName),
      ),
    );

  const fileMap = new Map<string, string>();
  for (const f of allFiles) {
    fileMap.set(f.path, f.content || "");
  }

  // 角色定义
  const identity = fileMap.get("AGENTS.md") || "";

  // 行为准则（context/ 目录下的所有 md 文件）
  const contexts: string[] = [];
  for (const [path, content] of fileMap.entries()) {
    if (path.startsWith("context/") && path.endsWith(".md")) {
      contexts.push(content);
    }
  }

  // 记忆索引（memory/USER.md）
  const memoryIndex = fileMap.get("memory/USER.md") || "";

  // 技能列表（名称 + 摘要，不含全文）
  const skills: Array<{ name: string; summary: string }> = [];
  for (const [path, content] of fileMap.entries()) {
    const match = path.match(/^skills\/([^/]+)\/SKILL\.md$/);
    if (match) {
      skills.push({ name: match[1], summary: extractSummary(content) });
    }
  }

  return { identity, contexts, memoryIndex, skills };
}

// ── 按需加载：读取单个 memory 文件 ──
export async function loadMemoryFile(
  userId: string,
  agentName: string,
  memoryPath: string,
): Promise<string> {
  const rows = await db
    .select()
    .from(agentFiles)
    .where(
      and(
        eq(agentFiles.userId, userId),
        eq(agentFiles.agentName, agentName),
        eq(agentFiles.path, `memory/${memoryPath}`),
      ),
    );
  return rows[0]?.content || "";
}

// ── 按需加载：读取单个 skill 文件 ──
export async function loadSkillContent(
  userId: string,
  agentName: string,
  skillName: string,
): Promise<string> {
  const rows = await db
    .select()
    .from(agentFiles)
    .where(
      and(
        eq(agentFiles.userId, userId),
        eq(agentFiles.agentName, agentName),
        eq(agentFiles.path, `skills/${skillName}/SKILL.md`),
      ),
    );
  return rows[0]?.content || "";
}

// ── 对话历史 ──
export async function loadSessionMessages(
  sessionId: number,
): Promise<Array<{ agentName: string | null; content: string }>> {
  const messages = await db
    .select()
    .from(workMessages)
    .where(eq(workMessages.sessionId, sessionId));
  return messages.map((m) => ({
    agentName: m.agentName,
    content: m.content || "",
  }));
}

// ── Agent 名称列表 ──
export async function listAgentNames(userId: string): Promise<string[]> {
  const agents = await db.select({ name: userAgents.name }).from(userAgents).where(eq(userAgents.userId, userId));
  return agents.map((a) => a.name);
}
