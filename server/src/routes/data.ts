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

  // Get project overview (tools + files from step metadata)
  .get("/:projectId/overview", async (c) => {
    const userId = auth.user!.id;
    const projectId = parseInt(c.req.param("projectId"), 10);

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
    if (!project) return c.json({ error: "Project not found" }, 404);

    const projectTools = await db
      .select()
      .from(tools)
      .where(eq(tools.projectId, projectId));

    const result: Array<{
      toolId: number;
      toolName: string;
      files: Array<{ path: string; language: string }>;
    }> = [];

    for (const tool of projectTools) {
      // Collect files from all sources
      const files: Array<{ path: string; language: string }> = [];
      const addFile = (f: { path: string; language: string }) => {
        if (!files.some((existing) => existing.path === f.path)) {
          files.push(f);
        }
      };

      // Primary: tool.metadata (set by vibe.ts at session end)
      if (tool.metadata) {
        try {
          const metaFiles = JSON.parse(tool.metadata) as Array<{ path: string; language: string }>;
          for (const f of metaFiles) addFile(f);
        } catch { /* skip invalid JSON */ }
      }

      // Secondary: execution steps metadata (per-step file info)
      if (files.length === 0) {
        const stepList = await db
          .select()
          .from(executionSteps)
          .where(eq(executionSteps.toolId, tool.id))
          .orderBy(asc(executionSteps.stepOrder));

        for (const step of stepList) {
          if (step.status === "completed" && step.metadata) {
            try {
              const metaFiles = JSON.parse(step.metadata) as Array<{ path: string; language: string }>;
              for (const f of metaFiles) addFile(f);
            } catch { /* skip invalid JSON */ }
          }
        }
      }

      // Fallback: if no metadata, try listing from R2
      if (files.length === 0) {
        console.log(`[overview] tool ${tool.id} has no metadata, trying R2 list`);
        try {
          const prefix = `${projectId}/${tool.id}/`;
          const fileList = await storage.from(buckets.sourceBuckets).list({ prefix, limit: 100 });
          console.log(`[overview] R2 list for ${prefix}: ${fileList.files?.length || 0} files, objects:`, JSON.stringify(fileList.files?.slice(0, 3) || []));
          if (fileList.files) {
            for (const f of fileList.files) {
              const path = f.path.replace(prefix, "");
              const ext = path.split(".").pop() || "text";
              files.push({ path, language: ext });
            }
          }
        } catch (e) { console.error("[overview] R2 list error:", e); /* R2 list may fail */ }
      }

      console.log(`[overview] tool ${tool.id}: ${files.length} files:`, files.map(f => f.path));
      result.push({
        toolId: tool.id,
        toolName: tool.name,
        files,
      });
    }

    console.log(`[overview] returning ${result.length} tools, total files:`, result.flatMap(t => t.files).map(f => f.path));
    return c.json(result);
  })

  // Get file content from R2
  .get("/:projectId/tools/:toolId/files", async (c) => {
    const userId = auth.user!.id;
    const projectId = parseInt(c.req.param("projectId"), 10);
    const tId = parseInt(c.req.param("toolId"), 10);
    const filePath = c.req.query("path");
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
