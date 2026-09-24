import { Hono } from "hono";
import type { Context, Next } from "hono";
import { db, storage } from "edgespark";
import { auth } from "edgespark/http";
import { eq, inArray, desc } from "drizzle-orm";
import { marketListings, skills, mcps, tools, buckets, marketAgentFiles, domains, projects } from "@defs";
import { isAdmin } from "../lib/admin-check";
import { deleteDnsRecord, listAllDnsRecords } from "../lib/aliyun-dns";
import { platformRemoveDomain } from "../lib/edgespark-domain";
import {
  domainAvailability,
  hostnameOf,
  isProtectedSubdomain,
  projectOnlineLabel,
  recordsForSubdomain,
  shouldListSubdomain,
  subdomainKey,
  isInfraRecord,
} from "../lib/domain-admin";
import { toolDomain } from "../lib/tool-host";

async function requireAdmin(c: Context): Promise<Response | null> {
  if (!(await isAdmin(auth.user!.id))) {
    return c.json({ error: "Admin only" }, 403);
  }
  return null;
}

/** 从快照取 AGENTS.md 前 400 字，给审核/已上架列表预览 */
async function talentAgentsMdPreview(listingIds: number[]): Promise<Map<number, string>> {
  const previewMap = new Map<number, string>();
  if (listingIds.length === 0) return previewMap;
  const snaps = await db.select().from(marketAgentFiles).where(inArray(marketAgentFiles.listingId, listingIds));
  for (const f of snaps) {
    if (f.path === "AGENTS.md") previewMap.set(f.listingId, (f.content || "").slice(0, 400));
  }
  return previewMap;
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

    const previewMap = await talentAgentsMdPreview(rows.filter((r) => r.type === "talent").map((r) => r.id));

    return c.json(rows.map(r => {
      const tool = toolMap.get(r.toolId);
      return {
        ...r,
        projectId: tool?.projectId || null,
        _toolId: tool?.toolId || r.toolId,
        agentsMdPreview: r.type === "talent" ? (previewMap.get(r.id) || "") : undefined,
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
    const previewMap = await talentAgentsMdPreview(rows.filter((r) => r.type === "talent").map((r) => r.id));
    return c.json(rows.map((r) => ({
      ...r,
      agentsMdPreview: r.type === "talent" ? (previewMap.get(r.id) || "") : undefined,
    })));
  })

  .post("/api/admin/market/:id/delist", async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const [row] = await db.select().from(marketListings).where(eq(marketListings.id, id));
    if (!row) return c.json({ error: "Not found" }, 404);

    await db.update(marketListings).set({ status: "removed" }).where(eq(marketListings.id, id));
    return c.json({ success: true });
  })

  .post("/api/admin/market/:id/featured", async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const [row] = await db.select().from(marketListings).where(eq(marketListings.id, id));
    if (!row) return c.json({ error: "Not found" }, 404);

    const body = await c.req.json<{ featured: boolean }>();
    await db.update(marketListings).set({ featured: body.featured }).where(eq(marketListings.id, id));
    return c.json({ success: true, featured: body.featured });
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
    const body = await c.req.json<{ name: string; description?: string; gitUrl?: string; hidden?: boolean; skillMd?: string }>();
    if (!body.name) return c.json({ error: "name required" }, 400);

    const storagePath = `skills/global/${Date.now()}/`;

    // If SKILL.md content provided inline, write directly to R2
    if (body.skillMd) {
      await storage.from(buckets.sourceBuckets).put(storagePath + "SKILL.md", new TextEncoder().encode(body.skillMd));
    }

    const [row] = await db.insert(skills).values({
      name: body.name,
      description: body.description || "",
      visibility: "global",
      ownerId: auth.user!.id,
      sourceType: body.gitUrl ? "git" : "zip",
      sourceUrl: body.gitUrl || null,
      storagePath,
      hidden: body.hidden ?? false,
      status: body.skillMd ? "installed" : "installing",
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
  })

  .get("/api/admin/domains", async (c) => {
    let aliyun: Awaited<ReturnType<typeof listAllDnsRecords>> = [];
    let aliyunError = "";
    try {
      aliyun = await listAllDnsRecords();
    } catch (err) {
      const raw = err instanceof Error ? err.message : "阿里云解析读取失败";
      aliyunError = /credentials not configured/i.test(raw)
        ? "本地未配置阿里云密钥，目前只显示系统里已绑定的子域"
        : raw;
    }
    const domainRows = await db.select().from(domains);

    const projectIds = [...new Set(domainRows.map((d) => d.projectId))];
    const toolIds = [...new Set(domainRows.map((d) => d.toolId))];
    const projectRows = projectIds.length
      ? await db.select().from(projects).where(inArray(projects.id, projectIds))
      : [];
    const listingRows = toolIds.length
      ? await db.select().from(marketListings).where(inArray(marketListings.toolId, toolIds))
      : [];

    const projectMap = new Map(projectRows.map((p) => [p.id, p]));
    const listingByTool = new Map<number, typeof listingRows>();
    for (const row of listingRows) {
      const list = listingByTool.get(row.toolId) || [];
      list.push(row);
      listingByTool.set(row.toolId, list);
    }

    const domainBySub = new Map<string, (typeof domainRows)[0]>();
    for (const row of domainRows) {
      const sub = row.domain.replace(/\.torresx\.cn$/i, "").toLowerCase() || "@";
      domainBySub.set(sub, row);
    }

    const keys = new Set<string>();
    for (const rec of aliyun) {
      const key = subdomainKey(rec.rr);
      if (shouldListSubdomain(key)) keys.add(key);
    }
    for (const sub of domainBySub.keys()) {
      if (shouldListSubdomain(sub)) keys.add(sub);
    }

    const items = [...keys].map((sub) => {
      const recs = recordsForSubdomain(aliyun, sub);
      const aliyunEnabled = recs.length === 0 || recs.some((r) => r.status === "ENABLE");
      const row = domainBySub.get(sub) || null;
      const availability = domainAvailability({
        aliyunEnabled: recs.length > 0 ? aliyunEnabled : Boolean(row),
        domainStatus: row?.status || null,
      });
      const listings = row ? (listingByTool.get(row.toolId) || []) : [];
      const published = listings.some((l) => l.status === "approved");
      const project = row ? projectMap.get(row.projectId) : undefined;
      return {
        subdomain: sub,
        hostname: hostnameOf(sub),
        protected: isProtectedSubdomain(sub),
        available: availability === "usable",
        availability,
        availabilityLabel: availability === "usable" ? "可用"
          : availability === "deploying" ? "部署中"
          : availability === "dns_only" ? "仅解析"
          : "不可用",
        projectLabel: projectOnlineLabel(availability, published),
        projectId: row?.projectId ?? null,
        projectName: project?.name ?? null,
        domainStatus: row?.status ?? null,
        published,
        records: recs.filter((r) => !isInfraRecord(r.rr)).map((r) => ({
          type: r.type,
          rr: r.rr,
          value: r.value,
          status: r.status,
        })),
      };
    }).sort((a, b) => {
      if (a.protected !== b.protected) return a.protected ? 1 : -1;
      return a.hostname.localeCompare(b.hostname);
    });

    return c.json({ domains: items, aliyunError: aliyunError || undefined });
  })

  .delete("/api/admin/domains/:subdomain", async (c) => {
    const subdomain = c.req.param("subdomain").trim().toLowerCase();
    if (!subdomain || /[^a-z0-9*-]/.test(subdomain)) {
      return c.json({ error: "Invalid subdomain" }, 400);
    }
    if (isProtectedSubdomain(subdomain)) {
      return c.json({ error: "根域名和通配解析不能删" }, 400);
    }

    try {
      const aliyun = await listAllDnsRecords();
      const recs = recordsForSubdomain(aliyun, subdomain);
      for (const rec of recs) {
        try { await deleteDnsRecord(rec.recordId); } catch { /* 解析可能已删 */ }
      }
    } catch { /* 本地未配阿里云时仍卸库内绑定 */ }

    const fullDomain = toolDomain(subdomain);
    try { await platformRemoveDomain(fullDomain); } catch { /* 本地未配平台凭证 */ }

    const [row] = await db.select().from(domains).where(eq(domains.domain, fullDomain));
    if (row) {
      const listings = await db.select().from(marketListings).where(eq(marketListings.toolId, row.toolId));
      for (const listing of listings) {
        if (listing.status === "approved" || listing.status === "pending_review") {
          await db.update(marketListings).set({ status: "removed" }).where(eq(marketListings.id, listing.id));
        }
      }
      await db.delete(domains).where(eq(domains.id, row.id));
    }

    return c.json({ success: true });
  });
