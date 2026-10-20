import { getPlatformAccessToken } from "./platform-auth";
import { errorMessage } from "./platform-token";

const API_BASE = "https://api.edgespark.dev";
const PROJECT_ID = "e7f75fcc-cc9f-42f3-b87b-7c542d88f1e2";

export interface PlatformDnsRecord {
  type: string;
  name: string;
  value: string;
}

function readError(json: Record<string, unknown>, text: string, statusText: string): string {
  return (json as { error?: string; message?: string }).error
    || (json as { message?: string }).message
    || text.slice(0, 200)
    || statusText;
}

async function platformFetch(url: string, init: { method?: string; body?: string }): Promise<Record<string, unknown>> {
  let lastErr = "平台请求失败";
  for (const forceRefresh of [false, true]) {
    const res = await fetch(url, {
      method: init.method || "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await getPlatformAccessToken({ forceRefresh })}`,
      },
      body: init.body,
    });
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* 非 JSON */ }
    if (res.ok) return json;
    lastErr = readError(json, text, res.statusText);
    if (res.status !== 401 || forceRefresh) throw new Error(lastErr);
  }
  throw new Error(lastErr);
}

async function platformPost(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  return platformFetch(`${API_BASE}${path}`, {
    method: "POST",
    body: JSON.stringify({ project_id: PROJECT_ID, ...body }),
  });
}

async function platformGet(path: string, query: Record<string, string>): Promise<Record<string, unknown>> {
  const q = new URLSearchParams({ project_id: PROJECT_ID, ...query });
  return platformFetch(`${API_BASE}${path}?${q}`, {});
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
    const msg = errorMessage(err);
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
