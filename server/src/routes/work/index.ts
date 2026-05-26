import { Hono } from "hono";
import { sessionsRoutes } from "./sessions";
import { filesRoutes } from "./files";
import { messagesRoutes } from "./messages";
import { chatRoutes } from "./chat";

export const workRoutes = new Hono()
  .route("/sessions", sessionsRoutes)
  .route("/sessions/:id/files", filesRoutes)
  .route("/sessions/:id/messages", messagesRoutes)
  .route("/chat", chatRoutes);
