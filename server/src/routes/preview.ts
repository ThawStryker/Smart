import { Hono } from "hono";
import { db, storage } from "edgespark";
import { eq, and } from "drizzle-orm";
import { tools, buckets } from "@defs";
import { getContentType } from "../lib/mime";
import { injectSmartIds } from "../lib/html-inject";

export const previewRoutes = new Hono()
  .get("/api/public/smart/preview/:projectId/:toolId/*", async (c) => {
    const rawProjectId = c.req.param("projectId");
    const rawToolId = c.req.param("toolId");
    if (!/^\d+$/.test(rawProjectId) || !/^\d+$/.test(rawToolId)) {
      return c.json({ error: "Invalid project or tool ID" }, 400);
    }
    const projectId = parseInt(rawProjectId, 10);
    const toolId = parseInt(rawToolId, 10);

    const urlPath = c.req.path;
    const routePrefix = `/api/public/smart/preview/${rawProjectId}/${rawToolId}/`;
    let filePath = urlPath.startsWith(routePrefix) ? urlPath.slice(routePrefix.length) : "";
    if (!filePath) filePath = "index.html";

    const [tool] = await db
      .select()
      .from(tools)
      .where(and(eq(tools.id, toolId), eq(tools.projectId, projectId)));
    if (!tool) return c.json({ error: "Tool not found" }, 404);

    const r2Prefix = `${projectId}/${toolId}/`;
    const obj = await storage.from(buckets.sourceBuckets).get(r2Prefix + filePath);
    if (!obj) return c.json({ error: "File not found" }, 404);

    const ext = filePath.split(".").pop()?.toLowerCase() || "txt";
    const body = ext === "html"
      ? injectSmartIds(obj.body, projectId, toolId)
      : obj.body;

    return new Response(body, {
      headers: {
        "Content-Type": getContentType(filePath),
        "Cache-Control": "public, max-age=300",
      },
    });
  });
