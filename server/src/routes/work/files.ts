import { Hono } from "hono";
import { db } from "edgespark";
import { eq, and, like, asc, sql } from "drizzle-orm";
import { workFiles } from "@defs";

export const filesRoutes = new Hono();

function getFilePath(c: any, sessionId: number): string {
  const path = c.req.path;
  const prefix = `/sessions/${sessionId}/files/`;
  const idx = path.indexOf(prefix);
  if (idx === -1) return "";
  return decodeURIComponent(path.slice(idx + prefix.length));
}

filesRoutes.get("/", async (c) => {
  const sessionId = parseInt(c.req.param("id") || "0");
  const prefix = c.req.query("prefix") || "";
  const allSessions = c.req.query("all") === "1";
  if (allSessions) {
    const condition = prefix
      ? like(workFiles.path, `${prefix}%`)
      : undefined;
    const query = db.select().from(workFiles).orderBy(asc(workFiles.createdAt));
    const files = condition ? await query.where(condition) : await query;
    return c.json(files);
  }
  const condition = prefix
    ? and(eq(workFiles.sessionId, sessionId), like(workFiles.path, `${prefix}%`))
    : eq(workFiles.sessionId, sessionId);
  const files = await db.select().from(workFiles).where(condition).orderBy(asc(workFiles.createdAt));
  return c.json(files);
});

// Batch create — MUST be before wildcard routes
filesRoutes.post("/batch", async (c) => {
  const sessionId = parseInt(c.req.param("id") || "0");
  const items = await c.req.json<Array<{ path: string; content?: string; isFolder?: boolean }>>();

  const allPaths = new Set<string>();
  for (const item of items) {
    const parts = item.path.split("/");
    for (let i = 1; i <= parts.length; i++) allPaths.add(parts.slice(0, i).join("/"));
  }

  const existing = await db.select({ path: workFiles.path }).from(workFiles).where(eq(workFiles.sessionId, sessionId));
  const existingPaths = new Set(existing.map((e) => e.path));
  const newPaths = Array.from(allPaths).filter((p) => !existingPaths.has(p));

  const ops = newPaths.map((fp) => {
    const item = items.find((i) => i.path === fp);
    return db.insert(workFiles).values({
      sessionId, path: fp,
      content: item?.content || "",
      isFolder: item?.isFolder || !item ? 1 : 0,
    });
  });

  if (ops.length > 0) for (const op of ops) await op;
  return c.json({ ok: true });
});

// 原子化重命名（单次操作，避免 PUT+DELETE 两步的不一致性）
filesRoutes.post("/rename", async (c) => {
  const sessionId = parseInt(c.req.param("id") || "0");
  const { oldPath, newPath } = await c.req.json<{ oldPath: string; newPath: string }>();
  if (!oldPath || !newPath) return c.json({ error: "oldPath and newPath required" }, 400);
  if (oldPath === newPath) return c.json({ ok: true });

  // 检查新路径是否已存在
  const existing = await db.select({ id: workFiles.id }).from(workFiles)
    .where(and(eq(workFiles.sessionId, sessionId), eq(workFiles.path, newPath))).limit(1);
  if (existing[0]) return c.json({ error: "Target path already exists" }, 409);

  // 更新文件本身
  await db.update(workFiles).set({ path: newPath, updatedAt: new Date().toISOString() })
    .where(and(eq(workFiles.sessionId, sessionId), eq(workFiles.path, oldPath)));

  // 更新子文件（文件夹重命名时）
  await db.update(workFiles).set({
    path: sql`REPLACE(${workFiles.path}, ${oldPath + "/"}, ${newPath + "/"})`,
    updatedAt: new Date().toISOString(),
  }).where(and(eq(workFiles.sessionId, sessionId), like(workFiles.path, `${oldPath}/%`)));

  return c.json({ ok: true });
});

filesRoutes.get("/*", async (c) => {
  const sessionId = parseInt(c.req.param("id") || "0");
  const filePath = getFilePath(c, sessionId);
  if (!filePath) return c.json({ error: "File path required" }, 400);
  const rows = await db.select().from(workFiles).where(and(eq(workFiles.sessionId, sessionId), eq(workFiles.path, filePath)));
  const file = rows[0];
  if (!file) return c.json({ error: "Not found" }, 404);
  return c.json(file);
});

filesRoutes.put("/*", async (c) => {
  const sessionId = parseInt(c.req.param("id") || "0");
  const filePath = getFilePath(c, sessionId);
  if (!filePath) return c.json({ error: "File path required" }, 400);
  const { content, isFolder } = await c.req.json<{ content?: string; isFolder?: boolean }>();

  const rows = await db.select().from(workFiles).where(and(eq(workFiles.sessionId, sessionId), eq(workFiles.path, filePath)));
  const existing = rows[0];

  if (existing) {
    await db.update(workFiles).set({
      content: content !== undefined ? content : existing.content,
      updatedAt: new Date().toISOString(),
    }).where(eq(workFiles.id, existing.id));
  } else {
    await db.insert(workFiles).values({ sessionId, path: filePath, content: content || "", isFolder: isFolder ? 1 : 0 });
  }

  if (filePath.includes("/")) {
    const parts = filePath.split("/");
    for (let i = 1; i < parts.length; i++) {
      const parentPath = parts.slice(0, i).join("/");
      const parentRows = await db.select().from(workFiles).where(and(eq(workFiles.sessionId, sessionId), eq(workFiles.path, parentPath)));
      if (!parentRows[0]) {
        await db.insert(workFiles).values({ sessionId, path: parentPath, content: "", isFolder: 1 });
      }
    }
  }

  return c.json({ ok: true });
});

filesRoutes.delete("/*", async (c) => {
  const sessionId = parseInt(c.req.param("id") || "0");
  const filePath = getFilePath(c, sessionId);
  if (!filePath) return c.json({ error: "File path required" }, 400);
  const allSessions = c.req.query("all") === "1";
  if (allSessions) {
    await db.delete(workFiles).where(like(workFiles.path, `${filePath}%`));
  } else {
    await db.delete(workFiles).where(and(eq(workFiles.sessionId, sessionId), like(workFiles.path, `${filePath}%`)));
  }
  return c.json({ ok: true });
});
