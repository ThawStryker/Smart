import { Hono } from "hono";
import { db } from "edgespark";
import { auth } from "edgespark/http";
import { eq, and, like, asc, sql } from "drizzle-orm";
import { workspaceFiles } from "@defs";

export const workspaceRoutes = new Hono();

// 原子化重命名
workspaceRoutes.post("/rename", async (c) => {
  const userId = auth.user!.id;
  const { oldPath, newPath } = await c.req.json<{ oldPath: string; newPath: string }>();
  if (!oldPath || !newPath) return c.json({ error: "oldPath and newPath required" }, 400);
  if (oldPath === newPath) return c.json({ ok: true });

  const existing = await db.select({ id: workspaceFiles.id }).from(workspaceFiles)
    .where(and(eq(workspaceFiles.userId, userId), eq(workspaceFiles.path, newPath))).limit(1);
  if (existing[0]) return c.json({ error: "Target path already exists" }, 409);

  await db.update(workspaceFiles).set({ path: newPath, updatedAt: new Date().toISOString() })
    .where(and(eq(workspaceFiles.userId, userId), eq(workspaceFiles.path, oldPath)));
  await db.update(workspaceFiles).set({
    path: sql`REPLACE(${workspaceFiles.path}, ${oldPath + "/"}, ${newPath + "/"})`,
    updatedAt: new Date().toISOString(),
  }).where(and(eq(workspaceFiles.userId, userId), like(workspaceFiles.path, `${oldPath}/%`)));

  return c.json({ ok: true });
});

// List workspace files
workspaceRoutes.get("/", async (c) => {
  const userId = auth.user!.id;
  const prefix = c.req.query("prefix") || "";
  const condition = prefix
    ? and(eq(workspaceFiles.userId, userId), like(workspaceFiles.path, `${prefix}%`))
    : eq(workspaceFiles.userId, userId);
  const files = await db.select().from(workspaceFiles).where(condition).orderBy(asc(workspaceFiles.createdAt));
  return c.json(files);
});

// Get single file
workspaceRoutes.get("/:path{.+}", async (c) => {
  const userId = auth.user!.id;
  const filePath = c.req.param("path");
  if (!filePath) return c.json({ error: "Path required" }, 400);
  const rows = await db.select().from(workspaceFiles).where(and(eq(workspaceFiles.userId, userId), eq(workspaceFiles.path, filePath)));
  const file = rows[0];
  if (!file) return c.json({ error: "Not found" }, 404);
  return c.json(file);
});

workspaceRoutes.put("/:path{.+}", async (c) => {
  const userId = auth.user!.id;
  const filePath = c.req.param("path");
  if (!filePath) return c.json({ error: "Path required" }, 400);
  const { content, isFolder } = await c.req.json<{ content?: string; isFolder?: boolean }>();

  const rows = await db.select().from(workspaceFiles).where(and(eq(workspaceFiles.userId, userId), eq(workspaceFiles.path, filePath)));
  const existing = rows[0];

  if (existing) {
    await db.update(workspaceFiles).set({
      content: content !== undefined ? content : existing.content,
      updatedAt: new Date().toISOString(),
    }).where(eq(workspaceFiles.id, existing.id));
  } else {
    await db.insert(workspaceFiles).values({ userId, path: filePath, content: content || "", isFolder: isFolder ? 1 : 0 });
    if (filePath.includes("/")) {
      const parts = filePath.split("/");
      for (let i = 1; i < parts.length; i++) {
        const parentPath = parts.slice(0, i).join("/");
        const parentRows = await db.select().from(workspaceFiles).where(and(eq(workspaceFiles.userId, userId), eq(workspaceFiles.path, parentPath)));
        if (!parentRows[0]) {
          await db.insert(workspaceFiles).values({ userId, path: parentPath, content: "", isFolder: 1 });
        }
      }
    }
  }

  return c.json({ ok: true });
});

workspaceRoutes.delete("/:path{.+}", async (c) => {
  const userId = auth.user!.id;
  const filePath = c.req.param("path");
  if (!filePath) return c.json({ error: "Path required" }, 400);
  await db.delete(workspaceFiles).where(and(eq(workspaceFiles.userId, userId), like(workspaceFiles.path, `${filePath}%`)));
  return c.json({ ok: true });
});
