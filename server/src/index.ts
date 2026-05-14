/**
 * EDGESPARK SERVER
 *
 * Define your Hono routes. The app is static — created once, reused across requests.
 *
 * SDK imports from 'edgespark' are per-request (backed by AsyncLocalStorage).
 * They can ONLY be used inside route handlers, not at the top level.
 *
 * ═══════════════════════════════════════════════════════════════════
 * PATH CONVENTIONS (Authentication)
 *
 * /api/*          → Login required (auth.user guaranteed)
 * /api/public/*   → Login optional (auth.user if logged in)
 * /api/webhooks/* → No auth check (handle verification yourself)
 * ═══════════════════════════════════════════════════════════════════
 */

import { Hono } from "hono";
import { projectsRoutes } from "./routes/projects";
import { agentRoutes } from "./agent";
import { stepsRoutes } from "./routes/steps";
import { dataRoutes } from "./routes/data";
import { toolDataRoutes } from "./routes/toolData";
import { toolAuthRoutes } from "./routes/toolAuth";
import { sdkRoutes } from "./routes/sdk";
import { deployRoutes } from "./routes/deploy";
import { previewRoutes } from "./routes/preview";
import { serveRoutes } from "./routes/serve";
import { domainSyncRoutes } from "./routes/domainSync";
import { profileRoutes } from "./routes/profile";
import { skillsRoutes } from "./routes/skills";
import { mcpsRoutes } from "./routes/mcps";
import { marketRoutes } from "./routes/market";
import { adminRoutes } from "./routes/admin";

const app = new Hono()
  .get("/api/public/hello", (c) =>
    c.json({ message: "Hello from EdgeSpark! Spark your idea to the Edge." })
  )
  .route("/api/projects", projectsRoutes)
  .route("/api/projects", agentRoutes)
  .route("/api/projects", stepsRoutes)
  .route("/api/projects", dataRoutes)
  .route("/api/projects", deployRoutes)
  .route("/", toolDataRoutes)
  .route("/", toolAuthRoutes)
  .route("/", sdkRoutes)
  .route("/", previewRoutes)
  .route("/", serveRoutes)
  .route("/", domainSyncRoutes)
  .route("/", profileRoutes)
  .route("/", skillsRoutes)
  .route("/", mcpsRoutes)
  .route("/", marketRoutes)
  .route("/", adminRoutes);

export default app;
