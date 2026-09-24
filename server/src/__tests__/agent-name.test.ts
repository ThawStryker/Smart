import { describe, it, expect } from "vitest";
import { extractMention, nextUniqueAgentName, stripMentions } from "../lib/agent-name";
import { AGENT_AVATARS, hashNameAvatar, pickRandomAvatar } from "../lib/agent-avatar";

describe("nextUniqueAgentName", () => {
  it("keeps the base name when unused", () => {
    expect(nextUniqueAgentName([], "教研")).toBe("教研");
  });

  it("adds (02) then (03)", () => {
    expect(nextUniqueAgentName(["教研"], "教研")).toBe("教研 (02)");
    expect(nextUniqueAgentName(["教研", "教研 (02)"], "教研")).toBe("教研 (03)");
  });
});

describe("extractMention", () => {
  it("matches the longest name with spaces", () => {
    expect(extractMention("@教研 (02) 你好", ["教研", "教研 (02)"])).toBe("教研 (02)");
    expect(extractMention("@教研 你好", ["教研", "教研 (02)"])).toBe("教研");
  });

  it("returns null when no known agent", () => {
    expect(extractMention("你好", ["教研"])).toBeNull();
    expect(extractMention("@别人", ["教研"])).toBeNull();
  });
});

describe("stripMentions", () => {
  it("removes a spaced agent mention", () => {
    expect(stripMentions("@教研 (02) 你好", ["教研 (02)"])).toBe("你好");
  });
});

describe("agent avatar", () => {
  it("hash is stable for the same name", () => {
    expect(hashNameAvatar("教研")).toBe(hashNameAvatar("教研"));
    expect(AGENT_AVATARS).toContain(hashNameAvatar("教研"));
  });

  it("rename would change hash, so avatar must be stored separately", () => {
    expect(hashNameAvatar("教研")).not.toBe(hashNameAvatar("通用助手"));
  });

  it("picks from the catalog", () => {
    expect(AGENT_AVATARS).toContain(pickRandomAvatar());
  });
});
