import { db, secret } from "edgespark";
import { eq } from "drizzle-orm";
import { platformAuth } from "@defs";
import { accessTokenFresh, parseRefreshJson, type PlatformTokens } from "./platform-token";

const API_BASE = "https://api.edgespark.dev";
const AUTH_ROW_ID = 1;

async function loadRow(): Promise<{
  refreshToken: string;
  accessToken: string | null;
  expiresAt: string | null;
} | null> {
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

/** 用 refresh 换 access；新 refresh 写回 D1，之后不用再贴。 */
export async function getPlatformAccessToken(): Promise<string> {
  const row = await loadRow();
  if (row?.accessToken && accessTokenFresh(row.expiresAt)) return row.accessToken;

  const seed = row?.refreshToken || secret.get("EDGESPARK_PLATFORM_TOKEN");
  if (!seed) throw new Error("未配置平台域名凭证");

  try {
    const tokens = await refreshWith(seed);
    await saveRow(tokens);
    return tokens.accessToken;
  } catch (err) {
    // 库里的 refresh 作废时，退回密钥页那一次种子再试
    const fallback = secret.get("EDGESPARK_PLATFORM_TOKEN");
    if (fallback && fallback !== seed) {
      const tokens = await refreshWith(fallback);
      await saveRow(tokens);
      return tokens.accessToken;
    }
    throw err;
  }
}
