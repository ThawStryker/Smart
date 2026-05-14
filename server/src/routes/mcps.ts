import { Hono } from "hono";
import { db } from "edgespark";
import { auth } from "edgespark/http";
import { eq, and, or } from "drizzle-orm";
import { mcps } from "@defs";

export const mcpsRoutes = new Hono()
  .get("/api/mcps", async (c) => {
    const userId = auth.user!.id;
    const rows = await db
      .select()
      .from(mcps)
      .where(
        and(
          eq(mcps.hidden, false),
          or(
            eq(mcps.visibility, "global"),
            and(eq(mcps.visibility, "private"), eq(mcps.ownerId, userId))
          )
        )
      )
      .orderBy(mcps.createdAt);
    return c.json(rows);
  })

  .post("/api/mcps", async (c) => {
    const userId = auth.user!.id;
    const body = await c.req.json<{ name: string; description?: string; config?: Record<string, unknown> }>();
    if (!body.name) return c.json({ error: "name required" }, 400);

    const [row] = await db.insert(mcps).values({
      name: body.name,
      description: body.description || "",
      visibility: "private",
      ownerId: userId,
      config: body.config ? JSON.stringify(body.config) : null,
    }).returning();
    return c.json(row, 201);
  })

  .patch("/api/mcps/:id", async (c) => {
    const userId = auth.user!.id;
    const id = parseInt(c.req.param("id"), 10);
    const [existing] = await db.select().from(mcps).where(eq(mcps.id, id));
    if (!existing) return c.json({ error: "MCP not found" }, 404);
    if (existing.visibility === "private" && existing.ownerId !== userId) {
      return c.json({ error: "Not authorized" }, 403);
    }

    const body = await c.req.json<{ name?: string; description?: string; config?: Record<string, unknown>; enabled?: boolean }>();
    const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (body.name !== undefined) update.name = body.name;
    if (body.description !== undefined) update.description = body.description;
    if (body.config !== undefined) update.config = JSON.stringify(body.config);
    if (body.enabled !== undefined) update.enabled = body.enabled;

    await db.update(mcps).set(update).where(eq(mcps.id, id));
    return c.json({ success: true });
  })

  .delete("/api/mcps/:id", async (c) => {
    const userId = auth.user!.id;
    const id = parseInt(c.req.param("id"), 10);
    const [existing] = await db.select().from(mcps).where(eq(mcps.id, id));
    if (!existing) return c.json({ error: "MCP not found" }, 404);
    if (existing.visibility === "private" && existing.ownerId !== userId) {
      return c.json({ error: "Not authorized" }, 403);
    }

    await db.delete(mcps).where(eq(mcps.id, id));
    return c.json({ success: true });
  });
