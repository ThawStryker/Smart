import { db } from "edgespark";
import { eq, and, like, asc } from "drizzle-orm";
import { agentFiles, workspaceFiles } from "@defs";
import { register } from "./registry";
import type { ToolContext } from "./registry";

/** 规范化 markdown 表格 Cell 内的换行：\\ + 换行 或 \\| 连续序列 → <br>（不留换行，保持表格单行） */
function normalizeTableCellBreaks(content: string): string {
  let result = content;
  // 旧模式：\\ + 换行 → <br>（不留换行，保持表格行在一行内）
  result = result.split("\\\\\n").join("<br>");
  // 新模式：\| 连续 2+ → <br>（模型用 \|\|\|\| 分隔对话）
  result = result.replace(/(?:\\\|){2,}/g, "<br>");
  return result;
}

// ── 底层方法：创建文件（不写内容） ──
export async function createFile(
  rawPath: string,
  userId: string,
  agentName?: string | null,
): Promise<{ table: "workspace" | "agent"; fileId?: number }> {
  if (rawPath.startsWith("workspace/")) {
    const filePath = rawPath.slice("workspace/".length);
    const rows = await db.select().from(workspaceFiles).where(
      and(eq(workspaceFiles.userId, userId), eq(workspaceFiles.path, filePath)),
    );
    const existing = rows[0];
    if (existing) return { table: "workspace", fileId: existing.id };
    const inserted = await db.insert(workspaceFiles).values({ userId, path: filePath, content: "" }).returning({ id: workspaceFiles.id });
    return { table: "workspace", fileId: inserted[0]?.id };
  }

  if (!agentName) throw new Error("agent name required for non-workspace files");
  const rows = await db.select().from(agentFiles).where(
    and(eq(agentFiles.userId, userId), eq(agentFiles.agentName, agentName), eq(agentFiles.path, rawPath)),
  );
  const existing = rows[0];
  if (existing) return { table: "agent", fileId: existing.id };
  const inserted = await db.insert(agentFiles).values({ userId, agentName, path: rawPath, content: "" }).returning({ id: agentFiles.id });
  return { table: "agent", fileId: inserted[0]?.id };
}

// ── 底层方法：写入内容 ──
export async function writeContent(
  rawPath: string,
  content: string,
  userId: string,
  agentName?: string | null,
): Promise<void> {
  if (rawPath.startsWith("workspace/")) {
    const filePath = rawPath.slice("workspace/".length);
    const rows = await db.select().from(workspaceFiles).where(
      and(eq(workspaceFiles.userId, userId), eq(workspaceFiles.path, filePath)),
    );
    const existing = rows[0];
    if (existing) {
      await db.update(workspaceFiles).set({ content, updatedAt: new Date().toISOString() }).where(eq(workspaceFiles.id, existing.id));
    } else {
      await db.insert(workspaceFiles).values({ userId, path: filePath, content });
    }
    return;
  }

  if (!agentName) throw new Error("agent name required for non-workspace files");
  const rows = await db.select().from(agentFiles).where(
    and(eq(agentFiles.userId, userId), eq(agentFiles.agentName, agentName), eq(agentFiles.path, rawPath)),
  );
  const existing = rows[0];
  if (existing) {
    await db.update(agentFiles).set({ content, updatedAt: new Date().toISOString() }).where(eq(agentFiles.id, existing.id));
  } else {
    await db.insert(agentFiles).values({ userId, agentName, path: rawPath, content });
  }
}

// ── write_file 工具处理器（单次 upsert，避免 D1 最终一致性导致内容丢失）──
async function writeFileHandler(args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  const rawPath = args.path as string | undefined;
  const content = args.content as string | undefined;
  if (!rawPath || content === undefined) return "Error: path and content required";

  // 只对 workspace 文件做表格换行规范化
  const normalized = rawPath.startsWith("workspace/") ? normalizeTableCellBreaks(content) : content;

  if (rawPath.startsWith("workspace/")) {
    const filePath = rawPath.slice("workspace/".length);
    await db.insert(workspaceFiles).values({
      userId: ctx.userId, path: filePath, content: normalized, updatedAt: new Date().toISOString(),
    }).onConflictDoUpdate({
      target: [workspaceFiles.userId, workspaceFiles.path],
      set: { content: normalized, updatedAt: new Date().toISOString() },
    });
  } else {
    if (!ctx.agentName) return "Error: agent name required for non-workspace files";
    await db.insert(agentFiles).values({
      userId: ctx.userId, agentName: ctx.agentName, path: rawPath, content: normalized, updatedAt: new Date().toISOString(),
    }).onConflictDoUpdate({
      target: [agentFiles.userId, agentFiles.agentName, agentFiles.path],
      set: { content: normalized, updatedAt: new Date().toISOString() },
    });
  }
  return `File written: ${rawPath}`;
}

// ── read_file 工具处理器 ──
async function readFileHandler(args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  const rawPath = args.path as string | undefined;
  if (!rawPath) return "Error: path required";

  if (rawPath.startsWith("workspace/")) {
    const filePath = rawPath.slice("workspace/".length);
    const rows = await db.select().from(workspaceFiles).where(and(eq(workspaceFiles.userId, ctx.userId), eq(workspaceFiles.path, filePath)));
    return rows[0]?.content || `File not found: ${rawPath}`;
  }

  if (!ctx.agentName) return "Error: agent name required for non-workspace files";
  const rows = await db.select().from(agentFiles).where(and(eq(agentFiles.userId, ctx.userId), eq(agentFiles.agentName, ctx.agentName), eq(agentFiles.path, rawPath)));
  return rows[0]?.content || `File not found: ${rawPath}`;
}

// ── list_files 工具处理器 ──
async function listFilesHandler(args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  const rawPrefix = args.prefix as string | undefined;

  if (rawPrefix && rawPrefix.startsWith("workspace/")) {
    const prefix = rawPrefix.slice("workspace/".length);
    const condition = prefix
      ? and(eq(workspaceFiles.userId, ctx.userId), like(workspaceFiles.path, `${prefix}%`))
      : eq(workspaceFiles.userId, ctx.userId);
    const files = await db.select().from(workspaceFiles).where(condition).orderBy(asc(workspaceFiles.createdAt));
    return formatFileList(files, "workspace/");
  }

  if (!ctx.agentName) return "Error: agent name required for non-workspace files";
  const condition = rawPrefix
    ? and(eq(agentFiles.userId, ctx.userId), eq(agentFiles.agentName, ctx.agentName), like(agentFiles.path, `${rawPrefix}%`))
    : and(eq(agentFiles.userId, ctx.userId), eq(agentFiles.agentName, ctx.agentName));
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

// ── 注册 ──
register({
  name: "write_file",
  description: "Write content to a workspace file",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path" },
      content: { type: "string", description: "File content (markdown)" },
    },
    required: ["path", "content"],
  },
  phase: "write",
  meta: (args) => ({ path: args.path as string }),
  handler: writeFileHandler,
});

register({
  name: "read_file",
  description: "Read a workspace file",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path" },
    },
    required: ["path"],
  },
  phase: "read",
  meta: (args) => ({ path: args.path as string }),
  handler: readFileHandler,
});

register({
  name: "list_files",
  description: "List workspace files",
  parameters: {
    type: "object",
    properties: {
      prefix: { type: "string", description: "Path prefix filter" },
    },
    required: [],
  },
  phase: "read",
  meta: (args) => ({ prefix: args.prefix as string || "/" }),
  handler: listFilesHandler,
});
