import { describe, it, expect } from "vitest";
import { resolvePlatformAccessToken, type PlatformAuthStore } from "../lib/platform-auth";
import { mergeCliCredentials, parseCliCredentials } from "../lib/platform-cli-auth";
import {
  accessTokenFresh,
  collectAuthSeeds,
  explainPlatformAuthError,
  expiresAtFromSeconds,
  expiresAtFromToken,
  isAccessStillGood,
  parseRefreshJson,
} from "../lib/platform-token";

describe("accessTokenFresh", () => {
  it("rejects missing or expired stamps", () => {
    expect(accessTokenFresh(null)).toBe(false);
    expect(accessTokenFresh("not-a-date")).toBe(false);
    expect(accessTokenFresh(new Date(Date.now() + 10_000).toISOString())).toBe(false);
  });

  it("accepts tokens with more than a minute left", () => {
    expect(accessTokenFresh(new Date(Date.now() + 120_000).toISOString())).toBe(true);
  });

  it("treats sqlite timestamps as UTC", () => {
    const now = Date.parse("2026-10-20T07:00:00.000Z");
    expect(accessTokenFresh("2026-10-20 07:03:00", now)).toBe(true);
    expect(accessTokenFresh("2026-10-20 07:00:30", now)).toBe(false);
  });
});

describe("isAccessStillGood", () => {
  it("prefers JWT exp over a lying expiresAt", () => {
    const now = Date.parse("2026-10-20T07:00:00.000Z");
    const exp = Math.floor(now / 1000) + 30;
    const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
    const token = `hdr.${payload}.sig`;
    expect(isAccessStillGood(token, new Date(now + 3600_000).toISOString(), now)).toBe(false);
  });
});

describe("parseRefreshJson", () => {
  it("reads nested data and computes expiry", () => {
    const now = Date.parse("2026-09-24T06:00:00.000Z");
    const tokens = parseRefreshJson({
      data: { access_token: "acc", refresh_token: "ref", expires_in: 3600 },
    }, now);
    expect(tokens.accessToken).toBe("acc");
    expect(tokens.refreshToken).toBe("ref");
    expect(tokens.expiresAt).toBe(expiresAtFromSeconds(3600, now));
  });

  it("rejects an empty payload", () => {
    expect(() => parseRefreshJson({})).toThrow("平台登录续期失败");
  });

  it("reads JWT exp when expires_in is 0", () => {
    const now = Date.parse("2026-10-20T07:00:00.000Z");
    const exp = Math.floor(now / 1000) + 300;
    const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
    const token = `hdr.${payload}.sig`;
    expect(expiresAtFromToken(token, 0, now)).toBe(new Date(exp * 1000).toISOString());
    expect(parseRefreshJson({
      data: { access_token: token, refresh_token: "r", expires_in: 0 },
    }, now).expiresAt).toBe(new Date(exp * 1000).toISOString());
  });
});

describe("collectAuthSeeds", () => {
  it("drops blanks and duplicates, keeps order", () => {
    expect(collectAuthSeeds("db", "", "secret", "db", null, "cli")).toEqual(["db", "secret", "cli"]);
  });
});

describe("explainPlatformAuthError", () => {
  it("tells the user to login when no seed exists", () => {
    expect(explainPlatformAuthError(new Error("未配置平台域名凭证"))).toContain("edgespark login");
  });

  it("maps expired refresh", () => {
    expect(explainPlatformAuthError(new Error("refresh token invalid or expired"))).toContain("已过期");
  });

  it("reads message without instanceof", () => {
    expect(explainPlatformAuthError({ message: "未配置平台域名凭证" })).toContain("edgespark login");
  });

  it("turns a duplicate DNS record into a hint", () => {
    expect(explainPlatformAuthError(new Error(
      "Aliyun DNS error: DomainRecordDuplicate - The DNS record already exists.",
    ))).toBe("这个域名的解析记录已经存在，请换一个前缀。");
  });
});

