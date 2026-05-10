import { Hono } from "hono";
import { db, storage } from "edgespark";
import { eq } from "drizzle-orm";
import { tools, domains, buckets } from "@defs";

const MIME: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  json: "application/json",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
  woff: "font/woff", woff2: "font/woff2",
  txt: "text/plain; charset=utf-8",
};

export const serveRoutes = new Hono()
  .get("/api/public/smart/serve/:subdomain/*", async (c) => {
    const subdomain = c.req.param("subdomain");
    const domain = `${subdomain}.torresx.cn`;

    const [domainRow] = await db
      .select()
      .from(domains)
      .where(eq(domains.domain, domain));

    if (!domainRow || domainRow.status !== "active") {
      return c.json({ error: "Domain not found" }, 404);
    }

    const [tool] = await db
      .select()
      .from(tools)
      .where(eq(tools.id, domainRow.toolId));
    if (!tool) return c.json({ error: "Tool not found" }, 404);

    const filePath = c.req.param("*") || "index.html";
    const prefix = `${tool.projectId}/${tool.id}/`;
    const obj = await storage.from(buckets.sourceBuckets).get(prefix + filePath);

    if (!obj) return c.json({ error: "File not found" }, 404);

    const ext = filePath.split(".").pop()?.toLowerCase() || "txt";
    return new Response(obj.body, {
      headers: { "Content-Type": MIME[ext] || "application/octet-stream" },
    });
  });
