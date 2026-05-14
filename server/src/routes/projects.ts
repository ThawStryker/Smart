import { Hono } from "hono";
import { db, storage, ctx } from "edgespark";
import { auth } from "edgespark/http";
import { eq, desc, and, inArray } from "drizzle-orm";
import { projects, tools, domains, executionSteps, conversations, conversationStates, versions, marketListings, toolData, toolUsers, buckets } from "@defs";
import { listDnsRecords, deleteDnsRecord } from "../lib/aliyun-dns";

export const projectsRoutes = new Hono()
  .get("/", async (c) => {
    const userId = auth.user!.id;
    const rows = await db
      .select()
      .from(projects)
      .where(eq(projects.userId, userId))
      .orderBy(desc(projects.updatedAt));

    // Enrich with deploy/publish status
    const enriched = await Promise.all(rows.map(async (p) => {
      const [domain] = await db.select().from(domains).where(eq(domains.projectId, p.id)).limit(1);
      const [tool] = await db.select().from(tools).where(eq(tools.projectId, p.id)).limit(1);
      let publishStatus = "unpublished";
      if (tool) {
        const [listing] = await db.select().from(marketListings)
          .where(and(eq(marketListings.toolId, tool.id), eq(marketListings.status, "approved"))).limit(1);
        if (listing) publishStatus = "published";
      }
      return {
        ...p,
        deployStatus: domain ? (domain.status === "active" ? "deployed" : "deploying") : "none",
        publishStatus,
      };
    }));
    return c.json(enriched);
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
  .post("/:projectId/icon", async (c) => {
    const userId = auth.user!.id;
    const projectId = parseInt(c.req.param("projectId"), 10);
    const [p] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
    if (!p) return c.json({ error: "Not found" }, 404);

    const formData = await c.req.formData();
    const file = formData.get("file") as File;
    if (!file) return c.json({ error: "file required" }, 400);

    const buf = await file.arrayBuffer();
    const path = `icons/${projectId}.png`;
    await storage.from(buckets.sourceBuckets).put(path, buf);
    await db.update(projects).set({ iconPath: path, updatedAt: new Date().toISOString() }).where(eq(projects.id, projectId));

    // Return presigned URL for display
    const { downloadUrl } = await storage.from(buckets.sourceBuckets).createPresignedGetUrl(path, 86400);
    return c.json({ iconPath: path, url: downloadUrl });
  })
  .post("/:projectId/clear-context", async (c) => {
    const userId = auth.user!.id;
    const projectId = parseInt(c.req.param("projectId"), 10);
    const [p] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
    if (!p) return c.json({ error: "Not found" }, 404);
    await db.delete(conversations).where(eq(conversations.projectId, projectId));
    await db.delete(conversationStates).where(eq(conversationStates.projectId, projectId));
    return c.json({ success: true });
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
    const projectId = parseInt(c.req.param("id"), 10);

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
    if (!project) return c.json({ error: "Project not found" }, 404);

    // 1. Get tool IDs for this project
    const projectTools = await db
      .select({ id: tools.id })
      .from(tools)
      .where(eq(tools.projectId, projectId));
    const toolIds = projectTools.map(t => t.id);

    // 2. Clean up domains — delete Alibaba Cloud DNS records, then mark as removing
    const projectDomains = await db
      .select()
      .from(domains)
      .where(eq(domains.projectId, projectId));

    for (const d of projectDomains) {
      if (d.status === "dns_ready" || d.status === "active") {
        // Delete DNS records from Alibaba Cloud
        const subdomain = d.domain.replace(".torresx.cn", "");
        try {
          const records = await listDnsRecords(subdomain);
          for (const r of records) {
            await deleteDnsRecord(r.recordId);
          }
        } catch { /* DNS cleanup best-effort */ }
      }
      // Mark as removing so daemon handles edgespark domain remove
      await db.update(domains).set({ status: "removing" }).where(eq(domains.id, d.id));
    }

    // 3. Delete related data
    if (toolIds.length > 0) {
      await db.delete(executionSteps).where(inArray(executionSteps.toolId, toolIds));
      await db.delete(versions).where(inArray(versions.toolId, toolIds));
      await db.delete(marketListings).where(inArray(marketListings.toolId, toolIds));
    }
    await db.delete(conversations).where(eq(conversations.projectId, projectId));
    await db.delete(toolData).where(eq(toolData.projectId, projectId));
    await db.delete(toolUsers).where(eq(toolUsers.projectId, projectId));

    // 4. Delete tools
    if (toolIds.length > 0) {
      await db.delete(tools).where(eq(tools.projectId, projectId));
    }

    // 5. Delete project
    await db.delete(projects).where(eq(projects.id, projectId));

    // 6. Clean up R2 files (background)
    ctx.runInBackground((async () => {
      try {
        const prefix = `${projectId}/`;
        const bucket = storage.from(buckets.sourceBuckets);
        const toDelete: string[] = [];
        let cursor: string | undefined;
        do {
          const page = await bucket.list({ prefix, cursor, limit: 1000 });
          for (const f of page.files) toDelete.push(f.path);
          cursor = page.cursor;
        } while (cursor);
        for (let i = 0; i < toDelete.length; i += 500) {
          await bucket.delete(toDelete.slice(i, i + 500));
        }
      } catch { /* R2 cleanup best-effort */ }
    })());

    return c.json({ success: true });
  });
