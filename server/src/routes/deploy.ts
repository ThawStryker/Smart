import { Hono } from "hono";
import { db } from "edgespark";
import { auth } from "edgespark/http";
import { eq, and, desc } from "drizzle-orm";
import { projects, tools, domains } from "@defs";

export const deployRoutes = new Hono()
  .post("/:projectId/deploy", async (c) => {
    const userId = auth.user!.id;
    const projectId = parseInt(c.req.param("projectId"), 10);

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
    if (!project) return c.json({ error: "Project not found" }, 404);

    // Check if project already has an active domain
    const [activeDomain] = await db
      .select()
      .from(domains)
      .where(and(eq(domains.projectId, projectId), eq(domains.status, "active")));
    if (activeDomain) return c.json({ error: "Project already has an active domain", domain: activeDomain.domain }, 409);

    // Check for in-progress deployment
    const [existing] = await db
      .select()
      .from(domains)
      .where(and(
        eq(domains.projectId, projectId),
        eq(domains.status, "pending"),
      ));
    if (existing) return c.json({ error: "Deployment already in progress", domain: existing.domain }, 409);

    const body = await c.req.json<{ subdomain: string }>();
    if (!body.subdomain?.trim()) return c.json({ error: "subdomain required" }, 400);

    const subdomain = body.subdomain.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!subdomain || subdomain.length < 2) return c.json({ error: "Invalid subdomain (min 2 chars, a-z0-9-)" }, 400);

    const fullDomain = `${subdomain}.torresx.cn`;

    // Check global uniqueness
    const [dup] = await db
      .select()
      .from(domains)
      .where(eq(domains.domain, fullDomain));
    if (dup) return c.json({ error: "Domain already in use" }, 409);

    const [tool] = await db
      .select()
      .from(tools)
      .where(eq(tools.projectId, projectId))
      .orderBy(desc(tools.createdAt))
      .limit(1);
    if (!tool) return c.json({ error: "No tool found for this project" }, 404);

    await db.insert(domains).values({
      projectId,
      toolId: tool.id,
      domain: fullDomain,
      status: "pending",
    });

    return c.json({
      success: true,
      domain: fullDomain,
      status: "pending",
    });
  })

  .get("/:projectId/check-domain", async (c) => {
    const domain = c.req.query("domain");
    if (!domain) return c.json({ error: "domain query required" }, 400);
    const fullDomain = `${domain.toLowerCase().replace(/[^a-z0-9-]/g, "")}.torresx.cn`;
    const [existing] = await db.select().from(domains).where(eq(domains.domain, fullDomain));
    return c.json({ available: !existing, status: existing?.status || null });
  })

  .get("/:projectId/deploy-status", async (c) => {
    const userId = auth.user!.id;
    const projectId = parseInt(c.req.param("projectId"), 10);

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
    if (!project) return c.json({ error: "Project not found" }, 404);

    const [domainRow] = await db
      .select()
      .from(domains)
      .where(eq(domains.projectId, projectId))
      .orderBy(desc(domains.createdAt))
      .limit(1);

    if (!domainRow) {
      return c.json({ deployed: false });
    }

    return c.json({
      deployed: domainRow.status === "active",
      domain: domainRow.domain,
      status: domainRow.status,
    });
  })

  .post("/:projectId/deploy/cancel", async (c) => {
    const userId = auth.user!.id;
    const projectId = parseInt(c.req.param("projectId"), 10);

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
    if (!project) return c.json({ error: "Project not found" }, 404);

    const [domainRow] = await db
      .select()
      .from(domains)
      .where(and(
        eq(domains.projectId, projectId),
        eq(domains.status, "pending"),
      ))
      .orderBy(desc(domains.createdAt))
      .limit(1);

    if (!domainRow) {
      // Check dns_ready
      const [ready] = await db
        .select()
        .from(domains)
        .where(and(
          eq(domains.projectId, projectId),
          eq(domains.status, "dns_ready"),
        ))
        .orderBy(desc(domains.createdAt))
        .limit(1);

      if (!ready) return c.json({ error: "No active deployment to cancel" }, 404);

      await db.update(domains).set({ status: "removing" }).where(eq(domains.id, ready.id));
      return c.json({ success: true, status: "removing" });
    }

    await db.update(domains).set({ status: "removing" }).where(eq(domains.id, domainRow.id));
    return c.json({ success: true, status: "removing" });
  });
