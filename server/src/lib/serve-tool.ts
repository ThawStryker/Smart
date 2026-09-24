import { db, storage } from "edgespark";
import { eq } from "drizzle-orm";
import { tools, domains, buckets } from "@defs";
import { getContentType } from "./mime";
import { injectSmartIds } from "./html-inject";
import { toolDomain, toolFilePath } from "./tool-host";

/** 按已激活域名提供静态文件。域不存在返回 null，交给后续路由。 */
export async function serveDeployedTool(
  subdomain: string,
  pathname: string,
): Promise<Response | null> {
  const domain = toolDomain(subdomain);
  const [domainRow] = await db
    .select()
    .from(domains)
    .where(eq(domains.domain, domain));

  if (!domainRow || domainRow.status !== "active") return null;

  const [tool] = await db
    .select()
    .from(tools)
    .where(eq(tools.id, domainRow.toolId));
  if (!tool) return new Response(JSON.stringify({ error: "Tool not found" }), { status: 404 });

  const filePath = toolFilePath(pathname);
  const obj = await storage.from(buckets.sourceBuckets).get(`${tool.projectId}/${tool.id}/${filePath}`);
  if (!obj) return new Response(JSON.stringify({ error: "File not found" }), { status: 404 });

  const ext = filePath.split(".").pop()?.toLowerCase() || "txt";
  const body = ext === "html"
    ? injectSmartIds(obj.body, tool.projectId, tool.id)
    : obj.body;

  return new Response(body, {
    headers: { "Content-Type": getContentType(filePath) },
  });
}
