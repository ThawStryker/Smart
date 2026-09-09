import type { LogEvent, SavedState, Session } from "../types";

const CHAR_LIMIT = 80_000;
const KEEP_RECENT_TOOLS = 6;
const TRUNCATE_TO = 400;

export function emptySession(): Session {
  return {
    events: [],
    observed: new Set(),
    loadedSkills: {},
    waitingForUser: false,
  };
}

export function createSession(saved?: SavedState | Record<string, unknown> | null): Session {
  if (!saved || !Array.isArray((saved as SavedState).events)) {
    return emptySession();
  }
  const s = saved as SavedState;
  return {
    events: s.events,
    observed: new Set(s.observed || []),
    loadedSkills: s.loadedSkills || {},
    waitingForUser: !!s.waitingForUser,
  };
}

export function toSavedState(session: Session): SavedState {
  return {
    events: session.events,
    observed: [...session.observed],
    loadedSkills: session.loadedSkills,
    waitingForUser: session.waitingForUser,
  };
}

export function markObserved(session: Session, displayPath: string): void {
  session.observed.add(displayPath);
}

export function isObserved(session: Session, displayPath: string): boolean {
  return session.observed.has(displayPath);
}

/** 旧工具结果过长时截断，保留最近几次完整结果 */
export function compactIfNeeded(session: Session): void {
  const toolIdxs: number[] = [];
  let total = 0;
  for (let i = 0; i < session.events.length; i++) {
    const e = session.events[i];
    if (e.type === "tool") {
      toolIdxs.push(i);
      total += e.content.length;
    }
  }
  if (total < CHAR_LIMIT) return;

  const keep = new Set(toolIdxs.slice(-KEEP_RECENT_TOOLS));
  for (let i = 0; i < session.events.length; i++) {
    const e = session.events[i];
    if (e.type === "tool" && !keep.has(i) && e.content.length > TRUNCATE_TO) {
      e.content = e.content.slice(0, TRUNCATE_TO) + "\n[truncated]";
    }
  }
}

/** 从日志投影成 LLM messages（skill 正文走 system prompt，不进对话） */
export function deriveMessages(session: Session): Array<Record<string, unknown>> {
  const messages: Array<Record<string, unknown>> = [];
  for (const e of session.events) {
    if (e.type === "user") {
      messages.push({ role: "user", content: e.text });
    } else if (e.type === "assistant") {
      const msg: Record<string, unknown> = { role: "assistant", content: e.text || "" };
      if (e.toolCalls && e.toolCalls.length > 0) {
        msg.tool_calls = e.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: tc.args },
        }));
      }
      messages.push(msg);
    } else if (e.type === "tool") {
      messages.push({ role: "tool", tool_call_id: e.id, content: e.content });
    }
  }
  return messages;
}
