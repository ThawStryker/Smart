import { Hono } from "hono";
import { db } from "edgespark";
import { auth } from "edgespark/http";
import { eq, and, desc } from "drizzle-orm";
import { workAgents } from "@defs";

export const workRoutes = new Hono()
  .get("/api/work/agents", async (c) => {
    const userId = auth.user!.id;
    const rows = await db
      .select()
      .from(workAgents)
      .where(eq(workAgents.userId, userId))
      .orderBy(desc(workAgents.createdAt));
    return c.json(rows);
  })
  .post("/api/work/agents", async (c) => {
    const userId = auth.user!.id;
    const body = await c.req.json<{
      name: string; role?: string; systemPrompt?: string; tools?: string; skills?: string;
    }>();
    if (!body.name) return c.json({ error: "name required" }, 400);
    const [row] = await db.insert(workAgents).values({
      userId,
      name: body.name,
      role: body.role || "custom",
      systemPrompt: body.systemPrompt || "",
      tools: body.tools || "read,write,edit,list,grep",
      skills: body.skills || "",
    }).returning();
    return c.json(row, 201);
  })
  .patch("/api/work/agents/:id", async (c) => {
    const userId = auth.user!.id;
    const id = parseInt(c.req.param("id"), 10);
    const [existing] = await db.select().from(workAgents).where(and(eq(workAgents.id, id), eq(workAgents.userId, userId)));
    if (!existing) return c.json({ error: "Not found" }, 404);
    const body = await c.req.json<{
      name?: string; role?: string; systemPrompt?: string; tools?: string; skills?: string;
    }>();
    await db.update(workAgents).set({ ...body, updatedAt: new Date().toISOString() }).where(eq(workAgents.id, id));
    return c.json({ success: true });
  })
  .delete("/api/work/agents/:id", async (c) => {
    const userId = auth.user!.id;
    const id = parseInt(c.req.param("id"), 10);
    const [existing] = await db.select().from(workAgents).where(and(eq(workAgents.id, id), eq(workAgents.userId, userId)));
    if (!existing) return c.json({ error: "Not found" }, 404);
    await db.delete(workAgents).where(eq(workAgents.id, id));
    return c.json({ success: true });
  });
