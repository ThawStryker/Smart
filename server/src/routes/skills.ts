import { Hono } from "hono";
import { db, storage } from "edgespark";
import { auth } from "edgespark/http";
import { eq, and, or } from "drizzle-orm";
import { skills, buckets } from "@defs";

export const skillsRoutes = new Hono()
  .get("/api/skills", async (c) => {
    const userId = auth.user!.id;
    const rows = await db
      .select()
      .from(skills)
      .where(
        or(
          eq(skills.visibility, "global"),
          and(eq(skills.visibility, "private"), eq(skills.ownerId, userId))
        )
      )
      .orderBy(skills.createdAt);
    return c.json(rows);
  })

  .post("/api/skills", async (c) => {
    const userId = auth.user!.id;
    const contentType = c.req.header("Content-Type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await c.req.formData();
      const name = formData.get("name") as string;
      const description = formData.get("description") as string || "";
      const file = formData.get("file") as File;

      if (!name || !file) return c.json({ error: "name and file required" }, 400);

      const storagePath = `skills/${userId}/${Date.now()}/`;
      await storage.from(buckets.sourceBuckets).put(storagePath + file.name, await file.arrayBuffer());

      const [row] = await db.insert(skills).values({
        name, description,
        visibility: "private",
        ownerId: userId,
        sourceType: "zip",
        storagePath,
      }).returning();
      return c.json(row, 201);
    }

    // JSON body for git URL
    const body = await c.req.json<{ gitUrl: string; name: string; description?: string }>();
    if (!body.name || !body.gitUrl) return c.json({ error: "name and gitUrl required" }, 400);

    const storagePath = `skills/${userId}/${Date.now()}/`;
    const [row] = await db.insert(skills).values({
      name: body.name,
      description: body.description || "",
      visibility: "private",
      ownerId: userId,
      sourceType: "git",
      sourceUrl: body.gitUrl,
      storagePath,
    }).returning();
    return c.json(row, 201);
  })

  .patch("/api/skills/:id", async (c) => {
    const userId = auth.user!.id;
    const id = parseInt(c.req.param("id"), 10);
    const [existing] = await db.select().from(skills).where(eq(skills.id, id));
    if (!existing) return c.json({ error: "Skill not found" }, 404);
    if (existing.visibility === "private" && existing.ownerId !== userId) {
      return c.json({ error: "Not authorized" }, 403);
    }

    const body = await c.req.json<{ name?: string; description?: string; enabled?: boolean }>();
    await db.update(skills).set({ ...body, updatedAt: new Date().toISOString() }).where(eq(skills.id, id));
    return c.json({ success: true });
  })

  .delete("/api/skills/:id", async (c) => {
    const userId = auth.user!.id;
    const id = parseInt(c.req.param("id"), 10);
    const [existing] = await db.select().from(skills).where(eq(skills.id, id));
    if (!existing) return c.json({ error: "Skill not found" }, 404);
    if (existing.visibility === "private" && existing.ownerId !== userId) {
      return c.json({ error: "Not authorized" }, 403);
    }

    await db.delete(skills).where(eq(skills.id, id));
    return c.json({ success: true });
  });
