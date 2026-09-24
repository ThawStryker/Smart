export interface PlatformTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

const FRESH_SKEW_MS = 60_000;

export function accessTokenFresh(expiresAt: string | null | undefined, now = Date.now()): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  return Number.isFinite(t) && t - now > FRESH_SKEW_MS;
}

export function expiresAtFromSeconds(expiresIn: number, now = Date.now()): string {
  const sec = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600;
  return new Date(now + sec * 1000).toISOString();
}

export function parseRefreshJson(json: unknown, now = Date.now()): PlatformTokens {
  const root = json && typeof json === "object" ? json as Record<string, unknown> : {};
  const data = root.data && typeof root.data === "object" ? root.data as Record<string, unknown> : root;
  const accessToken = String(data.access_token || "");
  const refreshToken = String(data.refresh_token || "");
  if (!accessToken || !refreshToken) throw new Error("平台登录续期失败");
  return {
    accessToken,
    refreshToken,
    expiresAt: expiresAtFromSeconds(Number(data.expires_in), now),
  };
}
