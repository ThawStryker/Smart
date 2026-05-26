import { db } from "edgespark";
import { eq } from "drizzle-orm";
import { workFiles } from "@defs";
import { emit } from "../../stream";

export async function writeFile(
  args: Record<string, unknown>,
  sessionId: number,
  eventQueue: Array<Record<string, unknown>>,
): Promise<string> {
  const path = args.path as string | undefined;
  const content = args.content as string | undefined;
  if (!path || content === undefined) return "Error: path and content required";

  const allFiles = await db.select().from(workFiles).where(eq(workFiles.sessionId, sessionId));
  const existing = allFiles.find((f) => f.path === path);

  if (existing) {
    await db.update(workFiles).set({ content, updatedAt: new Date().toISOString() }).where(eq(workFiles.id, existing.id));
  } else {
    await db.insert(workFiles).values({ sessionId, path, content });
  }
  emit(eventQueue, { type: "doc", path, delta: content });
  return `File written: ${path}`;
}

export async function readFile(
  args: Record<string, unknown>,
  sessionId: number,
): Promise<string> {
  const path = args.path as string | undefined;
  if (!path) return "Error: path required";
  const allFiles = await db.select().from(workFiles).where(eq(workFiles.sessionId, sessionId));
  const file = allFiles.find((f) => f.path === path);
  return file ? file.content || "" : `File not found: ${path}`;
}

export async function listFiles(
  args: Record<string, unknown>,
  sessionId: number,
): Promise<string> {
  const prefix = args.prefix as string | undefined;
  const allFiles = await db.select().from(workFiles).where(eq(workFiles.sessionId, sessionId));
  const filtered = prefix ? allFiles.filter((f) => f.path.startsWith(prefix)) : allFiles;
  return filtered.map((f) => `${f.isFolder ? "[dir]" : "[file]"} ${f.path}`).join("\n");
}
