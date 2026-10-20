import type { AliyunDnsRecord } from "./aliyun-dns";
import { TOOL_ZONE, toolDomain } from "./tool-host";

export type DomainAvailability = "usable" | "deploying" | "dns_only" | "unavailable";

const DEPLOYING = new Set(["pending", "dns_ready", "verifying"]);
export const IN_FLIGHT_DOMAIN = ["pending", "dns_ready", "verifying"] as const;
const STALE_MS = 15 * 60 * 1000;

/** 中途关掉弹窗留下的 pending，超过 15 分钟当失败，允许重新部署。 */
export function isStaleDomain(createdAt: string | null | undefined, now = Date.now(), maxAge = STALE_MS): boolean {
  if (!createdAt) return false;
  const iso = /T/.test(createdAt) ? createdAt : `${createdAt.replace(" ", "T")}Z`;
  const t = Date.parse(iso);
  return Number.isFinite(t) && now - t > maxAge;
}

/** 把阿里云 RR 归到一级子域：_verify.music → music */
export function subdomainKey(rr: string): string {
  const n = rr.replace(/\.$/, "").toLowerCase();
  if (!n || n === "@") return "@";
  if (n === "*") return "*";
  const parts = n.split(".").filter(Boolean);
  return parts[parts.length - 1] || n;
}

export function isProtectedSubdomain(sub: string): boolean {
  return sub === "@" || sub === "*";
}

/** 管理列表只展示工具子域，主站和校验主机名不出现 */
export function shouldListSubdomain(sub: string): boolean {
  const s = sub.replace(/\.$/, "").toLowerCase();
  if (!s || s === "@" || s === "*" || s === TOOL_ZONE) return false;
  if (s.startsWith("_")) return false;
  return true;
}

export function isInfraRecord(rr: string): boolean {
  const n = rr.replace(/\.$/, "").toLowerCase();
  return !n || n === "@" || n === "*" || n.startsWith("_");
}

export function hostnameOf(sub: string): string {
  if (sub === "@") return TOOL_ZONE;
  if (sub === "*") return `*.${TOOL_ZONE}`;
  return toolDomain(sub);
}

export function recordsForSubdomain(records: AliyunDnsRecord[], sub: string): AliyunDnsRecord[] {
  return records.filter((r) => subdomainKey(r.rr) === sub);
}

export function domainAvailability(input: {
  aliyunEnabled: boolean;
  domainStatus: string | null;
}): DomainAvailability {
  if (!input.aliyunEnabled) return "unavailable";
  if (input.domainStatus === "active") return "usable";
  if (input.domainStatus && DEPLOYING.has(input.domainStatus)) return "deploying";
  if (input.domainStatus === "failed") return "unavailable";
  if (!input.domainStatus) return "dns_only";
  return "unavailable";
}

export function projectOnlineLabel(availability: DomainAvailability, published: boolean): string {
  return listingLabel(availability, published) || "无项目";
}

/** 这个域名现在能不能打开 */
export function siteLabel(availability: DomainAvailability): string {
  if (availability === "usable") return "已上线";
  if (availability === "deploying") return "部署中";
  if (availability === "dns_only") return "残留解析";
  return "异常";
}

/** 有绑定项目才显示市场上架；残留 DNS 不再挂「未上线」 */
export function listingLabel(availability: DomainAvailability, published: boolean): string | null {
  if (availability !== "usable" && availability !== "deploying") return null;
  return published ? "已上架" : "未上架";
}
