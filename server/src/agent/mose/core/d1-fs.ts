import { db } from "edgespark";
import { eq, and, like, asc } from "drizzle-orm";
import { agentFiles, workspaceFiles } from "@defs";
import type { FileEntry, FileRecord, FileStore } from "../types";
import { listTarget, resolvePath } from "./fs";

function missing(path: string): FileRecord {
  const { kind, storePath, displayPath } = resolvePath(path);
  return { exists: false, content: "", kind, storePath, displayPath };
}

export function createD1FileStore(userId: string, agentName: string): FileStore {
  return {
    async stat(path: string): Promise<FileRecord> {
      const { kind, storePath, displayPath } = resolvePath(path);
      if (kind === "workspace") {
        const rows = await db.select().from(workspaceFiles).where(
          and(eq(workspaceFiles.userId, userId), eq(workspaceFiles.path, storePath)),
        );
        const row = rows[0];
        if (!row) return missing(path);
        return { exists: true, content: row.content || "", kind, storePath, displayPath };
      }
      const rows = await db.select().from(agentFiles).where(
        and(eq(agentFiles.userId, userId), eq(agentFiles.agentName, agentName), eq(agentFiles.path, storePath)),
      );
      const row = rows[0];
      if (!row) return missing(path);
      return { exists: true, content: row.content || "", kind, storePath, displayPath };
    },

    async read(path: string): Promise<FileRecord> {
      return this.stat(path);
    },

    async write(path: string, content: string): Promise<{ created: boolean }> {
      const rec = await this.stat(path);
      const now = new Date().toISOString();
      if (rec.kind === "workspace") {
        await db.insert(workspaceFiles).values({
          userId, path: rec.storePath, content, updatedAt: now,
        }).onConflictDoUpdate({
          target: [workspaceFiles.userId, workspaceFiles.path],
          set: { content, updatedAt: now },
        });
      } else {
        await db.insert(agentFiles).values({
          userId, agentName, path: rec.storePath, content, updatedAt: now,
        }).onConflictDoUpdate({
          target: [agentFiles.userId, agentFiles.agentName, agentFiles.path],
          set: { content, updatedAt: now },
        });
      }
      return { created: !rec.exists };
    },

    async list(prefix: string): Promise<FileEntry[]> {
      const { kind, storePrefix } = listTarget(prefix);
      if (kind === "workspace") {
        const condition = storePrefix
          ? and(eq(workspaceFiles.userId, userId), like(workspaceFiles.path, `${storePrefix}%`))
          : eq(workspaceFiles.userId, userId);
        const files = await db.select().from(workspaceFiles).where(condition).orderBy(asc(workspaceFiles.createdAt));
        return files.map((f) => ({
          displayPath: `workspace/${f.path}`,
          isFolder: !!f.isFolder,
          content: f.content,
        }));
      }
      const condition = storePrefix
        ? and(eq(agentFiles.userId, userId), eq(agentFiles.agentName, agentName), like(agentFiles.path, `${storePrefix}%`))
        : and(eq(agentFiles.userId, userId), eq(agentFiles.agentName, agentName));
      const files = await db.select().from(agentFiles).where(condition).orderBy(asc(agentFiles.createdAt));
      return files.map((f) => ({
        displayPath: f.path,
        isFolder: !!f.isFolder,
        content: f.content,
      }));
    },
  };
}
