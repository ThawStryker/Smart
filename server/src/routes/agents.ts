import { Hono } from "hono";
import { db } from "edgespark";
import { auth } from "edgespark/http";
import { eq, and, like } from "drizzle-orm";
import { userAgents, workFiles, workSessions } from "@defs";

export const userAgentRoutes = new Hono();

// List all agents for current user
userAgentRoutes.get("/", async (c) => {
  const userId = auth.user!.id;
  const agents = await db.select().from(userAgents).where(eq(userAgents.userId, userId));
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

  // Find a valid sessionId for file storage (use most recent session, or create one)
  const sessions = await db.select().from(workSessions).where(eq(workSessions.userId, userId));
  let sid = sessions[0]?.id;
  if (!sid) {
    const [s] = await db.insert(workSessions).values({ userId, title: "Agent Files" }).returning();
    sid = s.id;
  }

  // Create agent file structure
  const base = `agents/${name}`;
  const fileEntries = [
    { path: `${base}/AGENTS.md`, content: agent.agentsMd },
    { path: `${base}/memory/USER.md`, content: agent.userMd },
    { path: `${base}/memory/MEMORY.md`, content: agent.memoryMd },
    { path: `${base}/skills`, content: "", isFolder: 1 },
    { path: `${base}/context`, content: "", isFolder: 1 },
    { path: `${base}/heartbeat/HEARTBEAT.md`, content: "# Heartbeat Configuration\n\nDefine scheduled tasks below.\n\n- time: \"0 9 * * *\"\n  task: \"Daily check\"\n" },
  ];
  for (const e of fileEntries) {
    await db.insert(workFiles).values({ sessionId: sid, path: e.path, content: e.content, isFolder: e.isFolder || 0 });
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
  if (body.agentsMd !== undefined) update.agentsMd = body.agentsMd;
  if (body.userMd !== undefined) update.userMd = body.userMd;
  if (body.memoryMd !== undefined) update.memoryMd = body.memoryMd;
  await db.update(userAgents).set(update).where(and(eq(userAgents.userId, userId), eq(userAgents.name, name)));
  return c.json({ ok: true });
});

// Delete agent
userAgentRoutes.delete("/:name", async (c) => {
  const userId = auth.user!.id;
  const name = c.req.param("name");
  await db.delete(userAgents).where(and(eq(userAgents.userId, userId), eq(userAgents.name, name)));
  // Also clean up agent files across all sessions
  await db.delete(workFiles).where(like(workFiles.path, `agents/${name}/%`));
  return c.json({ ok: true });
});

// List agent files (across all sessions)
userAgentRoutes.get("/:name/files", async (c) => {
  const name = c.req.param("name");
  const prefix = c.req.query("prefix") || "";
  const searchPath = prefix ? `agents/${name}/${prefix}` : `agents/${name}/`;
  const files = await db.select().from(workFiles).where(like(workFiles.path, `${searchPath}%`));
  return c.json(files);
});
