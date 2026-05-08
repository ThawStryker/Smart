import { Hono } from "hono";
import { db } from "edgespark";
import { auth } from "edgespark/http";
import { eq, and, asc } from "drizzle-orm";
import { projects, tools, executionSteps } from "@defs";

export const stepsRoutes = new Hono()
  // List steps for all tools in a project
  .get("/:projectId/steps", async (c) => {
    const userId = auth.user!.id;
    const projectId = parseInt(c.req.param("projectId"), 10);

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
    if (!project) return c.json({ error: "Project not found" }, 404);

    const projectTools = await db
      .select({ id: tools.id })
      .from(tools)
      .where(eq(tools.projectId, projectId));

    if (projectTools.length === 0) return c.json([]);

    const toolIds = projectTools.map((t) => t.id);
    const steps: typeof executionSteps.$inferSelect[] = [];
    for (const toolId of toolIds) {
      const toolSteps = await db
        .select()
        .from(executionSteps)
        .where(eq(executionSteps.toolId, toolId))
        .orderBy(asc(executionSteps.stepOrder));
      steps.push(...toolSteps);
    }
    return c.json(steps);
  })

  // List steps for a specific tool
  .get("/:projectId/tools/:toolId/steps", async (c) => {
    const userId = auth.user!.id;
    const projectId = parseInt(c.req.param("projectId"), 10);
    const tId = parseInt(c.req.param("toolId"), 10);

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

    const steps = await db
      .select()
      .from(executionSteps)
      .where(eq(executionSteps.toolId, tId))
      .orderBy(asc(executionSteps.stepOrder));

    return c.json(steps);
  });
