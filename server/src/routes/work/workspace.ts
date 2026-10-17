import { Hono } from "hono";
import { db, storage } from "edgespark";
import { auth } from "edgespark/http";
import { eq, and, asc, sql } from "drizzle-orm";
import { buckets, workspaceFiles } from "@defs";
import { pathIsChild, pathIsSelfOrChild } from "../../lib/path-prefix";

/** 超过这个大小就不要写进 D1，否则会 SQLITE_TOOBIG。 */
const SPILL_AT = 128 * 1024;
const FILE_FORMAT = "smart-pdf-file";

interface StoredFile {
  format: typeof FILE_FORMAT;
  version: 1;
  uri: string;
  encoding: "latin1" | "utf8";
}

function readPointer(content: string | null | undefined): StoredFile | null {
  if (!content || !content.startsWith("{")) return null;
  try {
    const data = JSON.parse(content) as Partial<StoredFile>;
    if (data.format !== FILE_FORMAT || data.version !== 1 || typeof data.uri !== "string") return null;
    if (data.encoding !== "latin1" && data.encoding !== "utf8") return null;
    return { format: FILE_FORMAT, version: 1, uri: data.uri, encoding: data.encoding };
  } catch {
    return null;
  }
}

/** 只认本用户自己上传的对象，避免指针指到别的附件。 */
function ownedPath(userId: string, uri: string): string | null {
  const parsed = storage.tryParseS3Uri(uri);
  if (!parsed || parsed.bucket.bucket_name !== buckets.attachmentBuckets.bucket_name) return null;
  const prefix = `workspace/${userId}/`;
  if (!parsed.path.startsWith(prefix)) return null;
  return parsed.path;
}

function latin1Bytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) bytes[index] = text.charCodeAt(index) & 0xff;
  return bytes;
}

function binaryKind(content: string): "pdf" | "docx" | null {
  if (content.startsWith("%PDF")) return "pdf";
  if (content.startsWith("PK\u0003\u0004")) return "docx";
  return null;
}

async function storeContent(userId: string, content: string): Promise<string> {
  const kind = binaryKind(content);
  const encoding: StoredFile["encoding"] = kind ? "latin1" : "utf8";
  const bytes = encoding === "latin1" ? latin1Bytes(content) : new TextEncoder().encode(content);
  if (bytes.byteLength <= SPILL_AT) return content;
  const key = `workspace/${userId}/${crypto.randomUUID()}`;
  const contentType = kind === "pdf"
    ? "application/pdf"
    : kind === "docx"
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : "text/plain; charset=utf-8";
  await storage.from(buckets.attachmentBuckets).put(key, bytes, { contentType });
  const uri = storage.createS3Uri(buckets.attachmentBuckets, key);
  return JSON.stringify({ format: FILE_FORMAT, version: 1, uri, encoding } satisfies StoredFile);
}

async function removeStored(userId: string, content: string | null | undefined) {
  const pointer = readPointer(content);
  if (!pointer) return;
  const key = ownedPath(userId, pointer.uri);
  if (!key) return;
  await storage.from(buckets.attachmentBuckets).delete(key);
}

export const workspaceRoutes = new Hono();

// 原子化重命名
workspaceRoutes.post("/rename", async (c) => {
  const userId = auth.user!.id;
  const { oldPath, newPath } = await c.req.json<{ oldPath: string; newPath: string }>();
  if (!oldPath || !newPath) return c.json({ error: "oldPath and newPath required" }, 400);
  if (oldPath === newPath) return c.json({ ok: true });

  const existing = await db.select({ id: workspaceFiles.id }).from(workspaceFiles)
    .where(and(eq(workspaceFiles.userId, userId), eq(workspaceFiles.path, newPath))).limit(1);
  if (existing[0]) return c.json({ error: "Target path already exists" }, 409);

  await db.update(workspaceFiles).set({ path: newPath, updatedAt: new Date().toISOString() })
    .where(and(eq(workspaceFiles.userId, userId), eq(workspaceFiles.path, oldPath)));
  await db.update(workspaceFiles).set({
    path: sql`REPLACE(${workspaceFiles.path}, ${oldPath + "/"}, ${newPath + "/"})`,
    updatedAt: new Date().toISOString(),
  }).where(and(eq(workspaceFiles.userId, userId), pathIsChild(workspaceFiles.path, oldPath)));

  return c.json({ ok: true });
});

