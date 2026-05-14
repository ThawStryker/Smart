import { Hono } from "hono";
import { db, storage } from "edgespark";
import { auth } from "edgespark/http";
import { eq, and, or } from "drizzle-orm";
import { skills, buckets } from "@defs";
import { ZipReader, BlobReader, Uint8ArrayWriter } from "@zip.js/zip.js";

async function extractSkillFiles(buf: ArrayBuffer): Promise<Map<string, Uint8Array> | null> {
  const reader = new ZipReader(new BlobReader(new Blob([buf])));
  try {
    const entries = await reader.getEntries();
    const files = new Map<string, Uint8Array>();
    let hasSkillMd = false;
    for (const entry of entries) {
      if (entry.directory) continue;
      const path = entry.filename.replace(/^\.\//, "").replace(/^\//, "");
      const writer = new Uint8ArrayWriter();
      if (entry.getData) {
        const data = await entry.getData(writer);
        files.set(path, data);
        if (path.endsWith("/SKILL.md") || path === "SKILL.md") hasSkillMd = true;
      }
    }
    return hasSkillMd ? files : null;
  } finally {
    await reader.close();
  }
}

async function installFromZip(buf: ArrayBuffer, skillId: number, storagePath: string): Promise<void> {
  const files = await extractSkillFiles(buf);
  if (!files) {
    await db.update(skills).set({ status: "failed", errorMessage: "未找到 SKILL.md 文件" }).where(eq(skills.id, skillId));
    return;
  }

  const bucket = storage.from(buckets.sourceBuckets);
  for (const [path, data] of files) {
    await bucket.put(storagePath + path, data);
  }

  await db.update(skills).set({ status: "installed", storagePath }).where(eq(skills.id, skillId));
}

export const skillsRoutes = new Hono()
  .get("/api/skills", async (c) => {
    try {
      const userId = auth.user!.id;
      const rows = await db
        .select()
        .from(skills)
        .where(
          and(
            eq(skills.hidden, false),
            or(
              eq(skills.visibility, "global"),
              and(eq(skills.visibility, "private"), eq(skills.ownerId, userId))
            )
          )
        )
        .orderBy(skills.createdAt);
      return c.json(rows);
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  })

  .post("/api/skills/:id/process", async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const [row] = await db.select().from(skills).where(eq(skills.id, id));
    if (!row) return c.json({ error: "Not found" }, 404);
    if (row.status !== "installing") return c.json({ status: row.status, errorMessage: row.errorMessage });

    let zipUrl = row.sourceUrl || "";
    if (zipUrl.includes("github.com")) {
      zipUrl = zipUrl.replace(/\/$/, "").replace(/\/tree\/[^/]+$/, "").replace(/\/tree\/[^/]+/, "");
      zipUrl += "/archive/refs/heads/main.zip";
    }

    try {
      let res = await fetch(zipUrl);
      if (!res.ok && zipUrl.endsWith("/archive/refs/heads/main.zip")) {
        res = await fetch(zipUrl.replace("/main.zip", "/master.zip"));
      }
      if (!res.ok) {
        await db.update(skills).set({ status: "failed", errorMessage: `GitHub fetch failed: ${res.status}` }).where(eq(skills.id, id));
        return c.json({ status: "failed", errorMessage: `GitHub fetch failed: ${res.status}` });
      }
      const buf = await res.arrayBuffer();
      const realPath = `skills/${id}/${Date.now()}/`;
      await installFromZip(buf, id, realPath);
      return c.json({ status: "installed" });
    } catch (err) {
      await db.update(skills).set({ status: "failed", errorMessage: String(err) }).where(eq(skills.id, id));
      return c.json({ status: "failed", errorMessage: String(err) });
    }
  })

  .get("/api/skills/:id/status", async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const [row] = await db.select().from(skills).where(eq(skills.id, id));
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ id: row.id, status: row.status, errorMessage: row.errorMessage });
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
      if (!file.name.endsWith(".zip")) return c.json({ error: "Only ZIP files are supported" }, 400);

      const tmpPath = `skills/__new__/${Date.now()}/`;
      const [row] = await db.insert(skills).values({
        name, description,
        visibility: "private",
        ownerId: userId,
        sourceType: "zip",
        storagePath: tmpPath,
        status: "installing",
      }).returning();

      const buf = await file.arrayBuffer();
      const realPath = tmpPath.replace("skills/__new__/", `skills/${row.id}/`);
      await installFromZip(buf, row.id, realPath);

      const [updated] = await db.select().from(skills).where(eq(skills.id, row.id));
      return c.json(updated, 201);
    }

    // GitHub URL
    const body = await c.req.json<{ gitUrl: string; name: string; description?: string }>();
    if (!body.name || !body.gitUrl) return c.json({ error: "name and gitUrl required" }, 400);

    let zipUrl = body.gitUrl;
    if (zipUrl.includes("github.com")) {
      zipUrl = zipUrl.replace(/\/$/, "").replace(/\/tree\/[^/]+$/, "").replace(/\/tree\/[^/]+/, "");
      zipUrl += "/archive/refs/heads/main.zip";
    }

    const tmpPath = `skills/__new__/${Date.now()}/`;
    const [row] = await db.insert(skills).values({
      name: body.name,
      description: body.description || "",
      visibility: "private",
      ownerId: userId,
      sourceType: "git",
      sourceUrl: body.gitUrl,
      storagePath: tmpPath,
      status: "installing",
    }).returning();

    return c.json({ ...row, status: "installing" }, 201);
  })

  .patch("/api/skills/:id", async (c) => {
    const userId = auth.user!.id;
    const id = parseInt(c.req.param("id"), 10);
    const [existing] = await db.select().from(skills).where(eq(skills.id, id));
    if (!existing) return c.json({ error: "Skill not found" }, 404);
    if (existing.visibility === "private" && existing.ownerId !== userId) {
      return c.json({ error: "Not authorized" }, 403);
    }

    const body = await c.req.json<{ name?: string; description?: string; enabled?: boolean; hidden?: boolean }>();
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
  })

  .get("/api/skills/commands", async (c) => {
    const userId = auth.user!.id;
    const rows = await db
      .select()
      .from(skills)
      .where(
        and(
          eq(skills.enabled, true),
          eq(skills.status, "installed"),
          or(
            eq(skills.visibility, "global"),
            and(eq(skills.visibility, "private"), eq(skills.ownerId, userId))
          )
        )
      );

    const result: Array<{ skillName: string; skillId: number; commands: Array<{ name: string; description: string }> }> = [];

    for (const skill of rows) {
      if (!skill.storagePath) continue;
      const skillMd = await storage.from(buckets.sourceBuckets).get(skill.storagePath + "SKILL.md");
      let content: string | null = null;
      if (skillMd) {
        content = new TextDecoder().decode(skillMd.body);
      } else {
        const list = await storage.from(buckets.sourceBuckets).list({ prefix: skill.storagePath, limit: 50 });
        const mdPath = list.files.find(f => f.path.endsWith("/SKILL.md") || f.path.endsWith("SKILL.md"));
        if (mdPath) {
          const obj = await storage.from(buckets.sourceBuckets).get(mdPath.path);
          if (obj) content = new TextDecoder().decode(obj.body);
        }
      }
      if (!content) continue;

      const commandsMatch = content.match(/###\s+Commands\s*\n([\s\S]*?)(?=\n###|\n##|$)/i);
      if (!commandsMatch) continue;

      const commands: Array<{ name: string; description: string }> = [];
      const lines = commandsMatch[1].split("\n");
      for (const line of lines) {
        const cmdMatch = line.match(/-\s+`(\/[a-z_-]+)`\s*[—–-]?\s*(.*)/i);
        if (cmdMatch) {
          commands.push({ name: cmdMatch[1], description: cmdMatch[2].trim() });
        }
      }
      if (commands.length > 0) {
        result.push({ skillName: skill.name, skillId: skill.id, commands });
      }
    }

    return c.json(result);
  });
