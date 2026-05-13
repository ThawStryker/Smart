import { Hono } from "hono";
import { db, secret } from "edgespark";
import { eq } from "drizzle-orm";
import { domains } from "@defs";
import { addDnsRecord } from "../lib/aliyun-dns";

function checkAuth(c: any): boolean {
  const key = secret.get("DOMAIN_SYNC_API_KEY");
  if (!key) return false;
  const auth = c.req.header("Authorization") || "";
  return auth === `Bearer ${key}`;
}

export const domainSyncRoutes = new Hono()
  .get("/api/public/smart/domains", async (c) => {
    if (!checkAuth(c)) return c.json({ error: "Unauthorized" }, 401);

    const rows = await db.select().from(domains).orderBy(domains.createdAt);
    return c.json({
      domains: rows.map(r => ({
        id: r.id,
        domain: r.domain,
        status: r.status,
        createdAt: r.createdAt,
      })),
    });
  })

  .post("/api/public/smart/domains/:id/dns-records", async (c) => {
    if (!checkAuth(c)) return c.json({ error: "Unauthorized" }, 401);

    const id = parseInt(c.req.param("id"), 10);
    const [domainRow] = await db.select().from(domains).where(eq(domains.id, id));
    if (!domainRow) return c.json({ error: "Domain not found" }, 404);

    if (domainRow.status !== "pending") {
      return c.json({ error: `Domain status is '${domainRow.status}', expected 'pending'` }, 409);
    }

    const body = await c.req.json<{ cnameValue: string; txtHost: string; txtValue: string }>();
    if (!body.cnameValue || !body.txtHost || !body.txtValue) {
      return c.json({ error: "cnameValue, txtHost, txtValue required" }, 400);
    }

    const subdomain = domainRow.domain.replace(".torresx.cn", "");
    const txtRR = body.txtHost.replace(".torresx.cn", "");

    try {
      await addDnsRecord("CNAME", subdomain, body.cnameValue);
      await addDnsRecord("TXT", txtRR, body.txtValue);

      await db.update(domains)
        .set({ status: "dns_ready" })
        .where(eq(domains.id, id));

      return c.json({ success: true, status: "dns_ready" });
    } catch (err) {
      return c.json({
        error: `DNS add failed: ${err instanceof Error ? err.message : String(err)}`,
      }, 500);
    }
  })

  .post("/api/public/smart/domains/:id/start-verify", async (c) => {
    if (!checkAuth(c)) return c.json({ error: "Unauthorized" }, 401);

    const id = parseInt(c.req.param("id"), 10);
    const [domainRow] = await db.select().from(domains).where(eq(domains.id, id));
    if (!domainRow) return c.json({ error: "Domain not found" }, 404);

    if (domainRow.status !== "dns_ready") {
      return c.json({ error: `Domain status is '${domainRow.status}', expected 'dns_ready'` }, 409);
    }

    await db.update(domains).set({ status: "verifying" }).where(eq(domains.id, id));
    return c.json({ success: true, status: "verifying" });
  })

  .post("/api/public/smart/domains/:id/verify-result", async (c) => {
    if (!checkAuth(c)) return c.json({ error: "Unauthorized" }, 401);

    const id = parseInt(c.req.param("id"), 10);
    const [domainRow] = await db.select().from(domains).where(eq(domains.id, id));
    if (!domainRow) return c.json({ error: "Domain not found" }, 404);

    if (domainRow.status !== "dns_ready" && domainRow.status !== "verifying") {
      return c.json({ error: `Domain status is '${domainRow.status}', expected 'dns_ready' or 'verifying'` }, 409);
    }

    const body = await c.req.json<{ success: boolean; message?: string }>();

    const newStatus = body.success ? "active" : "failed";
    await db.update(domains)
      .set({
        status: newStatus,
        ...(body.success ? { verifiedAt: new Date().toISOString() } : {}),
      })
      .where(eq(domains.id, id));

    if (body.success) {
      return c.json({ success: true, status: "active" });
    } else {
      return c.json({ success: false, status: "failed", message: body.message || "Verification failed" });
    }
  })

  .delete("/api/public/smart/domains/:id", async (c) => {
    if (!checkAuth(c)) return c.json({ error: "Unauthorized" }, 401);

    const id = parseInt(c.req.param("id"), 10);
    const [domainRow] = await db.select().from(domains).where(eq(domains.id, id));
    if (!domainRow) return c.json({ error: "Domain not found" }, 404);

    if (domainRow.status !== "removing") {
      return c.json({ error: `Domain status is '${domainRow.status}', expected 'removing'` }, 409);
    }

    await db.delete(domains).where(eq(domains.id, id));
    return c.json({ success: true, deleted: true });
  });
