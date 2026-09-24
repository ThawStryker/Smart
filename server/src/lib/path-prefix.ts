import { sql } from "drizzle-orm";
import type { AnyColumn } from "drizzle-orm";

function childPrefix(prefix: string): string {
  return prefix.endsWith("/") ? prefix : `${prefix}/`;
}

function selfPath(prefix: string): string {
  return prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
}

/** 自身或子路径。用 instr 代替 LIKE，避开 D1 中文路径 too complex */
export function pathIsSelfOrChild(column: AnyColumn, prefix: string) {
  const self = selfPath(prefix);
  const child = childPrefix(prefix);
  return sql`(${column} = ${self} OR instr(${column}, ${child}) = 1)`;
}

/** 仅子路径（不含自身），用于文件夹重命名 */
export function pathIsChild(column: AnyColumn, parent: string) {
  return sql`instr(${column}, ${childPrefix(parent)}) = 1`;
}
