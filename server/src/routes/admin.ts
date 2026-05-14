import { Hono } from "hono";
import type { Context, Next } from "hono";
import { db } from "edgespark";
import { auth } from "edgespark/http";
import { eq, inArray, desc } from "drizzle-orm";
import { marketListings, skills, mcps, tools } from "@defs";
import { isAdmin } from "../lib/admin-check";

async function requireAdmin(c: Context): Promise<Response | null> {
  if (!(await isAdmin(auth.user!.id))) {
    return c.json({ error: "Admin only" }, 403);
  }
  return null;
}

export const adminRoutes = new Hono()
  .use("/api/admin/*", async (c, next) => {
    const res = await requireAdmin(c);
    if (res) return res;
    await next();
  })

  .get("/api/admin/market/pending", async (c) => {
    const rows = await db
      .select()
      .from(marketListings)
      .where(eq(marketListings.status, "pending_review"));

    // Fetch tool info for preview URLs
    const toolIds = rows.filter(r => r.toolId > 0).map(r => r.toolId);
    const toolMap = new Map<number, { projectId: number; toolId: number }>();
    if (toolIds.length > 0) {
      const toolRows = await db.select().from(tools).where(inArray(tools.id, toolIds));
      for (const t of toolRows) {
        toolMap.set(t.id, { projectId: t.projectId, toolId: t.id });
      }
    }

    return c.json(rows.map(r => {
      const tool = toolMap.get(r.toolId);
      return {
        ...r,
        projectId: tool?.projectId || null,
        _toolId: tool?.toolId || r.toolId,
      };
    }));
  })

  .post("/api/admin/market/:id/approve", async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const [row] = await db.select().from(marketListings).where(eq(marketListings.id, id));
    if (!row) return c.json({ error: "Not found" }, 404);

    await db.update(marketListings).set({ status: "approved" }).where(eq(marketListings.id, id));
    return c.json({ success: true });
  })

  .get("/api/admin/market/approved", async (c) => {
    const rows = await db
      .select()
      .from(marketListings)
      .where(eq(marketListings.status, "approved"))
      .orderBy(desc(marketListings.createdAt));
    return c.json(rows);
  })

  .post("/api/admin/market/:id/delist", async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const [row] = await db.select().from(marketListings).where(eq(marketListings.id, id));
    if (!row) return c.json({ error: "Not found" }, 404);

    await db.update(marketListings).set({ status: "removed" }).where(eq(marketListings.id, id));
    return c.json({ success: true });
  })

  .post("/api/admin/market/:id/reject", async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const [row] = await db.select().from(marketListings).where(eq(marketListings.id, id));
    if (!row) return c.json({ error: "Not found" }, 404);

    await db.update(marketListings).set({ status: "rejected" }).where(eq(marketListings.id, id));
    return c.json({ success: true });
  })

  .post("/api/admin/market/url", async (c) => {
    const body = await c.req.json<{ title: string; description?: string; url: string; category?: string }>();
    if (!body.title || !body.url) return c.json({ error: "title and url required" }, 400);

    const [row] = await db.insert(marketListings).values({
      toolId: 0,
      sellerId: auth.user!.id,
      title: body.title,
      description: body.description || "",
      category: body.category || "",
      type: "url",
      url: body.url,
      status: "approved",
    }).returning();
    return c.json(row, 201);
  })

  .post("/api/admin/skills", async (c) => {
    const body = await c.req.json<{ name: string; description?: string; gitUrl?: string; hidden?: boolean }>();
    if (!body.name) return c.json({ error: "name required" }, 400);

    const [row] = await db.insert(skills).values({
      name: body.name,
      description: body.description || "",
      visibility: "global",
      ownerId: auth.user!.id,
      sourceType: body.gitUrl ? "git" : "zip",
      sourceUrl: body.gitUrl || null,
      storagePath: `skills/global/${Date.now()}/`,
      hidden: body.hidden ?? false,
    }).returning();
    return c.json(row, 201);
  })

  .post("/api/admin/mcps", async (c) => {
    const body = await c.req.json<{ name: string; description?: string; config?: Record<string, unknown>; hidden?: boolean }>();
    if (!body.name) return c.json({ error: "name required" }, 400);

    const [row] = await db.insert(mcps).values({
      name: body.name,
      description: body.description || "",
      visibility: "global",
      ownerId: auth.user!.id,
      config: body.config ? JSON.stringify(body.config) : null,
      hidden: body.hidden ?? false,
    }).returning();
    return c.json(row, 201);
  });
