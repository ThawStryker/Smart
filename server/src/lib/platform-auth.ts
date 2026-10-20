import { db, secret } from "edgespark";
import { eq } from "drizzle-orm";
import { platformAuth } from "@defs";
import { readCliCredentials, writeCliCredentials } from "./platform-cli-auth";
import {
  collectAuthSeeds,
  errorMessage,
  isAccessStillGood,
  parseRefreshJson,
  type PlatformTokens,
} from "./platform-token";

const API_BASE = "https://api.edgespark.dev";
const AUTH_ROW_ID = 1;

export interface PlatformAuthRow {
  refreshToken: string;
  accessToken: string | null;
  expiresAt: string | null;
}

export interface PlatformAuthStore {
  loadRow(): Promise<PlatformAuthRow | null>;
  saveRow(tokens: PlatformTokens): Promise<void>;
  secretRefresh(): string | null;
  readCli(): Promise<{ accessToken: string; refreshToken: string; expiresAt: string } | null>;
  writeCli(tokens: PlatformTokens): Promise<void>;
  refresh(refreshToken: string): Promise<PlatformTokens>;
}

export interface ResolvePlatformAccessOptions {
  forceRefresh?: boolean;
}

async function loadRow(): Promise<PlatformAuthRow | null> {
  const [row] = await db.select().from(platformAuth).where(eq(platformAuth.id, AUTH_ROW_ID)).limit(1);
  if (!row?.refreshToken) return null;
  return {
    refreshToken: row.refreshToken,
    accessToken: row.accessToken ?? null,
    expiresAt: row.expiresAt ?? null,
  };
}

async function saveRow(tokens: PlatformTokens): Promise<void> {
  const now = new Date().toISOString();
  const [existing] = await db.select({ id: platformAuth.id }).from(platformAuth).where(eq(platformAuth.id, AUTH_ROW_ID)).limit(1);
  if (existing) {
    await db.update(platformAuth).set({
      refreshToken: tokens.refreshToken,
      accessToken: tokens.accessToken,
      expiresAt: tokens.expiresAt,
      updatedAt: now,
    }).where(eq(platformAuth.id, AUTH_ROW_ID));
    return;
  }
  await db.insert(platformAuth).values({
    id: AUTH_ROW_ID,
    refreshToken: tokens.refreshToken,
    accessToken: tokens.accessToken,
    expiresAt: tokens.expiresAt,
    updatedAt: now,
  });
}

async function refreshWith(refreshToken: string): Promise<PlatformTokens> {
  const res = await fetch(`${API_BASE}/api/v1/auth/token/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const text = await res.text();
  let json: unknown = {};
  try { json = JSON.parse(text); } catch { /* 非 JSON */ }
  if (!res.ok) {
    const msg = (json as { message?: string; error?: string }).message
      || (json as { error?: string }).error
      || text.slice(0, 200)
      || res.statusText;
    throw new Error(msg);
  }
  return parseRefreshJson(json);
}

function readSecretRefresh(): string | null {
  try {
    return secret.get("EDGESPARK_PLATFORM_TOKEN") || null;
  } catch {
    return null;
  }
}

const liveStore: PlatformAuthStore = {
  loadRow,
  saveRow,
  secretRefresh: readSecretRefresh,
  readCli: readCliCredentials,
  writeCli: writeCliCredentials,
  refresh: refreshWith,
};

/** 库 / 密钥 / 本机 CLI 里任一张还有效的 access 直接用，避免无谓轮换 refresh。 */
export async function resolvePlatformAccessToken(
  store: PlatformAuthStore,
  options: ResolvePlatformAccessOptions = {},
): Promise<string> {
  const row = await store.loadRow();
  if (!options.forceRefresh && isAccessStillGood(row?.accessToken, row?.expiresAt)) return row!.accessToken!;

  const cli = await store.readCli();
  if (!options.forceRefresh && isAccessStillGood(cli?.accessToken, cli?.expiresAt)) {
    await store.saveRow({
      accessToken: cli.accessToken,
      refreshToken: cli.refreshToken,
      expiresAt: cli.expiresAt,
    });
    return cli.accessToken;
  }

  const seeds = collectAuthSeeds(row?.refreshToken, store.secretRefresh(), cli?.refreshToken);
  if (seeds.length === 0) throw new Error("未配置平台域名凭证");

  let lastErr: unknown = new Error("未配置平台域名凭证");
  const tried = new Set<string>();
  const queue = [...seeds];
  while (queue.length > 0) {
    const seed = queue.shift()!;
    if (tried.has(seed)) continue;
    tried.add(seed);
    try {
      const tokens = await store.refresh(seed);
      await store.saveRow(tokens);
      await store.writeCli(tokens);
      return tokens.accessToken;
    } catch (err) {
      lastErr = err;
      // 并发续期时，别人可能已经写回新 refresh
      const latest = await store.loadRow();
      if (isAccessStillGood(latest?.accessToken, latest?.expiresAt)) return latest!.accessToken!;
      if (latest?.refreshToken && !tried.has(latest.refreshToken)) queue.push(latest.refreshToken);
    }
  }
  throw new Error(errorMessage(lastErr) || "未配置平台域名凭证");
}

let inflight: Promise<string> | null = null;

/** 用 refresh 换 access；新 refresh 写回 D1（本地同时写回 CLI），之后不用再贴。 */
export async function getPlatformAccessToken(options: ResolvePlatformAccessOptions = {}): Promise<string> {
  if (inflight) {
    if (!options.forceRefresh) return inflight;
    try { await inflight; } catch { /* 上一次失败也要强制再刷 */ }
  }
  const run = resolvePlatformAccessToken(liveStore, options);
  inflight = run;
  try {
    return await run;
  } finally {
    if (inflight === run) inflight = null;
  }
}

/** 打开控制台时顺手续期，避免两周不用 refresh 就过期。失败不影响当前页面。 */
export function keepPlatformAuthWarm(): Promise<string | null> {
  return getPlatformAccessToken().catch(() => null);
}
