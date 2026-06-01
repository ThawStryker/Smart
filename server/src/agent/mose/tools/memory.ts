import { db } from "edgespark";
import { eq, and } from "drizzle-orm";
import { agentFiles } from "@defs";
import { register } from "./registry";
import type { ToolContext } from "./registry";

const MEMORY_PATH = "memory/MEMORY.md";

async function memorySave(args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  const entry = args.entry as string | undefined;
  if (!entry) return "Error: entry required";
  if (!ctx.agentName) return "Error: no agent context";

  const rows = await db.select({ id: agentFiles.id, content: agentFiles.content })
    .from(agentFiles)
    .where(and(eq(agentFiles.userId, ctx.userId), eq(agentFiles.agentName, ctx.agentName), eq(agentFiles.path, MEMORY_PATH)));

  if (rows[0]) {
    const updated = (rows[0].content || "") + `\n- ${new Date().toISOString().slice(0, 10)}: ${entry}`;
    await db.update(agentFiles).set({ content: updated, updatedAt: new Date().toISOString() }).where(eq(agentFiles.id, rows[0].id));
  } else {
    await db.insert(agentFiles).values({ userId: ctx.userId, agentName: ctx.agentName, path: MEMORY_PATH, content: entry });
  }
  return `Memory saved.`;
}

async function memoryRecall(_args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  if (!ctx.agentName) return "Error: no agent context";

  const rows = await db.select({ content: agentFiles.content })
    .from(agentFiles)
    .where(and(eq(agentFiles.userId, ctx.userId), eq(agentFiles.agentName, ctx.agentName), eq(agentFiles.path, MEMORY_PATH)));

  if (!rows[0]?.content) return "No memories stored yet.";
  return `## Agent Memory\n\n${rows[0].content}`;
}

register({
  name: "memory_save",
  description: "Save a durable fact or learning to agent memory. Use after completing tasks or discovering useful patterns. Keep entries short (1-2 sentences).",
  parameters: {
    type: "object",
    properties: { entry: { type: "string", description: "Memory entry to save" } },
    required: ["entry"],
  },
  phase: "memory",
  meta: (args) => ({ entry: (args.entry as string)?.slice(0, 40) }),
  handler: memorySave,
});

register({
  name: "memory_recall",
  description: "Recall all stored memories for the current agent.",
  parameters: { type: "object", properties: {}, required: [] },
  phase: "memory",
  handler: memoryRecall,
});
