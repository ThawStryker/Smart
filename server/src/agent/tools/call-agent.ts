import { db } from "edgespark";
import { eq, and, like } from "drizzle-orm";
import { workFiles } from "@defs";

export const callAgentToolDef = {
  type: "function" as const,
  function: {
    name: "call_agent",
    description: "调用一个 sub-agent 执行任务。sub-agent 会从 agents/<name>/AGENTS.md 读取设定。",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "agent 名称" },
        task: { type: "string", description: "要执行的任务描述" },
        context: { type: "string", description: "额外上下文（可选）" },
      },
      required: ["name", "task"],
    },
  },
};

export interface CallAgentArgs {
  name: string;
  task: string;
  context?: string;
}

export interface AgentFiles {
  agentsMd: string;
  contextFiles: { path: string; content: string }[];
  skillFiles: { path: string; content: string }[];
}

export async function loadAgentFiles(userId: string, agentName: string): Promise<AgentFiles> {
  const prefix = agentName ? `agents/${agentName}/` : "";
  const rows = await db.select().from(workFiles)
    .where(and(eq(workFiles.userId, userId), like(workFiles.path, prefix + "%")));

  let agentsMd = "";
  const contextFiles: { path: string; content: string }[] = [];
  const skillFiles: { path: string; content: string }[] = [];

  for (const row of rows) {
    const relativePath = row.path.replace(prefix, "");
    if (relativePath === "AGENTS.md") {
      agentsMd = row.content;
    } else if (relativePath.startsWith("Context/") && !row.isFolder && row.content) {
      contextFiles.push({ path: relativePath, content: row.content });
    } else if (relativePath.startsWith("System/skill/") && !row.isFolder && row.content) {
      skillFiles.push({ path: relativePath, content: row.content });
    }
  }
  return { agentsMd, contextFiles, skillFiles };
}

export async function writeAgentFile(userId: string, agentName: string, subPath: string, content: string) {
  const fullPath = `agents/${agentName}/${subPath}`;
  const [existing] = await db.select().from(workFiles)
    .where(and(eq(workFiles.userId, userId), eq(workFiles.path, fullPath)));
  if (existing) {
    await db.update(workFiles).set({ content, updatedAt: new Date().toISOString() })
      .where(eq(workFiles.id, existing.id));
  } else {
    await db.insert(workFiles).values({ userId, path: fullPath, content });
  }
}

export async function writeHeartbeat(userId: string, agentName: string, status: string) {
  const now = new Date().toISOString().slice(0, 16).replace("T", "-");
  await writeAgentFile(userId, agentName, "System/heartbeat/latest.md", status);
  await writeAgentFile(userId, agentName, `System/heartbeat/${now}.md`, status);
}
