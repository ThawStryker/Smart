import { Hono } from "hono";
import { db, secret } from "edgespark";
import { auth } from "edgespark/http";
import { eq, and } from "drizzle-orm";
import { projects } from "@defs";

export const deployRoutes = new Hono()
  .post("/:projectId/deploy", async (c) => {
    const userId = auth.user!.id;
    const projectId = parseInt(c.req.param("projectId"), 10);

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
    if (!project) return c.json({ error: "Project not found" }, 404);

    const body = await c.req.json<{ subdomain: string; html: string }>();
    if (!body.subdomain?.trim()) return c.json({ error: "subdomain required" }, 400);

    const fullDomain = `${body.subdomain.trim()}.torresx.cn`;
    const accessKeyId = secret.get("ALIYUN_ACCESS_KEY_ID");
    const accessKeySecret = secret.get("ALIYUN_ACCESS_KEY_SECRET");

    if (!accessKeyId || !accessKeySecret) {
      return c.json({ error: "Aliyun credentials not configured" }, 500);
    }

    try {
      // Add CNAME record via Alibaba Cloud DNS API
      const baseDomain = "torresx.cn";
      const dnsResult = await addDnsRecord(
        baseDomain,
        body.subdomain.trim(),
        "CNAME",
        "custom.edgespark.app",
        accessKeyId,
        accessKeySecret
      );

      return c.json({
        success: true,
        url: `https://${fullDomain}`,
        domain: fullDomain,
        dnsResult,
        nextSteps: [
          `在项目目录运行: edgespark domain add ${fullDomain}`,
          `运行: edgespark domain verify ${fullDomain} --timeout 15m`,
          `运行: edgespark deploy`,
        ],
      });
    } catch (err) {
      return c.json({ error: `DNS setup failed: ${err instanceof Error ? err.message : String(err)}` }, 500);
    }
  });

// Alibaba Cloud DNS API — AddDomainRecord
async function addDnsRecord(
  domain: string,
  rr: string,
  type: string,
  value: string,
  accessKeyId: string,
  accessKeySecret: string
): Promise<{ recordId?: string; message: string }> {
  const params: Record<string, string> = {
    Action: "AddDomainRecord",
    DomainName: domain,
    RR: rr,
    Type: type,
    Value: value,
    Format: "JSON",
    Version: "2015-01-09",
    AccessKeyId: accessKeyId,
    SignatureMethod: "HMAC-SHA1",
    SignatureVersion: "1.0",
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    SignatureNonce: Math.random().toString(36).slice(2) + Date.now().toString(36),
  };

  // Sort and build canonical query string
  const sortedKeys = Object.keys(params).sort();
  const queryString = sortedKeys.map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join("&");

  // HMAC-SHA1 signature
  const stringToSign = `POST&${encodeURIComponent("/")}&${encodeURIComponent(queryString)}`;
  const key = accessKeySecret + "&";

  // Use Web Crypto API for HMAC-SHA1
  const encoder = new TextEncoder();
  const keyData = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", keyData, encoder.encode(stringToSign));
  const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));

  const signedQueryString = `${queryString}&Signature=${encodeURIComponent(signatureBase64)}`;

  const res = await fetch(`https://alidns.aliyuncs.com/?${signedQueryString}`, { method: "POST" });
  const result = await res.json() as Record<string, unknown>;

  if (result.Code) {
    throw new Error(`Aliyun DNS error: ${result.Code} - ${result.Message || "Unknown"}`);
  }

  return { recordId: result.RecordId as string, message: `DNS record ${rr}.${domain} → ${value} (${type}) created` };
}
