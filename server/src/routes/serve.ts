import { Hono } from "hono";
import { db, storage } from "edgespark";
import { eq } from "drizzle-orm";
import { tools, domains, buckets } from "@defs";
import { getContentType } from "../lib/mime";
import { injectSmartIds } from "../lib/html-inject";

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

    const urlPath = c.req.path;
    const routePrefix = `/api/public/smart/serve/${subdomain}/`;
    let filePath = urlPath.startsWith(routePrefix) ? urlPath.slice(routePrefix.length) : "";
    if (!filePath) filePath = "index.html";

    const prefix = `${tool.projectId}/${tool.id}/`;
    const obj = await storage.from(buckets.sourceBuckets).get(prefix + filePath);
    if (!obj) return c.json({ error: "File not found" }, 404);

    const ext = filePath.split(".").pop()?.toLowerCase() || "txt";
    const body = ext === "html"
      ? injectSmartIds(obj.body, tool.projectId, tool.id)
      : obj.body;

    return new Response(body, {
      headers: { "Content-Type": getContentType(filePath) },
    });
  });
