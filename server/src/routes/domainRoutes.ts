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

function getMime(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "txt";
  return MIME[ext] || "application/octet-stream";
}

export const domainRoutes = new Hono()
  // Catch-all: handle all paths for custom domain requests
  .all("*", async (c) => {
    const hostname = c.req.header("Host") || "";

    // Only handle custom domains, skip the main app domain
    if (!hostname.endsWith(".torresx.cn")) return c.notFound();

    // Look up domain in DB
    const [domainRow] = await db
      .select()
      .from(domains)
      .where(eq(domains.domain, hostname));

    if (!domainRow || domainRow.status !== "active") {
      return c.json({ error: "Domain not found" }, 404);
    }

    const [tool] = await db
      .select()
      .from(tools)
      .where(eq(tools.id, domainRow.toolId));
    if (!tool) return c.json({ error: "Tool not found" }, 404);

    // Serve requested file, default to index.html
    let filePath = c.req.path.replace(/^\//, "") || "index.html";
    if (filePath === "" || filePath.endsWith("/")) filePath += "index.html";

    const prefix = `${tool.projectId}/${tool.id}/`;
    const obj = await storage.from(buckets.sourceBuckets).get(prefix + filePath);

    if (!obj) return c.json({ error: "File not found" }, 404);

    return new Response(obj.body, {
      headers: { "Content-Type": getMime(filePath) },
    });
  });
