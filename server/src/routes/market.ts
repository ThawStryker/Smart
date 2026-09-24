import { Hono } from "hono";
import { db } from "edgespark";
import { auth } from "edgespark/http";
import { eq, and, desc, inArray } from "drizzle-orm";
import { marketListings, tools, domains, projects, marketAgentFiles, userAgents, agentFiles } from "@defs";
import { nextUniqueAgentName } from "../lib/agent-name";
import { pickRandomAvatar } from "../lib/agent-avatar";

export const marketRoutes = new Hono()
  .get("/api/public/market", async (c) => {
    const featuredOnly = c.req.query("featured") === "true";
    const type = c.req.query("type") || "tool";
    const typeFilter = type === "talent"
      ? eq(marketListings.type, "talent")
      : inArray(marketListings.type, ["tool", "url"]);
    const where = featuredOnly
      ? and(eq(marketListings.status, "approved"), eq(marketListings.featured, true), typeFilter)
      : and(eq(marketListings.status, "approved"), typeFilter);
    const rows = await db
      .select()
      .from(marketListings)
      .where(where)
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
      // Map toolId → projectId → domain + icon
      for (const t of toolRows) {
        const domain = domainMap.get(t.projectId);
        if (domain) domainMap.set(t.id, domain);
      }

      // Load project icons
      const projectRows = await db.select({ id: projects.id, iconPath: projects.iconPath })
        .from(projects).where(inArray(projects.id, projectIds));
      const iconMap = new Map(projectRows.map(p => [p.id, p.iconPath]));
      const toolProjectMap = new Map(toolRows.map(t => [t.id, t.projectId]));
      for (const r of rows) {
        if (r.toolId > 0) {
          const pid = toolProjectMap.get(r.toolId);
          if (pid) (r as any)._projectId = pid;
          if (pid && iconMap.get(pid)) (r as any)._hasIcon = true;
        }
      }
    }

    const toLink = (r: typeof rows[number]) => {
      if (r.type === "url") {
        return r.url && /^https?:\/\//.test(r.url) ? r.url : `https://${r.url}`;
      }
      const domain = domainMap.get(r.toolId);
      return domain ? `https://${domain}` : null;
    };

    const me = auth.user?.id;
    return c.json(rows.map(r => ({ ...r, link: toLink(r), mine: Boolean(me && r.sellerId === me) })));
  })

  .get("/api/public/market/:id", async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const [row] = await db.select().from(marketListings).where(eq(marketListings.id, id));
    if (!row || row.status !== "approved") return c.json({ error: "Not found" }, 404);
    return c.json(row);
  })

  .post("/api/market/talent/install", async (c) => {
    const userId = auth.user!.id;
    const body = await c.req.json<{ listingIds?: number[] }>();
    const listingIds = (body.listingIds || []).filter((id) => Number.isInteger(id) && id > 0);
    if (listingIds.length === 0) return c.json({ error: "listingIds required" }, 400);

    const listings = await db.select().from(marketListings).where(inArray(marketListings.id, listingIds));
    const installed: Array<{ listingId: number; name: string }> = [];

    const existingAgents = await db.select({
      name: userAgents.name,
      sourceListingId: userAgents.sourceListingId,
    }).from(userAgents).where(eq(userAgents.userId, userId));
    const usedNames = existingAgents.map((a) => a.name);
    const alreadyInstalled = new Set(
      existingAgents.map((a) => a.sourceListingId).filter((id): id is number => id != null),
    );
    let skippedExisting = false;
    let skippedOwn = false;

    for (const listing of listings) {
      if (listing.status !== "approved" || listing.type !== "talent") continue;
      if (listing.sellerId === userId) {
        skippedOwn = true;
        continue;
      }
      if (alreadyInstalled.has(listing.id)) {
        skippedExisting = true;
        continue;
      }
      const base = listing.sourceAgentName || listing.title;
      const name = nextUniqueAgentName(usedNames, base);
      usedNames.push(name);

      const snapshot = await db.select().from(marketAgentFiles).where(eq(marketAgentFiles.listingId, listing.id));
      const agentsMd = snapshot.find((f) => f.path === "AGENTS.md")?.content || "";
      const userMd = snapshot.find((f) => f.path === "memory/USER.md")?.content || "";
      const memoryMd = snapshot.find((f) => f.path === "memory/MEMORY.md")?.content || "";

      await db.insert(userAgents).values({
        userId,
        name,
        title: listing.title || name,
        agentsMd,
        userMd,
        memoryMd,
        sourceListingId: listing.id,
        avatar: pickRandomAvatar(),
      });
      for (const f of snapshot) {
        await db.insert(agentFiles).values({
          userId,
          agentName: name,
          path: f.path,
          content: f.content || "",
          isFolder: f.isFolder || 0,
        });
      }
      await db.update(marketListings).set({
        downloads: (listing.downloads || 0) + 1,
      }).where(eq(marketListings.id, listing.id));
      alreadyInstalled.add(listing.id);
      installed.push({ listingId: listing.id, name });
    }

    if (installed.length === 0) {
      if (skippedOwn) return c.json({ error: "这是你发布的 Agent，无需添加" }, 409);
      if (skippedExisting) return c.json({ error: "已经添加过，请先在 Work 中删除" }, 409);
      return c.json({ error: "没有可安装的人才（需已审核通过）" }, 400);
    }
    return c.json({ ok: true, installed });
  })

  .get("/api/projects/:projectId/publish-status", async (c) => {
    const userId = auth.user!.id;
    const projectId = parseInt(c.req.param("projectId"), 10);
    const [project] = await db.select({ id: projects.id }).from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
    if (!project) return c.json({ error: "Not found" }, 404);

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
      description: listing.description || "",
      category: listing.category || "",
      status: listing.status,
      version: listing.version,
    });
  })

  .post("/api/projects/:projectId/publish", async (c) => {
    const userId = auth.user!.id;
    const projectId = parseInt(c.req.param("projectId"), 10);
    const [project] = await db.select({ id: projects.id }).from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
    if (!project) return c.json({ error: "Not found" }, 404);

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
      if (existing.status === "pending_review") {
        return c.json({ error: "已提交审核，请等待管理员审核。", id: existing.id }, 409);
      }
      if (existing.status === "approved") {
        return c.json({ error: "已发布。如需更新请使用更新功能。", id: existing.id }, 409);
      }
      // rejected or delisted — clean up old listing and allow re-publish
      await db.delete(marketListings).where(eq(marketListings.id, existing.id));
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
