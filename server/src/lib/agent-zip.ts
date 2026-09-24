import { ZipWriter, Uint8ArrayWriter, TextReader, configure } from "@zip.js/zip.js";

configure({ useWebWorkers: false });

export function zipRootName(agentName: string): string {
  return agentName.replace(/[/\\]/g, "_").trim() || "agent";
}

export async function packAgentZip(
  agentName: string,
  files: Array<{ path: string; content: string | null; isFolder: number | null }>,
): Promise<Uint8Array> {
  const root = zipRootName(agentName);
  const out = new Uint8ArrayWriter();
  const writer = new ZipWriter(out);
  const added = new Set<string>();

  const addDir = async (dirPath: string) => {
    const key = dirPath.endsWith("/") ? dirPath : `${dirPath}/`;
    if (added.has(key)) return;
    added.add(key);
    await writer.add(key, undefined, { directory: true });
  };

  for (const f of files) {
    const rel = (f.path || "").replace(/^\/+/, "");
    if (!rel || rel.includes("..")) continue;
    const zipPath = `${root}/${rel}`;
    if (f.isFolder) {
      await addDir(zipPath);
      continue;
    }
    const parts = rel.split("/");
    for (let i = 1; i < parts.length; i++) {
      await addDir(`${root}/${parts.slice(0, i).join("/")}`);
    }
    await writer.add(zipPath, new TextReader(f.content || ""));
  }

  if (added.size === 0 && files.every((f) => !f.path)) {
    await addDir(root);
  }

  await writer.close();
  return await out.getData();
}
