import { describe, it, expect } from "vitest";
import {
  domainAvailability,
  hostnameOf,
  isProtectedSubdomain,
  projectOnlineLabel,
  recordsForSubdomain,
  shouldListSubdomain,
  subdomainKey,
} from "../lib/domain-admin";

describe("subdomainKey", () => {
  it("keeps a tool name", () => {
    expect(subdomainKey("music")).toBe("music");
  });

  it("folds challenge records into the tool name", () => {
    expect(subdomainKey("_edgespark-verify-xx.music")).toBe("music");
  });

  it("keeps apex and wildcard", () => {
    expect(subdomainKey("@")).toBe("@");
    expect(subdomainKey("*")).toBe("*");
  });
});

describe("domainAvailability", () => {
  it("marks an active bound domain usable", () => {
    expect(domainAvailability({ aliyunEnabled: true, domainStatus: "active" })).toBe("usable");
  });

  it("marks in-flight bind as deploying", () => {
    expect(domainAvailability({ aliyunEnabled: true, domainStatus: "dns_ready" })).toBe("deploying");
  });

  it("marks orphan DNS as dns_only", () => {
    expect(domainAvailability({ aliyunEnabled: true, domainStatus: null })).toBe("dns_only");
  });

  it("marks disabled DNS unavailable", () => {
    expect(domainAvailability({ aliyunEnabled: false, domainStatus: "active" })).toBe("unavailable");
  });
});

describe("projectOnlineLabel", () => {
  it("returns 未上线 after a domain is gone", () => {
    expect(projectOnlineLabel("dns_only", false)).toBe("未上线");
    expect(projectOnlineLabel("unavailable", false)).toBe("未上线");
  });

  it("keeps 已发布 only while published", () => {
    expect(projectOnlineLabel("usable", true)).toBe("已发布");
    expect(projectOnlineLabel("usable", false)).toBe("未发布");
  });
});

describe("recordsForSubdomain", () => {
  it("collects the tool and its TXT rows", () => {
    const rows = recordsForSubdomain([
      { recordId: "1", type: "CNAME", rr: "music", value: "a", status: "ENABLE" },
      { recordId: "2", type: "TXT", rr: "_v.music", value: "t", status: "ENABLE" },
      { recordId: "3", type: "CNAME", rr: "todo", value: "a", status: "ENABLE" },
    ], "music");
    expect(rows.map((r) => r.recordId)).toEqual(["1", "2"]);
  });
});

describe("shouldListSubdomain", () => {
  it("hides apex, wildcard and verify hosts", () => {
    expect(shouldListSubdomain("@")).toBe(false);
    expect(shouldListSubdomain("torresx.cn")).toBe(false);
    expect(shouldListSubdomain("*")).toBe(false);
    expect(shouldListSubdomain("_edgespark-verify-axo4guxkzzvi")).toBe(false);
  });

  it("keeps tool subdomains", () => {
    expect(shouldListSubdomain("music")).toBe(true);
  });
});

describe("hostnameOf", () => {
  it("builds public names", () => {
    expect(hostnameOf("music")).toBe("music.torresx.cn");
    expect(hostnameOf("@")).toBe("torresx.cn");
    expect(isProtectedSubdomain("@")).toBe(true);
    expect(isProtectedSubdomain("music")).toBe(false);
  });
});
