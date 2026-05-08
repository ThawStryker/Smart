import { Hono } from "hono";
import { db } from "edgespark";
import { auth } from "edgespark/http";
import { eq, desc, and } from "drizzle-orm";
import { projects } from "@defs";

export const projectsRoutes = new Hono()
  .get("/", async (c) => {
    const userId = auth.user!.id;
    const rows = await db
      .select()
      .from(projects)
      .where(eq(projects.userId, userId))
      .orderBy(desc(projects.updatedAt));
    return c.json(rows);
  })
  .get("/:id", async (c) => {
    const userId = auth.user!.id;
    const id = parseInt(c.req.param("id"), 10);
    const [row] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)));
    if (!row) return c.json({ error: "Project not found" }, 404);
    return c.json(row);
  })
  .post("/", async (c) => {
    const userId = auth.user!.id;
    const body = await c.req.json<{ name: string; description?: string }>();
    const [row] = await db
      .insert(projects)
      .values({ userId, name: body.name, description: body.description ?? null })
      .returning();
    return c.json(row, 201);
  })
  .patch("/:id", async (c) => {
    const userId = auth.user!.id;
    const id = parseInt(c.req.param("id"), 10);
    const body = await c.req.json<{ name?: string; description?: string; status?: string; progress?: number }>();
    const [row] = await db
      .update(projects)
      .set({ ...body, updatedAt: new Date().toISOString() })
      .where(and(eq(projects.id, id), eq(projects.userId, userId)))
      .returning();
    if (!row) return c.json({ error: "Project not found" }, 404);
    return c.json(row);
  })
  .delete("/:id", async (c) => {
    const userId = auth.user!.id;
    const id = parseInt(c.req.param("id"), 10);
    const [row] = await db
      .delete(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)))
      .returning();
    if (!row) return c.json({ error: "Project not found" }, 404);
    return c.json({ success: true });
  });
