import { getPlatformAccessToken } from "./platform-auth";
export { toAliyunRR } from "./tool-host";

const API_BASE = "https://api.edgespark.dev";
const PROJECT_ID = "e7f75fcc-cc9f-42f3-b87b-7c542d88f1e2";

export interface PlatformDnsRecord {
  type: string;
  name: string;
  value: string;
}

async function platformPost(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await getPlatformAccessToken()}`,
    },
    body: JSON.stringify({ project_id: PROJECT_ID, ...body }),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* 非 JSON */ }
  if (!res.ok) {
    const msg = (json as { error?: string; message?: string }).error
      || (json as { message?: string }).message
      || text.slice(0, 200)
      || res.statusText;
    throw new Error(msg);
  }
  return json;
}

async function platformGet(path: string, query: Record<string, string>): Promise<Record<string, unknown>> {
  const q = new URLSearchParams({ project_id: PROJECT_ID, ...query });
  const res = await fetch(`${API_BASE}${path}?${q}`, {
    headers: { Authorization: `Bearer ${await getPlatformAccessToken()}` },
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* 非 JSON */ }
  if (!res.ok) throw new Error((json as { message?: string }).message || text.slice(0, 200) || res.statusText);
  return json;
}

function domainPayload(json: Record<string, unknown>): Record<string, unknown> {
  const data = (json.data || json) as Record<string, unknown>;
  return (data.domain || data) as Record<string, unknown>;
}

function readRecords(payload: Record<string, unknown>): PlatformDnsRecord[] {
  const raw = payload.records;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => {
      const rec = r as Record<string, unknown>;
      return {
        type: String(rec.type || "").toUpperCase(),
        name: String(rec.name || ""),
        value: String(rec.value || ""),
      };
    })
    .filter((r) => r.type && r.name && r.value);
}

export async function platformAddDomain(hostname: string): Promise<{ status: string; records: PlatformDnsRecord[] }> {
  try {
    const json = await platformPost("/api/v1/project/domain/add", { hostname });
    const d = domainPayload(json);
    return { status: String(d.status || "pending"), records: readRecords(d) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/exist|already|conflict|409/i.test(msg)) throw err;
    return platformDomainStatus(hostname);
  }
}

export async function platformDomainStatus(hostname: string): Promise<{ status: string; records: PlatformDnsRecord[] }> {
  const json = await platformGet("/api/v1/project/domain/status", { hostname });
  const d = domainPayload(json);
  return { status: String(d.status || ""), records: readRecords(d) };
}

export async function platformVerifyDomain(hostname: string): Promise<{ status: string }> {
  const json = await platformPost("/api/v1/project/domain/verify", { hostname });
  const d = domainPayload(json);
  return { status: String(d.status || "") };
}

export async function platformRemoveDomain(hostname: string): Promise<void> {
  try {
    await platformPost("/api/v1/project/domain/remove", { hostname });
  } catch {
    /* 平台侧可能已删 */
  }
}
