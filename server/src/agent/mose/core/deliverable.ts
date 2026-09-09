/** 把课稿正文和给用户看的自检说明拆开。 */

const META_HEADING = /^#{0,3}\s*(教学目标覆盖说明|目标覆盖说明|覆盖说明|质量自检|自我检查)\s*$/gm;

export function looksLikeMetaNotes(s: string): boolean {
  const t = (s || "").trim();
  if (!t) return false;
  const head = t.slice(0, 160);
  if (/教学目标覆盖说明|目标覆盖说明|质量自检|自我检查/.test(head)) return true;
  if (/^#{0,3}\s*覆盖说明\b/.test(head)) return true;
  if (t.length < 1200 && /教学目标覆盖说明/.test(t) && /承载于/.test(t)) return true;
  return false;
}

export function splitMetaNotes(content: string): { document: string; notes: string } {
  const text = (content || "").replace(/\r\n/g, "\n");
  let cut = -1;
  const re = new RegExp(META_HEADING.source, "gm");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    cut = m.index;
  }
  if (cut < 0) {
    const bare = text.search(/^\s*教学目标覆盖说明\s*$/m);
    if (bare >= 0) cut = bare;
  }
  if (cut <= 0) return { document: text, notes: "" };
  const document = text.slice(0, cut).trimEnd();
  const notes = text.slice(cut).trim();
  if (!document) return { document: text, notes: "" };
  return { document, notes };
}
