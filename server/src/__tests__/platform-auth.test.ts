import { describe, it, expect } from "vitest";
import { accessTokenFresh, expiresAtFromSeconds, parseRefreshJson } from "../lib/platform-token";

describe("accessTokenFresh", () => {
  it("rejects missing or expired stamps", () => {
    expect(accessTokenFresh(null)).toBe(false);
    expect(accessTokenFresh("not-a-date")).toBe(false);
    expect(accessTokenFresh(new Date(Date.now() + 10_000).toISOString())).toBe(false);
  });

  it("accepts tokens with more than a minute left", () => {
    expect(accessTokenFresh(new Date(Date.now() + 120_000).toISOString())).toBe(true);
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
});
