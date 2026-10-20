export interface PlatformTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

const FRESH_SKEW_MS = 60_000;

/** sqlite `YYYY-MM-DD HH:MM:SS` 按 UTC 读，避免本地时区把未过期的 access 判成过期。 */
export function parseStampMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const iso = /T/.test(value) ? value : `${value.replace(" ", "T")}Z`;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

export function accessTokenFresh(expiresAt: string | null | undefined, now = Date.now()): boolean {
  const t = parseStampMs(expiresAt);
  return t != null && t - now > FRESH_SKEW_MS;
}

/** 优先看 JWT exp；平台 expires_in=0 时库里的时间戳不可信。 */
export function isAccessStillGood(
  accessToken: string | null | undefined,
  expiresAt: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!accessToken) return false;
  const jwtExp = readJwtExpMs(accessToken);
  if (jwtExp) return jwtExp - now > FRESH_SKEW_MS;
  return accessTokenFresh(expiresAt, now);
}

export function expiresAtFromSeconds(expiresIn: number, now = Date.now()): string {
  const sec = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600;
  return new Date(now + sec * 1000).toISOString();
}

/** 平台有时给 expires_in=0，真正过期时间在 JWT exp 上。 */
export function readJwtExpMs(accessToken: string): number | null {
  try {
    const part = accessToken.split(".")[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const pad = "=".repeat((4 - (b64.length % 4)) % 4);
    const json = JSON.parse(atob(b64 + pad)) as { exp?: number };
    const exp = Number(json.exp);
    return Number.isFinite(exp) && exp > 0 ? exp * 1000 : null;
  } catch {
    return null;
  }
}

export function expiresAtFromToken(accessToken: string, expiresIn: number, now = Date.now()): string {
  if (Number.isFinite(expiresIn) && expiresIn > 0) return expiresAtFromSeconds(expiresIn, now);
  const jwtExp = readJwtExpMs(accessToken);
  if (jwtExp) return new Date(jwtExp).toISOString();
  return expiresAtFromSeconds(300, now);
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
    expiresAt: expiresAtFromToken(accessToken, Number(data.expires_in), now),
  };
}

/** 去重后的 refresh 候选：库、密钥、本机 CLI，避免空值和重复。 */
export function collectAuthSeeds(...values: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const seed = (value || "").trim();
    if (!seed || seen.has(seed)) continue;
    seen.add(seed);
    out.push(seed);
  }
  return out;
}

/** Worker 里 `instanceof Error` 可能碰到跨 isolate 对象，只读 message。 */
export function errorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string") return msg;
  }
  try {
    return String(err || "");
  } catch {
    return "";
  }
}

function aliyunUserMessage(msg: string): string | null {
  const m = msg.match(/Aliyun DNS error:\s*([A-Za-z0-9._-]+)\s*-\s*(.+)$/i);
  if (!m) return /DNS record already exists/i.test(msg) ? "这个域名的解析记录已经存在，请换一个前缀。" : null;
  const code = m[1];
  const detail = m[2].trim();
  if (code === "DomainRecordDuplicate" || /already exists/i.test(detail)) {
    return "这个域名的解析记录已经存在，请换一个前缀。";
  }
  return detail || null;
}

export function explainPlatformAuthError(err: unknown): string {
  const msg = errorMessage(err);
  if (/未配置平台域名凭证/.test(msg)) {
    return "未找到平台登录凭证。本地请先运行 edgespark login，再重试部署。";
  }
  if (/invalid or expired|invalid_grant|平台登录续期失败/i.test(msg)) {
    return "平台登录已过期，请重新运行 edgespark login 后再部署。";
  }
  if (/Aliyun credentials not configured/i.test(msg)) {
    return "未配置阿里云 DNS 密钥，无法写入域名解析。";
  }
  return aliyunUserMessage(msg) || msg || "域名签发失败";
}
