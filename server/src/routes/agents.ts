import { Hono } from "hono";
import { db } from "edgespark";
import { auth } from "edgespark/http";
import { eq, and, like, asc, sql } from "drizzle-orm";
import { userAgents, agentFiles } from "@defs";

export const userAgentRoutes = new Hono();

// 批量获取多个 agent 的文件（解决 N+1 问题）
userAgentRoutes.get("/files/batch", async (c) => {
  const userId = auth.user!.id;
  const namesParam = c.req.query("names") || "";
  const names = namesParam.split(",").filter(Boolean);
  if (names.length === 0) return c.json([]);

  const results: Array<{ agentName: string; files: Array<Record<string, unknown>> }> = [];
  for (const name of names) {
    const files = await db.select().from(agentFiles)
      .where(and(eq(agentFiles.userId, userId), eq(agentFiles.agentName, name)))
      .orderBy(asc(agentFiles.createdAt));
    results.push({ agentName: name, files });
  }
  return c.json(results);
});

// List all agents for current user
userAgentRoutes.get("/", async (c) => {
  const userId = auth.user!.id;
  const agents = await db.select().from(userAgents).where(eq(userAgents.userId, userId)).orderBy(asc(userAgents.createdAt));
  return c.json(agents);
});

// Get single agent
userAgentRoutes.get("/:name", async (c) => {
  const userId = auth.user!.id;
  const name = c.req.param("name");
  const agents = await db.select().from(userAgents).where(and(eq(userAgents.userId, userId), eq(userAgents.name, name)));
  const agent = agents[0];
  if (!agent) return c.json({ error: "Not found" }, 404);
  return c.json(agent);
});

// Create agent
userAgentRoutes.post("/", async (c) => {
  const userId = auth.user!.id;
  const { name } = await c.req.json<{ name: string }>();
  const existing = await db.select().from(userAgents).where(and(eq(userAgents.userId, userId), eq(userAgents.name, name)));
  if (existing[0]) return c.json({ error: "Agent already exists" }, 409);
  const [agent] = await db.insert(userAgents).values({
    userId,
    name,
    title: name,
    agentsMd: `# ${name}\n\nDescribe the role of this agent.`,
    userMd: "# User Memory\n\nPermanent preferences and document references. Write document paths and summaries below.\n",
    memoryMd: "# Agent Memory\n\nSelf-learned experience from past tasks. The agent appends insights here automatically.\n",
  }).returning();

  // Create agent file structure in agent_files (no sessionId)
  const fileEntries = [
    { path: "AGENTS.md", content: agent.agentsMd },
    { path: "memory/USER.md", content: agent.userMd },
    { path: "memory/MEMORY.md", content: agent.memoryMd },
    { path: "skills", content: "", isFolder: 1 },
    { path: "context", content: "", isFolder: 1 },
    { path: "heartbeat/HEARTBEAT.md", content: "# Heartbeat Configuration\n\nDefine scheduled tasks below.\n\n- time: \"0 9 * * *\"\n  task: \"Daily check\"\n" },
  ];
  for (const e of fileEntries) {
    await db.insert(agentFiles).values({
      userId, agentName: name, path: e.path, content: e.content, isFolder: e.isFolder || 0,
    });
  }

  return c.json(agent, 201);
});

// Update agent
userAgentRoutes.patch("/:name", async (c) => {
  const userId = auth.user!.id;
  const name = c.req.param("name");
  const body = await c.req.json<Record<string, string>>();
  const update: Record<string, string> = {};
  if (body.title !== undefined) update.title = body.title;
  if (body.name !== undefined) update.name = body.name;
  if (body.agentsMd !== undefined) update.agentsMd = body.agentsMd;
  if (body.userMd !== undefined) update.userMd = body.userMd;
  if (body.memoryMd !== undefined) update.memoryMd = body.memoryMd;
  const newName = update.name;
  await db.update(userAgents).set(update).where(and(eq(userAgents.userId, userId), eq(userAgents.name, name)));

  // Update agentName in agent_files if renamed
  if (newName && newName !== name) {
    await db.update(agentFiles).set({ agentName: newName }).where(
      and(eq(agentFiles.userId, userId), eq(agentFiles.agentName, name)),
    );
  }

  return c.json({ ok: true });
});

// Delete agent
userAgentRoutes.delete("/:name", async (c) => {
  const userId = auth.user!.id;
  const name = c.req.param("name");
  await db.delete(userAgents).where(and(eq(userAgents.userId, userId), eq(userAgents.name, name)));
  await db.delete(agentFiles).where(and(eq(agentFiles.userId, userId), eq(agentFiles.agentName, name)));
  return c.json({ ok: true });
});

