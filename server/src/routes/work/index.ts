import { Hono } from "hono";
import { sessionsRoutes } from "./sessions";
import { messagesRoutes } from "./messages";
import { chatRoutes } from "./chat";
import { workspaceRoutes } from "./workspace";

export const workRoutes = new Hono()
  .route("/sessions", sessionsRoutes)
  .route("/sessions/:id/messages", messagesRoutes)
  .route("/chat", chatRoutes)
  .route("/workspace", workspaceRoutes);
