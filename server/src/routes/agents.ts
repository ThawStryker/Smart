import { Hono } from "hono";
import { db } from "edgespark";
import { auth } from "edgespark/http";
import { eq, and, asc, sql } from "drizzle-orm";
import { userAgents, agentFiles, agentFileVersions, marketListings, marketAgentFiles } from "@defs";
import { pathIsChild, pathIsSelfOrChild } from "../lib/path-prefix";
import { hashNameAvatar, pickRandomAvatar } from "../lib/agent-avatar";
import { packAgentZip, zipRootName } from "../lib/agent-zip";

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

async function ensureAvatars<T extends { id: number; name: string; avatar: string | null }>(agents: T[]): Promise<T[]> {
  for (const a of agents) {
    if (a.avatar) continue;
    const avatar = hashNameAvatar(a.name);
    await db.update(userAgents).set({ avatar }).where(eq(userAgents.id, a.id));
    a.avatar = avatar;
  }
  return agents;
}

// List all agents for current user
userAgentRoutes.get("/", async (c) => {
  const userId = auth.user!.id;
  const agents = await db.select().from(userAgents).where(eq(userAgents.userId, userId)).orderBy(asc(userAgents.createdAt));
  await ensureAvatars(agents);
  return c.json(agents);
});

// Get single agent
userAgentRoutes.get("/:name", async (c) => {
  const userId = auth.user!.id;
  const name = c.req.param("name");
  const agents = await db.select().from(userAgents).where(and(eq(userAgents.userId, userId), eq(userAgents.name, name)));
  const agent = agents[0];
  if (!agent) return c.json({ error: "Not found" }, 404);
  await ensureAvatars([agent]);
  return c.json(agent);
});

// 人才市场：发布状态
userAgentRoutes.get("/:name/publish-status", async (c) => {
  const userId = auth.user!.id;
  const name = c.req.param("name");
  const [agent] = await db.select().from(userAgents).where(and(eq(userAgents.userId, userId), eq(userAgents.name, name)));
  if (!agent) return c.json({ error: "Not found" }, 404);
  if (agent.sourceListingId) {
    return c.json({ canPublish: false, status: "installed", listingId: agent.sourceListingId });
  }
  const [listing] = await db.select().from(marketListings).where(and(
    eq(marketListings.sellerId, userId),
    eq(marketListings.type, "talent"),
    eq(marketListings.sourceAgentName, name),
  ));
  // 下架/驳回后视为未上架：按钮走首次发布，标题用当前 Agent 名
  if (!listing || listing.status === "removed" || listing.status === "rejected") {
    return c.json({
      canPublish: true,
      status: "none",
      description: listing?.description || "",
      category: listing?.category || "",
    });
  }
  return c.json({
    canPublish: true,
    status: listing.status,
    listingId: listing.id,
    title: listing.title,
    description: listing.description || "",
    category: listing.category || "",
  });
});

// 打包当前 Agent 全部文件为 zip
userAgentRoutes.get("/:name/download", async (c) => {
  const userId = auth.user!.id;
  const name = c.req.param("name");
  const [agent] = await db.select().from(userAgents).where(and(eq(userAgents.userId, userId), eq(userAgents.name, name)));
  if (!agent) return c.json({ error: "Not found" }, 404);

  const files = await db.select().from(agentFiles)
    .where(and(eq(agentFiles.userId, userId), eq(agentFiles.agentName, name)))
    .orderBy(asc(agentFiles.createdAt));

  const zipped = await packAgentZip(name, files);
  const filename = `${zipRootName(name)}.zip`;
  const encoded = encodeURIComponent(filename);
  return new Response(zipped, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${encoded}"; filename*=UTF-8''${encoded}`,
    },
  });
});

async function writeTalentSnapshot(listingId: number, files: Array<{ path: string; content: string | null; isFolder: number | null }>) {
  await db.delete(marketAgentFiles).where(eq(marketAgentFiles.listingId, listingId));
  for (const f of files) {
    await db.insert(marketAgentFiles).values({
      listingId,
      path: f.path,
      content: f.content || "",
      isFolder: f.isFolder || 0,
    });
  }
}