describe("cli credentials json", () => {
  it("parses and writes back without dropping other fields", () => {
    const raw = JSON.stringify({ access_token: "old", refresh_token: "r1", expires_at: "t", user: { email: "a@b.c" } });
    const parsed = parseCliCredentials(raw);
    expect(parsed?.refreshToken).toBe("r1");
    const next = mergeCliCredentials(raw, {
      accessToken: "new-a",
      refreshToken: "new-r",
      expiresAt: "2026-10-20T08:00:00.000Z",
    });
    const round = JSON.parse(next) as { user: { email: string }; refresh_token: string };
    expect(round.user.email).toBe("a@b.c");
    expect(round.refresh_token).toBe("new-r");
  });
});

function memoryStore(init: {
  row?: { refreshToken: string; accessToken: string | null; expiresAt: string | null };
  secret?: string | null;
  cli?: { accessToken: string; refreshToken: string; expiresAt: string } | null;
  refresh?: (seed: string) => Promise<{ accessToken: string; refreshToken: string; expiresAt: string }>;
}): PlatformAuthStore & { writes: string[] } {
  let row = init.row ?? null;
  let cli = init.cli ?? null;
  const writes: string[] = [];
  return {
    writes,
    loadRow: async () => row,
    saveRow: async (tokens) => {
      row = { refreshToken: tokens.refreshToken, accessToken: tokens.accessToken, expiresAt: tokens.expiresAt };
    },
    secretRefresh: () => init.secret ?? null,
    readCli: async () => cli,
    writeCli: async (tokens) => {
      writes.push(tokens.refreshToken);
      cli = { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresAt: tokens.expiresAt };
    },
    refresh: init.refresh ?? (async (seed) => {
      if (seed === "dead") throw new Error("refresh token invalid or expired");
      return {
        accessToken: `acc-from-${seed}`,
        refreshToken: `next-${seed}`,
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
      };
    }),
  };
}

describe("resolvePlatformAccessToken", () => {
  it("uses a fresh D1 access token without refreshing", async () => {
    const store = memoryStore({
      row: {
        refreshToken: "r",
        accessToken: "live",
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
      },
    });
    await expect(resolvePlatformAccessToken(store)).resolves.toBe("live");
    expect(store.writes).toEqual([]);
  });

  it("falls back to CLI refresh when D1 and secret are empty", async () => {
    const store = memoryStore({
      cli: { accessToken: "expired", refreshToken: "cli-r", expiresAt: "2020-01-01T00:00:00.000Z" },
    });
    await expect(resolvePlatformAccessToken(store)).resolves.toBe("acc-from-cli-r");
    expect(store.writes).toEqual(["next-cli-r"]);
  });

  it("retries CLI after a dead D1 refresh", async () => {
    const store = memoryStore({
      row: { refreshToken: "dead", accessToken: null, expiresAt: null },
      cli: { accessToken: "", refreshToken: "cli-r", expiresAt: "" },
    });
    await expect(resolvePlatformAccessToken(store)).resolves.toBe("acc-from-cli-r");
  });

  it("throws when nothing can be used", async () => {
    const store = memoryStore({});
    await expect(resolvePlatformAccessToken(store)).rejects.toThrow("未配置平台域名凭证");
  });

  it("writes CLI after a D1 refresh even when CLI was empty", async () => {
    const store = memoryStore({
      row: { refreshToken: "r", accessToken: null, expiresAt: null },
    });
    await expect(resolvePlatformAccessToken(store)).resolves.toBe("acc-from-r");
    expect(store.writes).toEqual(["next-r"]);
  });

  it("forceRefresh skips a still-fresh access token", async () => {
    const store = memoryStore({
      row: {
        refreshToken: "r1",
        accessToken: "stale-but-cached",
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
      },
    });
    await expect(resolvePlatformAccessToken(store)).resolves.toBe("stale-but-cached");
    await expect(resolvePlatformAccessToken(store, { forceRefresh: true })).resolves.toBe("acc-from-r1");
  });
});
