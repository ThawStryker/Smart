import { Hono } from "hono";
import { db } from "edgespark";
import { auth } from "edgespark/http";
import { eq, and, like, asc } from "drizzle-orm";
import { workspaceFiles } from "@defs";

export const workspaceRoutes = new Hono();

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