// 人才市场：推送 / 再推送快照
userAgentRoutes.post("/:name/publish", async (c) => {
  const userId = auth.user!.id;
  const name = c.req.param("name");
  const [agent] = await db.select().from(userAgents).where(and(eq(userAgents.userId, userId), eq(userAgents.name, name)));
  if (!agent) return c.json({ error: "Not found" }, 404);
  if (agent.sourceListingId) return c.json({ error: "从市场安装的 Agent 不能再发布" }, 403);

  const body = await c.req.json<{ title?: string; description?: string; category?: string }>();
  const title = (body.title || name).trim();
  if (!title) return c.json({ error: "title required" }, 400);

  const files = await db.select().from(agentFiles).where(and(eq(agentFiles.userId, userId), eq(agentFiles.agentName, name)));

  const [existing] = await db.select().from(marketListings).where(and(
    eq(marketListings.sellerId, userId),
    eq(marketListings.type, "talent"),
    eq(marketListings.sourceAgentName, name),
  ));

  if (existing) {
    // 下架后再发：若表单仍带着旧市场标题，改用当前 Agent 名
    const staleTitle = (existing.status === "removed" || existing.status === "rejected")
      && title === existing.title
      && name !== existing.title;
    const nextTitle = staleTitle ? name : title;
    await db.update(marketListings).set({
      title: nextTitle,
      description: body.description ?? existing.description,
      category: body.category ?? existing.category,
      status: "pending_review",
      version: (existing.version || 1) + 1,
    }).where(eq(marketListings.id, existing.id));
    await writeTalentSnapshot(existing.id, files);
    return c.json({ ok: true, id: existing.id, status: "pending_review", version: (existing.version || 1) + 1 });
  }

  const [row] = await db.insert(marketListings).values({
    toolId: 0,
    sellerId: userId,
    title,
    description: body.description || "",
    category: body.category || "",
    type: "talent",
    status: "pending_review",
    sourceAgentName: name,
    version: 1,
  }).returning();
  await writeTalentSnapshot(row.id, files);
  return c.json({ ok: true, id: row.id, status: "pending_review", version: 1 }, 201);
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
    userMd: "# 约定\n\n",
    memoryMd: "# 记忆\n\n",
    avatar: pickRandomAvatar(),
  }).returning();

  // Create agent file structure in agent_files (no sessionId)
  const fileEntries = [
    { path: "AGENTS.md", content: agent.agentsMd },
    { path: "memory/USER.md", content: agent.userMd },
    { path: "memory/MEMORY.md", content: agent.memoryMd },
    { path: "skills", content: "", isFolder: 1 },
    { path: "context", content: "", isFolder: 1 },
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
  const [current] = await db.select().from(userAgents).where(and(eq(userAgents.userId, userId), eq(userAgents.name, name)));
  if (!current) return c.json({ error: "Not found" }, 404);
  // 改名不换头像；旧数据没有头像时按旧名冻结一次
  if (newName && newName !== name && !current.avatar) {
    update.avatar = hashNameAvatar(name);
  }
  await db.update(userAgents).set(update).where(and(eq(userAgents.userId, userId), eq(userAgents.name, name)));

  // Update agentName in agent_files if renamed
  if (newName && newName !== name) {
    await db.update(agentFiles).set({ agentName: newName }).where(
      and(eq(agentFiles.userId, userId), eq(agentFiles.agentName, name)),
    );
    await db.update(marketListings).set({ sourceAgentName: newName, title: newName }).where(and(
      eq(marketListings.sellerId, userId),
      eq(marketListings.type, "talent"),
      eq(marketListings.sourceAgentName, name),
    ));
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
  }).where(and(eq(agentFiles.userId, userId), eq(agentFiles.agentName, name), pathIsChild(agentFiles.path, oldPath)));

  return c.json({ ok: true });
});

// List agent files
userAgentRoutes.get("/:name/files", async (c) => {
  try {
    const userId = auth.user!.id;
    const name = c.req.param("name");
    const prefix = c.req.query("prefix") || "";
    const condition = prefix
      ? and(eq(agentFiles.userId, userId), eq(agentFiles.agentName, name), pathIsSelfOrChild(agentFiles.path, prefix))
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
    // 保存旧版本
    await db.insert(agentFileVersions).values({
      fileId: existing.id,
      path: filePath,
      content: existing.content || "",
    });
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
  await db.delete(agentFiles).where(and(eq(agentFiles.userId, userId), eq(agentFiles.agentName, name), pathIsSelfOrChild(agentFiles.path, filePath)));
  return c.json({ ok: true });
});
