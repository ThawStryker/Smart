import { db, storage, ctx as edgeCtx } from "edgespark";
import { eq } from "drizzle-orm";
import { buckets, executionSteps, marketListings } from "@defs";
import { loadSkillContent } from "./tools/skill";

export interface ExecContext {
  prefix: string;
  toolId: number;
  eventQueue: Array<Record<string, unknown>>;
  generatedFiles: Array<{ path: string; language: string }>;
}

function emit(ec: ExecContext, data: Record<string, unknown>) {
  ec.eventQueue.push(data);
}

export async function executeTool(
  name: string,
  argsStr: string,
  ec: ExecContext,
  mcpMap: Map<string, Record<string, unknown>>,
): Promise<string> {
  let args: Record<string, string> = {};
  try { args = JSON.parse(argsStr); } catch {}

  let result: string;
  try {
    switch (name) {
      case "read_file": {
        const obj = await storage.from(buckets.sourceBuckets).get(ec.prefix + args.path);
        result = obj ? new TextDecoder().decode(obj.body) : "File not found";
        break;
      }
      case "write_file": {
        await storage.from(buckets.sourceBuckets).put(ec.prefix + args.path, new TextEncoder().encode(args.content));
        const lang = args.path.split(".").pop() || "text";
        ec.generatedFiles.push({ path: args.path, language: lang });
        result = `File written: ${args.path}`;
        emit(ec, { type: "file", path: args.path, language: lang, content: args.content, toolId: ec.toolId });
        break;
      }
      case "edit_file": {
        const obj = await storage.from(buckets.sourceBuckets).get(ec.prefix + args.path);
        if (!obj) { result = "File not found"; break; }
        let content = new TextDecoder().decode(obj.body);
        if (!content.includes(args.old_string)) { result = `Error: old_string not found in ${args.path}`; break; }
        content = content.replace(args.old_string, args.new_string);
        await storage.from(buckets.sourceBuckets).put(ec.prefix + args.path, new TextEncoder().encode(content));
        const lang = args.path.split(".").pop() || "text";
        if (!ec.generatedFiles.some(f => f.path === args.path)) ec.generatedFiles.push({ path: args.path, language: lang });
        result = `File edited: ${args.path}`;
        emit(ec, { type: "file", path: args.path, language: lang, content, toolId: ec.toolId });
        break;
      }
      case "list_files": {
        const lp = ec.prefix + (args.prefix || "");
        const fl = await storage.from(buckets.sourceBuckets).list({ prefix: lp, limit: 100 });
        result = fl.files.map(f => f.path.replace(ec.prefix, "")).join("\n") || "(empty)";
        break;
      }
      case "grep_files": {
        const lp = ec.prefix + (args.path ? args.path.replace(/\/[^/]*$/, "/") : "");
        const fl = await storage.from(buckets.sourceBuckets).list({ prefix: lp || ec.prefix, limit: 50 });
        const matches: string[] = [];
        const pattern = new RegExp(args.pattern, "gi");
        for (const f of fl.files) {
          const obj = await storage.from(buckets.sourceBuckets).get(f.path);
          if (!obj) continue;
          const lines = new TextDecoder().decode(obj.body).split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (pattern.test(lines[i])) matches.push(`${f.path.replace(ec.prefix, "")}:${i + 1}: ${lines[i].trim()}`);
          }
        }
        result = matches.slice(0, 30).join("\n") || "No matches found";
        break;
      }
      case "web_search": {
        try {
          const q = encodeURIComponent(args.query);
          const sr = await fetch(`https://api.duckduckgo.com/?q=${q}&format=json&no_html=1`, { headers: { "User-Agent": "Smart/1.0" } });
          if (sr.ok) {
            const json = await sr.json() as any;
            const items = json.Results || json.RelatedTopics || [];
            result = items.slice(0, 5).map((r: any) => `${r.Text || r.Result || ""} — ${r.FirstURL || ""}`).join("\n") || "No results";
          } else { result = `Search failed: ${sr.status}`; }
        } catch { result = "Web search unavailable"; }
        break;
      }
      case "smart_market": {
        try {
          const ml = await db.select().from(marketListings).where(eq(marketListings.status, "approved")).limit(10);
          result = ml.map(i => `- ${i.title}: ${i.description || ""} (${i.type === "url" ? "外部链接" : "Smart 工具"})`).join("\n") || "暂无工具";
        } catch { result = "Market unavailable"; }
        break;
      }
      case "load_skill": {
        const skillContent = await loadSkillContent(args.name);
        result = skillContent || `Skill "${args.name}" not found or not installed`;
        break;
      }
      default: {
        if (mcpMap.get(name)) result = `MCP tool ${name} executed`;
        else result = `Unknown tool: ${name}`;
      }
    }
  } catch (err) { result = `Tool error: ${String(err)}`; }

  // Save step asynchronously
  edgeCtx.runInBackground((async () => {
    const existing = await db.select().from(executionSteps).where(eq(executionSteps.toolId, ec.toolId));
    let fileMetadata = null;
    if ((name === "write_file" || name === "edit_file") && args.path) {
      fileMetadata = JSON.stringify([{ path: args.path, language: args.path.split(".").pop() || "text" }]);
    }
    await db.insert(executionSteps).values({
      toolId: ec.toolId, stepOrder: existing.length + 1, type: name,
      title: `${name}: ${argsStr.slice(0, 80)}`, status: "completed",
      detail: result.slice(0, 200), terminalOutput: result.slice(0, 500),
      metadata: fileMetadata,
      startedAt: new Date().toISOString(), completedAt: new Date().toISOString(),
    });
  })());

  return result;
}
