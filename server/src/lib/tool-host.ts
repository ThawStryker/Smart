export const TOOL_ZONE = "torresx.cn";

/** 从 Host 解析工具子域。非 *.torresx.cn 或嵌套子域返回 null。 */
export function parseToolHost(host: string | undefined | null): string | null {
  if (!host) return null;
  const h = host.split(":")[0]!.toLowerCase();
  const suffix = `.${TOOL_ZONE}`;
  if (!h.endsWith(suffix)) return null;
  const sub = h.slice(0, -suffix.length);
  if (!sub || sub.includes(".")) return null;
  if (sub.length < 2 || /[^a-z0-9-]/.test(sub)) return null;
  return sub;
}

export function toolDomain(subdomain: string): string {
  return `${subdomain}.${TOOL_ZONE}`;
}

export function publicToolUrl(subdomain: string): string {
  return `https://${subdomain}.${TOOL_ZONE}`;
}

/** 平台返回的 FQDN 转成阿里云 RR */
export function toAliyunRR(name: string): string {
  const n = name.replace(/\.$/, "").toLowerCase();
  const zone = `.${TOOL_ZONE}`;
  if (n === TOOL_ZONE) return "@";
  if (n.endsWith(zone)) return n.slice(0, -zone.length);
  return n;
}

export function subdomainFromDomain(domain: string): string {
  return domain.replace(new RegExp(`\\.${TOOL_ZONE.replace(".", "\\.")}$`), "");
}

/** 工具站点上的页面路径，去掉查询。/api 不走这里。 */
export function toolFilePath(pathname: string): string {
  let filePath = decodeURIComponent(pathname || "/").replace(/^\/+/, "");
  if (!filePath || filePath.endsWith("/")) filePath += "index.html";
  if (filePath.includes("..")) return "index.html";
  return filePath;
}
