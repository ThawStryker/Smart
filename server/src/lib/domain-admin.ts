import type { AliyunDnsRecord } from "./aliyun-dns";
import { TOOL_ZONE, toolDomain } from "./tool-host";

export type DomainAvailability = "usable" | "deploying" | "dns_only" | "unavailable";

const DEPLOYING = new Set(["pending", "dns_ready", "verifying"]);

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
  if (published) return "已发布";
  if (availability === "usable" || availability === "deploying") return "未发布";
  return "未上线";
}