// List workspace files
workspaceRoutes.get("/", async (c) => {
  const userId = auth.user!.id;
  const prefix = c.req.query("prefix") || "";
  const condition = prefix
    ? and(eq(workspaceFiles.userId, userId), pathIsSelfOrChild(workspaceFiles.path, prefix))
    : eq(workspaceFiles.userId, userId);
  const files = await db.select().from(workspaceFiles).where(condition).orderBy(asc(workspaceFiles.createdAt));
  return c.json(files);
});

// Get single file
workspaceRoutes.get("/:path{.+}", async (c) => {
  const userId = auth.user!.id;
  const filePath = c.req.param("path");
  if (!filePath) return c.json({ error: "Path required" }, 400);
  const rows = await db.select().from(workspaceFiles).where(and(eq(workspaceFiles.userId, userId), eq(workspaceFiles.path, filePath)));
  const file = rows[0];
  if (!file) return c.json({ error: "Not found" }, 404);
  if (c.req.query("raw") === "1") {
    const pointer = readPointer(file.content);
    const key = pointer ? ownedPath(userId, pointer.uri) : null;
    if (!key) return c.json({ error: "Not found" }, 404);
    const obj = await storage.from(buckets.attachmentBuckets).get(key);
    if (!obj) return c.json({ error: "Not found" }, 404);
    const type = obj.metadata.contentType || (pointer?.encoding === "latin1" ? "application/pdf" : "text/plain; charset=utf-8");
    return new Response(obj.body, { headers: { "Content-Type": type } });
  }
  return c.json(file);
});

workspaceRoutes.put("/:path{.+}", async (c) => {
  const userId = auth.user!.id;
  const filePath = c.req.param("path");
  if (!filePath) return c.json({ error: "Path required" }, 400);
  const { content, isFolder } = await c.req.json<{ content?: string; isFolder?: boolean }>();

  const rows = await db.select().from(workspaceFiles).where(and(eq(workspaceFiles.userId, userId), eq(workspaceFiles.path, filePath)));
  const existing = rows[0];
  const stored = content !== undefined ? await storeContent(userId, content) : undefined;

  if (existing) {
    await db.update(workspaceFiles).set({
      content: stored !== undefined ? stored : existing.content,
      updatedAt: new Date().toISOString(),
    }).where(eq(workspaceFiles.id, existing.id));
    if (stored !== undefined && stored !== existing.content) await removeStored(userId, existing.content);
  } else {
    await db.insert(workspaceFiles).values({ userId, path: filePath, content: stored || "", isFolder: isFolder ? 1 : 0 });
    if (filePath.includes("/")) {
      const parts = filePath.split("/");
      for (let i = 1; i < parts.length; i++) {
        const parentPath = parts.slice(0, i).join("/");
        const parentRows = await db.select().from(workspaceFiles).where(and(eq(workspaceFiles.userId, userId), eq(workspaceFiles.path, parentPath)));
        if (!parentRows[0]) {
          await db.insert(workspaceFiles).values({ userId, path: parentPath, content: "", isFolder: 1 });
        }
      }
    }
  }

  return c.json({ ok: true });
});

workspaceRoutes.delete("/:path{.+}", async (c) => {
  const userId = auth.user!.id;
  const filePath = c.req.param("path");
  if (!filePath) return c.json({ error: "Path required" }, 400);
  const doomed = await db.select({ content: workspaceFiles.content }).from(workspaceFiles)
    .where(and(eq(workspaceFiles.userId, userId), pathIsSelfOrChild(workspaceFiles.path, filePath)));
  await db.delete(workspaceFiles).where(and(eq(workspaceFiles.userId, userId), pathIsSelfOrChild(workspaceFiles.path, filePath)));
  for (const row of doomed) await removeStored(userId, row.content);
  return c.json({ ok: true });
});
