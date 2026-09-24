import { Hono } from "hono";
import { serveDeployedTool } from "../lib/serve-tool";

export const serveRoutes = new Hono()
  .get("/api/public/smart/serve/:subdomain/*", async (c) => {
    const subdomain = c.req.param("subdomain");
    const urlPath = c.req.path;
    const routePrefix = `/api/public/smart/serve/${subdomain}/`;
    let filePath = urlPath.startsWith(routePrefix) ? urlPath.slice(routePrefix.length) : "";
    if (!filePath) filePath = "index.html";

    const res = await serveDeployedTool(subdomain, `/${filePath}`);
    if (!res) return c.json({ error: "Domain not found" }, 404);
    return res;
  });
