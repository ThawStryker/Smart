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
import { chatRoutes } from "./routes/chat";
import { agentRoutes } from "./routes/agent";
import { stepsRoutes } from "./routes/steps";

const app = new Hono()
  .get("/api/public/hello", (c) =>
    c.json({ message: "Hello from EdgeSpark! Spark your idea to the Edge." })
  )
  .route("/api/projects", projectsRoutes)
  .route("/api/projects", chatRoutes)
  .route("/api/projects", agentRoutes)
  .route("/api/projects", stepsRoutes);

export default app;
