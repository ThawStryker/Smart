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
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  txt: "text/plain; charset=utf-8",
  xml: "application/xml",
  pdf: "application/pdf",
  wasm: "application/wasm",
};

function getContentType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "txt";
  return MIME_TYPES[ext] || "application/octet-stream";
}

export const previewRoutes = new Hono()
  .get("/api/public/smart/preview/:projectId/:toolId/*", async (c) => {
    const rawProjectId = c.req.param("projectId");
    const rawToolId = c.req.param("toolId");
    if (!/^\d+$/.test(rawProjectId) || !/^\d+$/.test(rawToolId)) {
      return c.json({ error: "Invalid project or tool ID" }, 400);
    }
    const projectId = parseInt(rawProjectId, 10);
    const toolId = parseInt(rawToolId, 10);

    const filePath = c.req.param("*") || "index.html";
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

    const ext = filePath.split(".").pop()?.toLowerCase() || "txt";
    let body: Uint8Array | ArrayBuffer = obj.body;

    // Inject project ID into HTML so SDK can find it
    if (ext === "html") {
      const text = new TextDecoder().decode(obj.body);
      const injectScript = `<script>window.SMART_PROJECT_ID=${projectId};window.SMART_TOOL_ID=${toolId};</script>`;
      const injected = text.replace("</head>", `${injectScript}</head>`);
      body = new TextEncoder().encode(injected);
    }

    return new Response(body, {
      headers: {
        "Content-Type": getContentType(filePath),
        "Cache-Control": "public, max-age=300",
      },
    });
  });
