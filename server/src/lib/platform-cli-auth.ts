/** 本机 `edgespark login` 写在 ~/.edgespark/credentials.json。Worker 本地开发时可以借用，生产环境没有这个文件。 */

import type { PlatformTokens } from "./platform-token";

export interface CliCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

export function cliCredentialsPath(home = defaultHome()): string | null {
  if (!home) return null;
  return `${home.replace(/\/$/, "")}/.edgespark/credentials.json`;
}

function defaultHome(): string | null {
  try {
    const env = typeof process !== "undefined" ? process.env : undefined;
    return env?.HOME || env?.USERPROFILE || null;
  } catch {
    return null;
  }
}

export function parseCliCredentials(raw: string): CliCredentials | null {
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const accessToken = String(data.access_token || "");
    const refreshToken = String(data.refresh_token || "");
    const expiresAt = String(data.expires_at || "");
    if (!accessToken && !refreshToken) return null;
    return { accessToken, refreshToken, expiresAt };
  } catch {
    return null;
  }
}

export function mergeCliCredentials(raw: string, tokens: PlatformTokens): string {
  let data: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") data = parsed as Record<string, unknown>;
  } catch {
    data = {};
  }
  data.access_token = tokens.accessToken;
  data.refresh_token = tokens.refreshToken;
  data.expires_at = tokens.expiresAt;
  return `${JSON.stringify(data, null, 2)}\n`;
}

export async function readCliCredentials(): Promise<CliCredentials | null> {
  const path = cliCredentialsPath();
  if (!path) return null;
  try {
    const fs = await import("node:fs");
    return parseCliCredentials(fs.readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/** 续期成功后把新 refresh 写回 CLI，避免本机 `edgespark` 命令和 Worker 抢同一颗令牌。 */
export async function writeCliCredentials(tokens: PlatformTokens): Promise<void> {
  const path = cliCredentialsPath();
  if (!path) return;
  try {
    const fs = await import("node:fs");
    const raw = fs.readFileSync(path, "utf8");
    fs.writeFileSync(path, mergeCliCredentials(raw, tokens));
  } catch {
    /* 生产 Worker 没有这个文件，忽略 */
  }
}
