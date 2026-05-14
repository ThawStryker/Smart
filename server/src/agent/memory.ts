import { db } from "edgespark";
import { eq, desc, and, sql } from "drizzle-orm";
import { userMemories, projectMemories } from "@defs";

// Types
export interface UserMemory {
  id: number;
  userId: string;
  type: "preference" | "pattern" | "feedback" | "fact";
  key: string;
  value: string;
  confidence: number;
}

export interface ProjectMemory {
  id: number;
  projectId: number;
  type: "decision" | "architecture" | "issue" | "pattern";
  title: string;
  content: string;
}

// === Store ===

export async function saveUserMemory(
  userId: string,
  type: UserMemory["type"],
  key: string,
  value: string,
  confidence = 0.5,
) {
  const [existing] = await db
    .select()
    .from(userMemories)
    .where(and(eq(userMemories.userId, userId), eq(userMemories.key, key)));

  if (existing) {
    await db
      .update(userMemories)
      .set({ value, confidence, updatedAt: new Date().toISOString() })
      .where(eq(userMemories.id, existing.id));
  } else {
    await db.insert(userMemories).values({ userId, type, key, value, confidence });
  }
}

export async function saveProjectMemory(
  projectId: number,
  type: ProjectMemory["type"],
  title: string,
  content: string,
) {
  await db.insert(projectMemories).values({ projectId, type, title, content });
}

// === Retrieve ===

export async function getUserMemories(userId: string): Promise<UserMemory[]> {
  return db
    .select()
    .from(userMemories)
    .where(eq(userMemories.userId, userId))
    .orderBy(desc(userMemories.confidence))
    .all() as any;
}

export async function getProjectMemories(projectId: number): Promise<ProjectMemory[]> {
  return db
    .select()
    .from(projectMemories)
    .where(eq(projectMemories.projectId, projectId))
    .orderBy(desc(projectMemories.createdAt))
    .limit(20)
    .all() as any;
}

// === Format for prompt injection ===

export async function buildMemoryContext(userId: string, projectId: number): Promise<string> {
  const userMems = await getUserMemories(userId);
  const projMems = await getProjectMemories(projectId);

  if (userMems.length === 0 && projMems.length === 0) return "";

  let ctx = "\n## 记忆上下文\n\n";

  if (userMems.length > 0) {
    ctx += "### 用户偏好\n";
    for (const m of userMems.slice(0, 10)) {
      ctx += `- ${m.key}: ${m.value}\n`;
    }
  }

  if (projMems.length > 0) {
    ctx += "\n### 项目知识\n";
    for (const m of projMems) {
      ctx += `- [${m.type}] ${m.title}: ${m.content}\n`;
    }
  }

  return ctx;
}

// === Auto-extract from conversation (simple keyword-based) ===

export async function extractMemoriesFromMessage(
  userId: string,
  projectId: number,
  userMessage: string,
  agentResponse: string,
) {
  // Extract explicit "remember" commands
  const rememberMatch = userMessage.match(/记住[：:]\s*(.+?)(?:[。.]|$)/);
  if (rememberMatch) {
    await saveUserMemory(userId, "fact", "user_stated", rememberMatch[1], 0.8);
  }

  // Extract tech preferences
  const techHints: Record<string, string> = {
    "用 Tailwind": "prefers_tailwind",
    "不要用 Tailwind": "avoids_tailwind",
    "用 React": "uses_react",
    "用 Vue": "uses_vue",
    "用 TypeScript": "uses_typescript",
    "简洁": "prefers_conciseness",
    "详细": "prefers_detail",
  };

  for (const [hint, key] of Object.entries(techHints)) {
    if (userMessage.includes(hint) || agentResponse.includes(hint)) {
      await saveUserMemory(userId, "preference", key, hint, 0.7);
    }
  }

  // Extract project decisions from agent response
  const decisionMatch = agentResponse.match(/方案[：:]\s*(.+)/);
  if (decisionMatch) {
    await saveProjectMemory(projectId, "decision", "技术方案", decisionMatch[1]);
  }
}
