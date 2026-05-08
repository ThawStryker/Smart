import { Hono } from "hono";
import { db, storage } from "edgespark";
import { auth } from "edgespark/http";
import { eq, and, asc } from "drizzle-orm";
import { projects, tools, conversations, executionSteps, buckets } from "@defs";

export const dataRoutes = new Hono()
  // Get chat history for a project
  .get("/:projectId/conversations", async (c) => {
    const userId = auth.user!.id;
    const projectId = parseInt(c.req.param("projectId"), 10);

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
    if (!project) return c.json({ error: "Project not found" }, 404);

    const history = await db
      .select()
      .from(conversations)
      .where(eq(conversations.projectId, projectId))
      .orderBy(asc(conversations.createdAt))
      .limit(200);

    return c.json(history);
  })

  // Get project overview (files + steps)
  .get("/:projectId/overview", async (c) => {
    const userId = auth.user!.id;
    const projectId = parseInt(c.req.param("projectId"), 10);

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
    if (!project) return c.json({ error: "Project not found" }, 404);

    // Get tools and their steps
    const projectTools = await db
      .select()
      .from(tools)
      .where(eq(tools.projectId, projectId));

    const result: Array<{
      toolId: number;
      toolName: string;
      files: Array<{ path: string; size: number }>;
      steps: typeof executionSteps.$inferSelect[];
    }> = [];

    for (const tool of projectTools) {
      const prefix = `${projectId}/${tool.id}/`;
      const fileList = await storage.from(buckets.sourceBuckets).list({ prefix, limit: 100 });

      const files = fileList.files.map((f) => ({
        path: f.path.replace(prefix, ""),
        size: f.size,
      }));

      const stepList = await db
        .select()
        .from(executionSteps)
        .where(eq(executionSteps.toolId, tool.id))
        .orderBy(asc(executionSteps.stepOrder));

      result.push({
        toolId: tool.id,
        toolName: tool.name,
        files,
        steps: stepList,
      });
    }

    return c.json(result);
  })

  // Get file content
  .get("/:projectId/tools/:toolId/files/*", async (c) => {
    const userId = auth.user!.id;
    const projectId = parseInt(c.req.param("projectId"), 10);
    const tId = parseInt(c.req.param("toolId"), 10);
    const filePath = c.req.param("*");
    if (!filePath) return c.json({ error: "File path required" }, 400);

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
    if (!project) return c.json({ error: "Project not found" }, 404);

    const [tool] = await db
      .select()
      .from(tools)
      .where(and(eq(tools.id, tId), eq(tools.projectId, projectId)));
    if (!tool) return c.json({ error: "Tool not found" }, 404);

    const prefix = `${projectId}/${tId}/`;
    const obj = await storage.from(buckets.sourceBuckets).get(prefix + filePath);
    if (!obj) return c.json({ error: "File not found" }, 404);

    const content = new TextDecoder().decode(obj.body);
    const ext = filePath.split(".").pop() || "text";
    const langMap: Record<string, string> = { html: "html", css: "css", js: "javascript", ts: "typescript", tsx: "typescript", jsx: "javascript", json: "json", py: "python" };
    return c.json({ path: filePath, language: langMap[ext] || "text", content });
  });
