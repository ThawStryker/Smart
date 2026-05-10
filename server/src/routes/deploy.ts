import { Hono } from "hono";
import { db, secret } from "edgespark";
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

    const body = await c.req.json<{ subdomain: string }>();
    if (!body.subdomain?.trim()) return c.json({ error: "subdomain required" }, 400);

    const subdomain = body.subdomain.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!subdomain || subdomain.length < 2) return c.json({ error: "Invalid subdomain (min 2 chars, a-z0-9-)" }, 400);

    const fullDomain = `${subdomain}.torresx.cn`;

    // Check domain not already taken
    const [existing] = await db
      .select()
      .from(domains)
      .where(eq(domains.domain, fullDomain));
    if (existing) return c.json({ error: "Domain already in use" }, 409);

    // Find the latest tool for this project
    const [tool] = await db
      .select()
      .from(tools)
      .where(eq(tools.projectId, projectId))
      .orderBy(desc(tools.createdAt))
      .limit(1);
    if (!tool) return c.json({ error: "No tool found for this project" }, 404);

    const accessKeyId = secret.get("ALIYUN_ACCESS_KEY_ID");
    const accessKeySecret = secret.get("ALIYUN_ACCESS_KEY_SECRET");

    if (!accessKeyId || !accessKeySecret) {
      return c.json({ error: "Aliyun credentials not configured" }, 500);
    }

    try {
      // 1. Add CNAME DNS record via Alibaba Cloud
      await addCnameRecord("torresx.cn", subdomain, "custom.edgespark.app", accessKeyId, accessKeySecret);

      // 2. Save domain record (pending until edgespark domain verify completes)
      await db.insert(domains).values({
        projectId,
        toolId: tool.id,
        domain: fullDomain,
        status: "active",
      });

      return c.json({
        success: true,
        url: `https://${fullDomain}`,
        domain: fullDomain,
        nextSteps: [
          `edgespark domain add ${fullDomain}`,
          `edgespark domain verify ${fullDomain} --timeout 15m`,
        ],
      });
    } catch (err) {
      return c.json({
        error: `Deploy failed: ${err instanceof Error ? err.message : String(err)}`,
      }, 500);
    }
  })

  // Check domain availability
  .get("/:projectId/check-domain", async (c) => {
    const domain = c.req.query("domain");
    if (!domain) return c.json({ error: "domain query required" }, 400);
    const fullDomain = `${domain.toLowerCase().replace(/[^a-z0-9-]/g, "")}.torresx.cn`;
    const [existing] = await db.select().from(domains).where(eq(domains.domain, fullDomain));
    return c.json({ available: !existing });
  });

// Alibaba Cloud DNS — AddDomainRecord using Web Crypto HMAC-SHA1
async function addCnameRecord(
  domain: string,
  rr: string,
  value: string,
  accessKeyId: string,
  accessKeySecret: string
): Promise<void> {
  const params: Record<string, string> = {
    Action: "AddDomainRecord",
    DomainName: domain,
    RR: rr,
    Type: "CNAME",
    Value: value,
    Format: "JSON",
    Version: "2015-01-09",
    AccessKeyId: accessKeyId,
    SignatureMethod: "HMAC-SHA1",
    SignatureVersion: "1.0",
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    SignatureNonce: Math.random().toString(36).slice(2) + Date.now().toString(36),
  };

  const sortedKeys = Object.keys(params).sort();
  const queryString = sortedKeys.map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join("&");
  const stringToSign = `POST&${encodeURIComponent("/")}&${encodeURIComponent(queryString)}`;
  const key = accessKeySecret + "&";

  const encoder = new TextEncoder();
  const keyData = await crypto.subtle.importKey("raw", encoder.encode(key), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", keyData, encoder.encode(stringToSign));
  const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));

  const signedQS = `${queryString}&Signature=${encodeURIComponent(signatureBase64)}`;
  const res = await fetch(`https://alidns.aliyuncs.com/?${signedQS}`, { method: "POST" });
  const result = await res.json() as Record<string, unknown>;

  if (result.Code) {
    throw new Error(`Aliyun DNS error: ${result.Code} - ${result.Message || "Unknown"}`);
  }
}
