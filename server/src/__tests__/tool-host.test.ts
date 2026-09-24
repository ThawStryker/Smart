import { describe, it, expect } from "vitest";
import { parseToolHost, publicToolUrl, toAliyunRR, toolDomain, toolFilePath } from "../lib/tool-host";

describe("parseToolHost", () => {
  it("reads a tool subdomain", () => {
    expect(parseToolHost("todo.torresx.cn")).toBe("todo");
    expect(parseToolHost("TODO.torresx.cn:443")).toBe("todo");
  });

  it("rejects the app host and nested names", () => {
    expect(parseToolHost("leading-stallion-5780.edgespark.app")).toBeNull();
    expect(parseToolHost("foo.bar.torresx.cn")).toBeNull();
    expect(parseToolHost("t.torresx.cn")).toBeNull();
    expect(parseToolHost("localhost")).toBeNull();
  });
});

describe("toolFilePath", () => {
  it("defaults slash to index.html", () => {
    expect(toolFilePath("/")).toBe("index.html");
    expect(toolFilePath("/app.js")).toBe("app.js");
  });
});

describe("toolDomain", () => {
  it("joins zone", () => {
    expect(toolDomain("todo")).toBe("todo.torresx.cn");
  });
});

describe("publicToolUrl", () => {
  it("uses an independent subdomain", () => {
    expect(publicToolUrl("todo")).toBe("https://todo.torresx.cn");
  });
});

describe("toAliyunRR", () => {
  it("strips the zone", () => {
    expect(toAliyunRR("todo.torresx.cn")).toBe("todo");
    expect(toAliyunRR("_cf-challenge.todo.torresx.cn")).toBe("_cf-challenge.todo");
    expect(toAliyunRR("torresx.cn")).toBe("@");
  });
});
