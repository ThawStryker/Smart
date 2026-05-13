import { Hono } from "hono";
import { db } from "edgespark";
import { auth } from "edgespark/http";
import { eq, and, desc, inArray } from "drizzle-orm";
import { marketListings, tools, domains } from "@defs";

export const marketRoutes = new Hono()
  .get("/api/public/market", async (c) => {
    const rows = await db
      .select()
      .from(marketListings)
      .where(eq(marketListings.status, "approved"))
      .orderBy(desc(marketListings.createdAt));

    // Get domain info for tool-type listings
    const toolIds = rows.filter(r => r.toolId > 0).map(r => r.toolId);
    const domainMap = new Map<number, string>();
    if (toolIds.length > 0) {
      const toolRows = await db.select().from(tools).where(inArray(tools.id, toolIds));
      const projectIds = toolRows.map(t => t.projectId);
      if (projectIds.length > 0) {
        const domainRows = await db.select().from(domains).where(
          and(inArray(domains.projectId, projectIds), eq(domains.status, "active"))
        );
        for (const d of domainRows) {
          domainMap.set(d.projectId, d.domain);
        }
      }
      // Map toolId → projectId → domain
      for (const t of toolRows) {
        const domain = domainMap.get(t.projectId);
        if (domain) domainMap.set(t.id, domain);
      }
    }

    const toLink = (r: typeof rows[number]) => {
      if (r.type === "url") {
        return r.url && /^https?:\/\//.test(r.url) ? r.url : `https://${r.url}`;
      }
      const domain = domainMap.get(r.toolId);
      return domain ? `https://${domain}` : null;
    };

    return c.json(rows.map(r => ({ ...r, link: toLink(r) })));
  })

  .get("/api/public/market/:id", async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const [row] = await db.select().from(marketListings).where(eq(marketListings.id, id));
    if (!row || row.status !== "approved") return c.json({ error: "Not found" }, 404);
    return c.json(row);
  })

  .get("/api/projects/:projectId/publish-status", async (c) => {
    const projectId = parseInt(c.req.param("projectId"), 10);

    const [tool] = await db
      .select()
      .from(tools)
      .where(eq(tools.projectId, projectId))
      .orderBy(desc(tools.createdAt))
      .limit(1);

    if (!tool) return c.json({ published: false });

    const [listing] = await db
      .select()
      .from(marketListings)
      .where(and(eq(marketListings.toolId, tool.id), eq(marketListings.type, "tool")))
      .orderBy(desc(marketListings.createdAt))
      .limit(1);

    if (!listing) return c.json({ published: false });

    return c.json({
      published: true,
      id: listing.id,
      title: listing.title,
      status: listing.status,
      version: listing.version,
    });
  })

  .post("/api/projects/:projectId/publish", async (c) => {
    const userId = auth.user!.id;
    const projectId = parseInt(c.req.param("projectId"), 10);

    const body = await c.req.json<{ title: string; description?: string; category?: string }>();
    if (!body.title) return c.json({ error: "title required" }, 400);

    const [tool] = await db
      .select()
      .from(tools)
      .where(eq(tools.projectId, projectId))
      .orderBy(desc(tools.createdAt))
      .limit(1);
    if (!tool) return c.json({ error: "No tool found" }, 404);

    const [existing] = await db
      .select()
      .from(marketListings)
      .where(and(eq(marketListings.toolId, tool.id), eq(marketListings.type, "tool")));
    if (existing) {
      return c.json({ error: "Already published. Use update instead.", id: existing.id }, 409);
    }

    const [row] = await db.insert(marketListings).values({
      toolId: tool.id,
      sellerId: userId,
      title: body.title,
      description: body.description || "",
      category: body.category || "",
      type: "tool",
      status: "pending_review",
      version: 1,
    }).returning();
    return c.json(row, 201);
  })

  .post("/api/market/:id/update", async (c) => {
    const userId = auth.user!.id;
    const id = parseInt(c.req.param("id"), 10);
    const [existing] = await db.select().from(marketListings).where(eq(marketListings.id, id));
    if (!existing) return c.json({ error: "Not found" }, 404);
    if (existing.sellerId !== userId) return c.json({ error: "Not authorized" }, 403);
    if (existing.type !== "tool") return c.json({ error: "URL listings cannot be updated this way" }, 400);

    const body = await c.req.json<{ title?: string; description?: string; category?: string }>();
    await db.update(marketListings).set({
      ...body,
      version: (existing.version || 1) + 1,
      status: "pending_review",
    }).where(eq(marketListings.id, id));
    return c.json({ success: true, version: (existing.version || 1) + 1 });
  });
