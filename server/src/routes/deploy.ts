import { Hono } from "hono";
import { ctx, db } from "edgespark";
import { auth } from "edgespark/http";
import { eq, and, or, desc, inArray } from "drizzle-orm";
import { projects, tools, domains } from "@defs";
import { addDnsRecord, assertAliyunConfigured, deleteDnsRecord, listDnsRecords } from "../lib/aliyun-dns";
import { getPlatformAccessToken, keepPlatformAuthWarm } from "../lib/platform-auth";
import {
  platformAddDomain,
  platformRemoveDomain,
  platformVerifyDomain,
} from "../lib/edgespark-domain";
import { IN_FLIGHT_DOMAIN, isStaleDomain, subdomainKey } from "../lib/domain-admin";
import { errorMessage, explainPlatformAuthError } from "../lib/platform-token";
import { publicToolUrl, toAliyunRR, toolDomain } from "../lib/tool-host";

async function applyPlatformDns(records: Array<{ type: string; name: string; value: string }>): Promise<void> {
  for (const rec of records) {
    if (rec.type !== "CNAME" && rec.type !== "TXT") continue;
    const rr = toAliyunRR(rec.name);
    try {
      await addDnsRecord(rec.type, rr, rec.value);
    } catch (err) {
      const msg = errorMessage(err);
      if (!/DomainRecordDuplicate|already exists/i.test(msg)) throw err;
      const existing = await listDnsRecords(rr);
      const same = existing.some((r) =>
        r.type === rec.type
        && subdomainKey(r.rr) === subdomainKey(rr)
        && r.value === rec.value,
      );
      if (!same) throw err;
    }
  }
}

async function deleteSubdomainDns(subdomain: string): Promise<void> {
  if (!subdomain || subdomain === "*") return;
  try {
    const records = await listDnsRecords(subdomain);
    for (const r of records) {
      if (subdomainKey(r.rr) === subdomain) {
        await deleteDnsRecord(r.recordId);
      }
    }
  } catch { /* best-effort */ }
}

async function writePendingDns(hostname: string, rowId: number): Promise<string> {
  const added = await platformAddDomain(hostname);
  if (added.records.length === 0) {
    throw new Error("平台未返回 DNS 记录");
  }
  await applyPlatformDns(added.records);
  await db.update(domains).set({ status: "dns_ready" }).where(eq(domains.id, rowId));
  return "dns_ready";
}

async function tickVerify(hostname: string, rowId: number, current: string): Promise<string> {
  if (current === "active" || current === "failed") return current;
  // 先把状态切到 verifying 再真正校验，前端才能停在「正在验证」
  if (current === "dns_ready") {
    await db.update(domains).set({ status: "verifying" }).where(eq(domains.id, rowId));
    return "verifying";
  }
  const result = await platformVerifyDomain(hostname);
  if (result.status === "active") {
    await db.update(domains).set({
      status: "active",
      verifiedAt: new Date().toISOString(),
    }).where(eq(domains.id, rowId));
    return "active";
  }
  return "verifying";
}

async function advanceDomain(row: { id: number; domain: string; status: string | null }): Promise<string> {
  const status = row.status || "";
  if (status === "pending") return writePendingDns(row.domain, row.id);
  if (status === "dns_ready" || status === "verifying") {
    return tickVerify(row.domain, row.id, status);
  }
  return status;
}

