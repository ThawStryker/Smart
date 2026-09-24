/** 同名则 教研 (02)、教研 (03)… */
export function nextUniqueAgentName(existing: string[], base: string): string {
  const names = new Set(existing);
  if (!names.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base} (${String(i).padStart(2, "0")})`;
    if (!names.has(candidate)) return candidate;
  }
  return `${base} (${Date.now()})`;
}

function sortedNames(agentNames: string[]): string[] {
  return [...new Set(agentNames)].sort((a, b) => b.length - a.length);
}

/** 从消息里解析 @Agent，优先匹配最长全名（支持空格，如 教研 (02)） */
export function extractMention(text: string, agentNames: string[]): string | null {
  const at = text.indexOf("@");
  if (at < 0) return null;
  const rest = text.slice(at + 1);
  for (const name of sortedNames(agentNames)) {
    if (rest === name) return name;
    if (rest.startsWith(name) && (rest.length === name.length || /[\s,，。！？;；]/.test(rest[name.length]))) {
      return name;
    }
  }
  return null;
}

export function stripMentions(text: string, agentNames: string[]): string {
  let out = text;
  for (const name of sortedNames(agentNames)) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`@${escaped}(?=$|[\\s,，。！？;；])`, "g"), "");
  }
  return out.replace(/\s+/g, " ").trim() || text.trim();
}
