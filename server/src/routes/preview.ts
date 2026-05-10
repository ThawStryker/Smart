import { Hono } from "hono";
import { db, storage } from "edgespark";
import { eq, and } from "drizzle-orm";
import { tools, buckets } from "@defs";

const MIME_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  txt: "text/plain; charset=utf-8",
};

function getContentType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "txt";
  return MIME_TYPES[ext] || "application/octet-stream";
}

export const previewRoutes = new Hono()
  .get("/api/public/smart/preview/:projectId/:toolId/*", async (c) => {
    const projectId = parseInt(c.req.param("projectId"), 10);
    const toolId = parseInt(c.req.param("toolId"), 10);

    // Extract file path from the full URL path (wildcard may not capture in sub-app routing)
    const fullPath = c.req.path;
    const prefix = `/api/public/smart/preview/${projectId}/${toolId}/`;
    const filePath = fullPath.startsWith(prefix)
      ? fullPath.slice(prefix.length)
      : "index.html";
    if (!filePath) return c.json({ error: "File path required" }, 400);

    // Verify tool belongs to project
    const [tool] = await db
      .select()
      .from(tools)
      .where(and(eq(tools.id, toolId), eq(tools.projectId, projectId)));
    if (!tool) return c.json({ error: "Tool not found" }, 404);

    const r2Prefix = `${projectId}/${toolId}/`;
    const obj = await storage.from(buckets.sourceBuckets).get(r2Prefix + filePath);

    if (!obj) return c.json({ error: "File not found" }, 404);

    return new Response(obj.body, {
      headers: {
        "Content-Type": getContentType(filePath),
        "Cache-Control": "no-cache",
      },
    });
  });