// 原子化重命名 agent 文件
userAgentRoutes.post("/:name/files/rename", async (c) => {
  const userId = auth.user!.id;
  const name = c.req.param("name");
  const { oldPath, newPath } = await c.req.json<{ oldPath: string; newPath: string }>();
  if (!oldPath || !newPath) return c.json({ error: "oldPath and newPath required" }, 400);
  if (oldPath === newPath) return c.json({ ok: true });

  const existing = await db.select({ id: agentFiles.id }).from(agentFiles)
    .where(and(eq(agentFiles.userId, userId), eq(agentFiles.agentName, name), eq(agentFiles.path, newPath))).limit(1);
  if (existing[0]) return c.json({ error: "Target path already exists" }, 409);

  await db.update(agentFiles).set({ path: newPath, updatedAt: new Date().toISOString() })
    .where(and(eq(agentFiles.userId, userId), eq(agentFiles.agentName, name), eq(agentFiles.path, oldPath)));
  await db.update(agentFiles).set({
    path: sql`REPLACE(${agentFiles.path}, ${oldPath + "/"}, ${newPath + "/"})`,
    updatedAt: new Date().toISOString(),
  }).where(and(eq(agentFiles.userId, userId), eq(agentFiles.agentName, name), like(agentFiles.path, `${oldPath}/%`)));

  return c.json({ ok: true });
});

// List agent files
userAgentRoutes.get("/:name/files", async (c) => {
  try {
    const userId = auth.user!.id;
    const name = c.req.param("name");
    const prefix = c.req.query("prefix") || "";
    const condition = prefix
      ? and(eq(agentFiles.userId, userId), eq(agentFiles.agentName, name), like(agentFiles.path, `${prefix}%`))
      : and(eq(agentFiles.userId, userId), eq(agentFiles.agentName, name));
    const files = await db.select().from(agentFiles).where(condition).orderBy(asc(agentFiles.createdAt));
    return c.json(files);
  } catch (err: any) {
    return c.json({ error: err.message, stack: err.stack }, 500);
  }
});

// Get single agent file
userAgentRoutes.get("/:name/files/:path{.+}", async (c) => {
  const userId = auth.user!.id;
  const name = c.req.param("name");
  const filePath = c.req.param("path");
  if (!filePath) return c.json({ error: "Path required" }, 400);
  const rows = await db.select().from(agentFiles).where(and(eq(agentFiles.userId, userId), eq(agentFiles.agentName, name), eq(agentFiles.path, filePath)));
  const file = rows[0];
  if (!file) return c.json({ error: "Not found" }, 404);
  return c.json(file);
});

userAgentRoutes.put("/:name/files/:path{.+}", async (c) => {
  try {
  const userId = auth.user!.id;
  const name = c.req.param("name");
  const filePath = c.req.param("path");
  if (!filePath) return c.json({ error: "Path required" }, 400);
  const { content, isFolder } = await c.req.json<{ content?: string; isFolder?: boolean }>();

  const rows = await db.select().from(agentFiles).where(and(eq(agentFiles.userId, userId), eq(agentFiles.agentName, name), eq(agentFiles.path, filePath)));
  const existing = rows[0];

  if (existing) {
    await db.update(agentFiles).set({
      content: content !== undefined ? content : existing.content,
      updatedAt: new Date().toISOString(),
    }).where(eq(agentFiles.id, existing.id));
  } else {
    await db.insert(agentFiles).values({ userId, agentName: name, path: filePath, content: content || "", isFolder: isFolder ? 1 : 0 });
    // Auto-create parent folders
    if (filePath.includes("/")) {
      const parts = filePath.split("/");
      for (let i = 1; i < parts.length; i++) {
        const parentPath = parts.slice(0, i).join("/");
        const parentRows = await db.select().from(agentFiles).where(and(eq(agentFiles.userId, userId), eq(agentFiles.agentName, name), eq(agentFiles.path, parentPath)));
        if (!parentRows[0]) {
          await db.insert(agentFiles).values({ userId, agentName: name, path: parentPath, content: "", isFolder: 1 });
        }
      }
    }
  }

  return c.json({ ok: true });
  } catch (err: any) { return c.json({ error: err.message }, 500); }
});

userAgentRoutes.delete("/:name/files/:path{.+}", async (c) => {
  const userId = auth.user!.id;
  const name = c.req.param("name");
  const filePath = c.req.param("path");
  if (!filePath) return c.json({ error: "Path required" }, 400);
  await db.delete(agentFiles).where(and(eq(agentFiles.userId, userId), eq(agentFiles.agentName, name), like(agentFiles.path, `${filePath}%`)));
  return c.json({ ok: true });
});
