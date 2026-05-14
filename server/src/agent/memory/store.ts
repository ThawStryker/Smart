import { db } from "edgespark";
import { eq, desc, and } from "drizzle-orm";
import { userMemories, projectMemories } from "@defs";

export async function saveUserMemory(
  userId: string, type: string, key: string, value: string, confidence = 0.5,
) {
  const [existing] = await db.select().from(userMemories)
    .where(and(eq(userMemories.userId, userId), eq(userMemories.key, key)));
  if (existing) {
    await db.update(userMemories).set({ value, confidence, updatedAt: new Date().toISOString() })
      .where(eq(userMemories.id, existing.id));
  } else {
    await db.insert(userMemories).values({ userId, type, key, value, confidence });
  }
}

export async function saveProjectMemory(
  projectId: number, type: string, title: string, content: string,
) {
  await db.insert(projectMemories).values({ projectId, type, title, content });
}

export async function getUserMemories(userId: string) {
  return db.select().from(userMemories).where(eq(userMemories.userId, userId))
    .orderBy(desc(userMemories.confidence)).all();
}

export async function getProjectMemories(projectId: number) {
  return db.select().from(projectMemories).where(eq(projectMemories.projectId, projectId))
    .orderBy(desc(projectMemories.createdAt)).limit(20).all();
}

export async function buildMemoryContext(userId: string, projectId: number): Promise<string> {
  const userMems = await getUserMemories(userId);
  const projMems = await getProjectMemories(projectId);
  if (userMems.length === 0 && projMems.length === 0) return "";

  let ctx = "\n## 记忆上下文\n";
  if (userMems.length > 0) {
    ctx += "\n### 用户偏好\n";
    for (const m of userMems.slice(0, 10)) ctx += `- ${m.key}: ${m.value}\n`;
  }
  if (projMems.length > 0) {
    ctx += "\n### 项目知识\n";
    for (const m of projMems) ctx += `- [${m.type}] ${m.title}: ${m.content}\n`;
  }
  return ctx;
}

export async function extractMemories(
  userId: string, projectId: number, userMessage: string, agentResponse: string,
) {
  // Explicit "记住" commands
  const rm = userMessage.match(/记住[：:]\s*(.+?)(?:[。.]|$)/);
  if (rm) await saveUserMemory(userId, "fact", "user_stated", rm[1], 0.8);

  // Tech preferences
  const hints: Record<string, string> = {
    "用 Tailwind": "prefers_tailwind", "不要用 Tailwind": "avoids_tailwind",
    "用 React": "uses_react", "用 Vue": "uses_vue", "用 TypeScript": "uses_typescript",
    "简洁": "prefers_conciseness", "详细": "prefers_detail",
  };
  for (const [hint, key] of Object.entries(hints)) {
    if (userMessage.includes(hint) || agentResponse.includes(hint)) {
      await saveUserMemory(userId, "preference", key, hint, 0.7);
    }
  }

  // Project decisions
  const dm = agentResponse.match(/方案[：:]\s*(.+)/);
  if (dm) await saveProjectMemory(projectId, "decision", "技术方案", dm[1]);
}
