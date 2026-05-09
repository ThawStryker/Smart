import { Hono } from "hono";
import { db } from "edgespark";
import { auth } from "edgespark/http";
import { eq, and } from "drizzle-orm";
import { toolData } from "@defs";

export const toolDataRoutes = new Hono()
  .get("/.smart/data/:key", async (c) => {
    const key = c.req.param("key");
    const projectId = parseInt(c.req.query("projectId") || "0", 10);
    if (!projectId) return c.json({ error: "projectId required" }, 400);

    const userId = auth.user?.id;
    if (!userId) return c.json({ value: null });

    const [row] = await db
      .select()
      .from(toolData)
      .where(and(
        eq(toolData.projectId, projectId),
        eq(toolData.userId, userId),
        eq(toolData.key, key),
      ));

    if (!row) return c.json({ value: null });
    try { return c.json({ value: JSON.parse(row.value) }); }
    catch { return c.json({ value: row.value }); }
  })
  .put("/.smart/data/:key", async (c) => {
    const userId = auth.user?.id;
    if (!userId) return c.json({ error: "Login required" }, 401);

    const key = c.req.param("key");
    const body = await c.req.json<{ value: unknown; projectId: number }>();
    if (!body.projectId) return c.json({ error: "projectId required" }, 400);

    const valueStr = typeof body.value === "string" ? body.value : JSON.stringify(body.value);

    const [existing] = await db
      .select()
      .from(toolData)
      .where(and(
        eq(toolData.projectId, body.projectId),
        eq(toolData.userId, userId),
        eq(toolData.key, key),
      ));

    if (existing) {
      await db
        .update(toolData)
        .set({ value: valueStr, updatedAt: new Date().toISOString() })
        .where(eq(toolData.id, existing.id));
    } else {
      await db
        .insert(toolData)
        .values({ projectId: body.projectId, userId, key, value: valueStr });
    }

    return c.json({ success: true });
  })
  .delete("/.smart/data/:key", async (c) => {
    const userId = auth.user?.id;
    if (!userId) return c.json({ error: "Login required" }, 401);

    const key = c.req.param("key");
    const projectId = parseInt(c.req.query("projectId") || "0", 10);
    if (!projectId) return c.json({ error: "projectId required" }, 400);

    await db
      .delete(toolData)
      .where(and(
        eq(toolData.projectId, projectId),
        eq(toolData.userId, userId),
        eq(toolData.key, key),
      ));

    return c.json({ success: true });
  })
  .get("/.smart/auth/user", (c) => {
    if (!auth.user) return c.json({ user: null });
    return c.json({ user: { id: auth.user.id, email: auth.user.email, name: auth.user.name } });
  });
