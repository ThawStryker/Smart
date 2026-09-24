// Coding 服务层：项目源码 / MCP / 对话落库。循环走瘦引擎。
import { db, ctx } from "edgespark";
import { eq } from "drizzle-orm";
import { conversations } from "@defs";
import { emit } from "../stream";
import { executeTool, type ExecContext } from "../executor";
import type { ToolDef } from "../tools/builtin";
import { createSession, runEngineLoop } from "../engine";
import { callLLM } from "../engine/llm";

interface LoopParams {
  baseURL: string;
  apiPath: string;
  apiKey: string;
  modelName: string;
  selectedModel: string;
  initialMessages: Array<Record<string, unknown>>;
  activeTools: ToolDef[];
  mcpMap: Map<string, Record<string, unknown>>;
  execCtx: ExecContext;
  userId: string;
  projectId: number;
  eventQueue: Array<Record<string, unknown>>;
}

interface LoopResult {
  fullResponse: string;
  savedConvId: number | null;
}

export async function agentLoop(params: LoopParams): Promise<LoopResult> {
  const {
    baseURL, apiPath, apiKey, modelName,
    initialMessages, activeTools, mcpMap, execCtx,
    userId, projectId, eventQueue,
  } = params;

  const session = createSession();
  let fullResponse = "";
  let savedConvId: number | null = null;
  let textChunks = 0;
  let reasoning = "";

  async function persistText() {
    if (!fullResponse) return;
    if (!savedConvId) {
      const [row] = await db.insert(conversations).values({
        projectId, userId, role: "assistant", content: fullResponse,
      }).returning({ id: conversations.id });
      savedConvId = row.id;
      return;
    }
    if (textChunks % 5 === 0) {
      ctx.runInBackground(
        db.update(conversations).set({ content: fullResponse }).where(eq(conversations.id, savedConvId)),
      );
    }
  }

  const gen = runEngineLoop({
    session,
    modelConfig: { baseURL, apiPath, apiKey, modelName, maxTokens: 8192 },
    callLLM,
    host: {
      toolDefs: activeTools,
      maxRounds: 15,
      buildMessages: () => [...initialMessages, ...sessionToolTail(session)],
      executeTool: async (name, args) => {
        const result = await executeTool(name, JSON.stringify(args), execCtx, mcpMap);
        return { result };
      },
      shouldYieldModelEvent: () => true,
      afterAssistant: async function* ({ result }) {
        if (result.reasoningContent) {
          emit(eventQueue, { type: "thinking", content: result.reasoningContent });
          emit(eventQueue, { type: "thinking_complete" });
        }
        reasoning = "";
      },
      afterTool: async function* ({ name, id, exec, denied }) {
        emit(eventQueue, { type: "tool_start", toolCallId: id, name });
        emit(eventQueue, { type: "tool_exec", toolCallId: id, name });
        const output = denied || exec?.result || "";
        emit(eventQueue, { type: "tool_result", toolCallId: id, name, output: output.slice(0, 500) });
      },
    },
  });

  let step = await gen.next();
  while (!step.done) {
    const ev = step.value;
    if (ev.type === "delta" && ev.phase === "thinking") {
      reasoning += ev.text;
      emit(eventQueue, { type: "thinking", content: reasoning });
    } else if (ev.type === "delta" && ev.phase === "text" && ev.text) {
      fullResponse += ev.text;
      textChunks++;
      emit(eventQueue, { type: "text", content: ev.text });
      await persistText();
    } else if (ev.type === "error") {
      emit(eventQueue, { type: "error", content: ev.message });
    }
    step = await gen.next();
  }

  return { fullResponse: step.value.assistantText || fullResponse, savedConvId };
}

/** 本轮工具来回；历史仍在 initialMessages 里 */
function sessionToolTail(session: import("../engine/types").Session): Array<Record<string, unknown>> {
  const messages: Array<Record<string, unknown>> = [];
  for (const e of session.events) {
    if (e.type === "assistant") {
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