export const deployRoutes = new Hono()
  .post("/:projectId/deploy", async (c) => {
    const userId = auth.user!.id;
    const projectId = parseInt(c.req.param("projectId"), 10);

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
    if (!project) return c.json({ error: "Project not found" }, 404);

    try {
      await getPlatformAccessToken();
      assertAliyunConfigured();
    } catch (err) {
      return c.json({ error: explainPlatformAuthError(err) }, 500);
    }

    const [activeDomain] = await db
      .select()
      .from(domains)
      .where(and(eq(domains.projectId, projectId), eq(domains.status, "active")));
    if (activeDomain) return c.json({ error: "Project already has an active domain", domain: activeDomain.domain }, 409);

    const [existing] = await db
      .select()
      .from(domains)
      .where(and(
        eq(domains.projectId, projectId),
        inArray(domains.status, [...IN_FLIGHT_DOMAIN]),
      ));
    if (existing) {
      if (isStaleDomain(existing.createdAt)) {
        const staleSub = existing.domain.replace(/\.torresx\.cn$/i, "");
        await platformRemoveDomain(existing.domain);
        if (existing.status === "dns_ready" || existing.status === "verifying") {
          await deleteSubdomainDns(staleSub);
        }
        await db.delete(domains).where(eq(domains.id, existing.id));
      } else {
        return c.json({ error: "Deployment already in progress", domain: existing.domain }, 409);
      }
    }

    const body = await c.req.json<{ subdomain: string }>();
    if (!body.subdomain?.trim()) return c.json({ error: "subdomain required" }, 400);

    const subdomain = body.subdomain.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!subdomain || subdomain.length < 2) return c.json({ error: "Invalid subdomain (min 2 chars, a-z0-9-)" }, 400);

    const fullDomain = toolDomain(subdomain);

    try {
      const existingDns = await listDnsRecords(subdomain);
      if (existingDns.some((r) => subdomainKey(r.rr) === subdomain)) {
        return c.json({ error: "这个域名的解析记录已经存在，请换一个前缀。" }, 409);
      }
    } catch (err) {
      return c.json({ error: explainPlatformAuthError(err) }, 500);
    }

    await db
      .delete(domains)
      .where(and(
        eq(domains.domain, fullDomain),
        or(eq(domains.status, "failed"), eq(domains.status, "removing")),
      ));

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

    const [row] = await db.insert(domains).values({
      projectId,
      toolId: tool.id,
      domain: fullDomain,
      status: "pending",
    }).returning();

    try {
      const added = await platformAddDomain(fullDomain);
      if (added.records.length === 0) {
        throw new Error("平台未返回 DNS 记录");
      }
    } catch (err) {
      await db.update(domains).set({ status: "failed" }).where(eq(domains.id, row.id));
      return c.json({ error: explainPlatformAuthError(err) }, 500);
    }

    // DNS 写入和验证交给轮询推进，弹窗才能走过四个步骤
    return c.json({
      success: true,
      domain: fullDomain,
      url: publicToolUrl(subdomain),
      status: "pending",
    });
  })

  .get("/:projectId/check-domain", async (c) => {
    const domain = c.req.query("domain");
    if (!domain) return c.json({ error: "domain query required" }, 400);
    const fullDomain = toolDomain(domain.toLowerCase().replace(/[^a-z0-9-]/g, ""));
    const [existing] = await db.select().from(domains).where(eq(domains.domain, fullDomain));
    if (!existing) return c.json({ available: true, status: null });

    let status = existing.status || "";
    try {
      status = await advanceDomain(existing);
    } catch (err) {
      if (existing.status === "pending") {
        await db.update(domains).set({ status: "failed" }).where(eq(domains.id, existing.id));
        return c.json({
          available: false,
          status: "failed",
          error: explainPlatformAuthError(err),
        });
      }
      status = existing.status || status;
    }
    return c.json({ available: false, status });
  })

  .get("/:projectId/deploy-status", async (c) => {
    const userId = auth.user!.id;
    const projectId = parseInt(c.req.param("projectId"), 10);
    ctx.runInBackground(keepPlatformAuthWarm());

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

    const sub = domainRow.domain.replace(/\.torresx\.cn$/i, "");
    return c.json({
      deployed: domainRow.status === "active",
      domain: domainRow.domain,
      url: publicToolUrl(sub),
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
      .where(eq(domains.projectId, projectId))
      .orderBy(desc(domains.createdAt))
      .limit(1);

    if (!domainRow || domainRow.status === "active") {
      return c.json({ error: "No active deployment to cancel" }, 404);
    }

    const subdomain = domainRow.domain.replace(/\.torresx\.cn$/i, "");
    await platformRemoveDomain(domainRow.domain);
    // 还没写成功 DNS 时不要清阿里云，避免把别人的残留解析一并删掉
    if (domainRow.status === "dns_ready" || domainRow.status === "verifying") {
      await deleteSubdomainDns(subdomain);
    }
    await db.delete(domains).where(eq(domains.id, domainRow.id));
    return c.json({ success: true, status: "removed" });
  });
