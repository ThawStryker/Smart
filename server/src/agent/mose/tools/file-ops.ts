import { db } from "edgespark";
import { eq, and, like, asc } from "drizzle-orm";
import { agentFiles, workspaceFiles } from "@defs";
import { emit } from "../../stream";

export async function writeFile(
  args: Record<string, unknown>,
  _sessionId: number,
  eventQueue: Array<Record<string, unknown>>,
  userId: string,
  agentName?: string | null,
): Promise<string> {
  const rawPath = args.path as string | undefined;
  const content = args.content as string | undefined;
  if (!rawPath || content === undefined) return "Error: path and content required";

  if (rawPath.startsWith("workspace/")) {
    // Workspace file
    const filePath = rawPath.slice("workspace/".length);
    const rows = await db.select().from(workspaceFiles).where(and(eq(workspaceFiles.userId, userId), eq(workspaceFiles.path, filePath)));
    const existing = rows[0];
    if (existing) {
      await db.update(workspaceFiles).set({ content, updatedAt: new Date().toISOString() }).where(eq(workspaceFiles.id, existing.id));
    } else {
      await db.insert(workspaceFiles).values({ userId, path: filePath, content });
    }
    emit(eventQueue, { type: "doc", path: rawPath, delta: content });
    return `File written: ${rawPath}`;
  }

  // Agent file
  if (!agentName) return "Error: agent name required for non-workspace files";
  const rows = await db.select().from(agentFiles).where(and(eq(agentFiles.userId, userId), eq(agentFiles.agentName, agentName), eq(agentFiles.path, rawPath)));
  const existing = rows[0];
  if (existing) {
    await db.update(agentFiles).set({ content, updatedAt: new Date().toISOString() }).where(eq(agentFiles.id, existing.id));
  } else {
    await db.insert(agentFiles).values({ userId, agentName, path: rawPath, content });
  }
  emit(eventQueue, { type: "doc", path: rawPath, delta: content });
  return `File written: ${rawPath}`;
}

export async function readFile(
  args: Record<string, unknown>,
  _sessionId: number,
  userId: string,
  agentName?: string | null,
): Promise<string> {
  const rawPath = args.path as string | undefined;
  if (!rawPath) return "Error: path required";

  if (rawPath.startsWith("workspace/")) {
    const filePath = rawPath.slice("workspace/".length);
    const rows = await db.select().from(workspaceFiles).where(and(eq(workspaceFiles.userId, userId), eq(workspaceFiles.path, filePath)));
    return rows[0]?.content || `File not found: ${rawPath}`;
  }

  if (!agentName) return "Error: agent name required for non-workspace files";
  const rows = await db.select().from(agentFiles).where(and(eq(agentFiles.userId, userId), eq(agentFiles.agentName, agentName), eq(agentFiles.path, rawPath)));
  return rows[0]?.content || `File not found: ${rawPath}`;
}

export async function listFiles(
  args: Record<string, unknown>,
  _sessionId: number,
  userId: string,
  agentName?: string | null,
): Promise<string> {
  const rawPrefix = args.prefix as string | undefined;

  if (rawPrefix && rawPrefix.startsWith("workspace/")) {
    const prefix = rawPrefix.slice("workspace/".length);
    const condition = prefix
      ? and(eq(workspaceFiles.userId, userId), like(workspaceFiles.path, `${prefix}%`))
      : eq(workspaceFiles.userId, userId);
    const files = await db.select().from(workspaceFiles).where(condition).orderBy(asc(workspaceFiles.createdAt));
    return formatFileList(files, "workspace/");
  }

  if (!agentName) return "Error: agent name required for non-workspace files";
  const condition = rawPrefix
    ? and(eq(agentFiles.userId, userId), eq(agentFiles.agentName, agentName), like(agentFiles.path, `${rawPrefix}%`))
    : and(eq(agentFiles.userId, userId), eq(agentFiles.agentName, agentName));
  const files = await db.select().from(agentFiles).where(condition).orderBy(asc(agentFiles.createdAt));
  return formatFileList(files, "");
}

function formatFileList(files: Array<{ path: string; isFolder: number | null; content: string | null }>, pathPrefix: string): string {
  return files
    .map((f) => {
      const label = f.isFolder ? "[dir]" : "[file]";
      const firstLine = !f.isFolder && f.content
        ? f.content.trim().split("\n")[0]?.replace(/^#+\s*/, "").slice(0, 60) || ""
        : "";
      const summary = firstLine ? ` | ${firstLine}` : "";
      return `${label} ${pathPrefix}${f.path}${summary}`;
    })
    .join("\n");
}
