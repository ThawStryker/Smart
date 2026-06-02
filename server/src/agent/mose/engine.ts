import { loadAgentFiles, loadSessionMessages, listAgentNames } from "./loader";
import { buildConversationSummary } from "./context";
import type { EngineInput, EngineOutput, PhaseEvent, PhaseName } from "./phases";

function normalizeNewlines(t: string): string {
  return t.replace(/\n{3,}/g, "\n\n");
}

// ── SSE 流解析辅助 ──
interface ParsedStream {
  textContent: string;
  reasoningContent: string;
  toolCalls: Array<{ id: string; name: string; args: string }>;
}

interface SSELineState {
  textContent: string;
  reasoningContent: string;
  toolCallMap: Map<number, { id: string; name: string; args: string }>;
}

interface SSELineResult {
  hasReasoning: boolean;
  reasoningText: string;
}

function parseSSELine(data: string, state: SSELineState): SSELineResult {
  try {
    const json = JSON.parse(data);
    const delta = json.choices?.[0]?.delta;
    let hasReasoning = false;
    let reasoningText = "";

    if (delta?.reasoning_content) {
      state.reasoningContent += delta.reasoning_content;
      hasReasoning = true;
      reasoningText = delta.reasoning_content;
    }

    if (delta?.content) {
      state.textContent += delta.content;
    }

    if (delta?.tool_calls) {
      for (const tc of delta.tool_calls) {
        if (tc.index != null) {
          if (tc.id) {
            state.toolCallMap.set(tc.index, {
              id: tc.id,
              name: tc.function?.name || "",
              args: tc.function?.arguments || "",
            });
          } else if (tc.function?.arguments) {
            const existing = state.toolCallMap.get(tc.index);
            if (existing) existing.args += tc.function.arguments;
          }
        }
      }
    }

    return { hasReasoning, reasoningText };
  } catch {
    return { hasReasoning: false, reasoningText: "" };
  }
}

// ── LLM 调用 + 流式解析 + phase 事件发射 ──
async function* callLLM(
  messages: Array<Record<string, unknown>>,
  tools: Array<Record<string, unknown>> | null,
  modelConfig: EngineInput["modelConfig"],
): AsyncGenerator<PhaseEvent, ParsedStream, unknown> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const body: Record<string, unknown> = {
      model: modelConfig.modelName,
      messages,
      temperature: 0.5,
      stream: true,
    };
    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = "auto";
    }

    const res = await fetch(`${modelConfig.baseURL}${modelConfig.apiPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${modelConfig.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => "(no body)");
      yield { type: "error", message: `API ${res.status} model=${modelConfig.modelName} url=${modelConfig.baseURL}${modelConfig.apiPath} body=${body.slice(0, 200)}` };
      return { textContent: "", reasoningContent: "", toolCalls: [] };
    }

    // 流式读取并实时 yield thinking delta
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const state: SSELineState = { textContent: "", reasoningContent: "", toolCallMap: new Map() };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (!data || data === "[DONE]") continue;

        const result = parseSSELine(data, state);
        if (result.hasReasoning) {
          yield { type: "delta", phase: "thinking" as PhaseName, text: result.reasoningText };
        }
      }
    }

    const toolCalls: Array<{ id: string; name: string; args: string }> = [];
    for (const [, tc] of state.toolCallMap) {
      toolCalls.push({ id: tc.id, name: tc.name, args: tc.args });
    }

    return { textContent: state.textContent, reasoningContent: state.reasoningContent, toolCalls };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === "AbortError") {
      yield { type: "error", message: "Request timeout after 30s" };
    } else {
      yield { type: "error", message: `Request error: ${err instanceof Error ? err.message : String(err)}` };
    }
    return { textContent: "", reasoningContent: "", toolCalls: [] };
  }
}

// ── 从对话历史检测已完成的步骤 ──
interface StepOutput {
  step: number;
  content: string;
  needsInfo: boolean;
}

function detectCompletedSteps(
  messages: Array<{ agentName: string | null; content: string }>,
): StepOutput[] {
  const steps: StepOutput[] = [];
  for (const msg of messages) {
    const match = msg.content?.match(/^## Step (\d+):/m);
    if (match) {
      steps.push({
        step: parseInt(match[1]),
        content: msg.content,
        needsInfo: msg.content.includes("[NEED_INFO]"),
      });
    }
  }
  return steps;
}

/** 从 Step 3 输出中解析选中的 skill 名 */
function parseSelectedSkill(step3Output: string, skills: Array<{ name: string }>): string | null {
  for (const s of skills) {
    if (step3Output.includes(s.name)) return s.name;
  }
  return null;
}

// ── 执行工具并 yield phase 事件 ──
async function* executeTools(
  toolCalls: Array<{ id: string; name: string; args: string }>,
  toolHandlers: Record<string, EngineInput["toolHandlers"][string]>,
): AsyncGenerator<PhaseEvent, Array<{ tool_call_id: string; content: string }>, unknown> {
  const results: Array<{ tool_call_id: string; content: string }> = [];

  for (const tc of toolCalls) {
    const handler = toolHandlers[tc.name];
    const phase = handler?.phase || "text";
    let parsedArgs: Record<string, unknown> = {};
    try { parsedArgs = JSON.parse(tc.args); } catch {}

    // 1. 先执行工具（write_file 创建文件+写内容）
    let result: string;
    try {
      result = await handler!.execute(parsedArgs);
    } catch (err: unknown) {
      result = `Error: ${err instanceof Error ? err.message : String(err)}`;
    }

    // 2. yield phase 事件（前端据此渲染卡片、刷新文件树、自动打开）
    const meta = handler?.meta ? handler.meta(parsedArgs) : undefined;
    yield { type: "phase", phase, meta };

    // 3. write_file 额外 yield delta 让前端流式写入编辑器
    if (phase === "write" && parsedArgs.content) {
      yield { type: "delta", phase: "write", text: parsedArgs.content as string, meta };
    }

    results.push({ tool_call_id: tc.id, content: result });
  }

  return results;
}

// ── Agent 模式：6 步流程 ──
// 每步调一次 LLM，上下文精简，按 agent 目录结构（context/ → memory/ → skills/ → 生成）
// 每步输出存为 message，供下次请求检测进度
async function* runAgent(input: EngineInput): EngineOutput {
  const { sessionId, userId, userMessage, targetAgent, modelConfig, toolHandlers, toolDefs, suppressSave, depth } = input;
  const agentName = targetAgent!;

  // 加载 agent 文件 + 对话历史
  const agentCtx = await loadAgentFiles(userId, agentName);
  const msgs = await loadSessionMessages(sessionId);

  // 检测已完成进度
  const completed = detectCompletedSteps(msgs);
  const currentStep = completed.length > 0 ? completed[completed.length - 1].step + 1 : 1;
  const lastStep = completed[completed.length - 1];
  const ctx: Record<number, string> = {};
  for (const s of completed) ctx[s.step] = s.content;

  // 全局上下文（供各步使用）
  const contextMd = agentCtx.contexts.length > 0
    ? agentCtx.contexts.join("\n\n---\n\n")
    : "(暂无背景文件)";
  const memoryMd = agentCtx.memoryMd || "(暂无记忆)";

  // ══════════════════════════════════════════════════════════════
  // Step 1: 需求分析 — 读 context，理解任务，可能问用户
  // ══════════════════════════════════════════════════════════════
  if (currentStep <= 1) {
    yield { type: "phase", phase: "thinking", meta: { label: "分析需求" } };

    const isReRun = lastStep?.step === 1 && lastStep.needsInfo;

    const prompt = `你是 ${agentName}。

## 你的角色

${agentCtx.agentsMd || "你是一个有用的助手。"}

## 背景知识

${contextMd}

## 指令

分析用户的需求。
- 如果缺少关键信息，第一行写「[NEED_INFO]」，然后列出你需要补充的问题。
- 如果信息足够，直接输出你对任务的理解摘要。`;

    const stepMsgs: Array<Record<string, unknown>> = [{ role: "system", content: prompt }];

    if (isReRun && ctx[1]) {
      stepMsgs.push({ role: "assistant", content: ctx[1] });
      stepMsgs.push({ role: "user", content: userMessage });
    } else {
      stepMsgs.push({ role: "user", content: userMessage });
    }

    const result = yield* callLLM(stepMsgs, null, modelConfig);
    const output = result.textContent || "(空)";
    const saved = `## Step 1: 需求分析\n\n${output}`;

    if (!suppressSave && input.onSaveMessage) {
      await input.onSaveMessage({ sessionId, agentName, role: "assistant", content: normalizeNewlines(saved) });
    }

    yield { type: "delta", phase: "text", text: normalizeNewlines(output) };

    if (output.includes("[NEED_INFO]")) {
      yield { type: "done" };
      return;
    }
    ctx[1] = saved;
  }

  // ══════════════════════════════════════════════════════════════
  // Step 2: 记忆加载 — 读 MEMORY.md，选相关片段
  // ══════════════════════════════════════════════════════════════
  if (currentStep <= 2) {
    yield { type: "phase", phase: "memory", meta: { label: "加载记忆" } };

    const prompt = `你是 ${agentName}。

## 当前任务

${ctx[1] || userMessage}

## 你的历史记忆

${memoryMd}

## 指令

阅读你的历史记忆，选择与当前任务最相关的部分。输出选中的记忆摘要（如果不相关，输出「无相关记忆」）。`;

    const result = yield* callLLM([{ role: "system", content: prompt }], null, modelConfig);
    const output = result.textContent || "(空)";
    const saved = `## Step 2: 记忆加载\n\n${output}`;

    if (!suppressSave && input.onSaveMessage) {
      await input.onSaveMessage({ sessionId, agentName, role: "assistant", content: normalizeNewlines(saved) });
    }
    ctx[2] = saved;
  }

  // ══════════════════════════════════════════════════════════════
  // Step 3: 技能匹配 — 看 skill 摘要，选最匹配的
  // ══════════════════════════════════════════════════════════════
  if (currentStep <= 3) {
    yield { type: "phase", phase: "skill", meta: { label: "匹配技能" } };

    const skillSummaries = agentCtx.skills.length > 0
      ? agentCtx.skills.map(s => `- ${s.name}: ${s.summary}`).join("\n")
      : "(暂无可用技能)";

    const prompt = `你是 ${agentName}。

## 当前任务

${ctx[1] || userMessage}

## 相关记忆

${ctx[2] || "(无)"}

## 可用技能

${skillSummaries}

## 指令

从可用技能中选择最匹配当前任务的技能。输出选中的技能名和理由。如果无匹配，输出「无匹配技能，直接生成」。`;

    const result = yield* callLLM([{ role: "system", content: prompt }], null, modelConfig);
    const output = result.textContent || "(空)";
    const saved = `## Step 3: 技能匹配\n\n${output}`;

    if (!suppressSave && input.onSaveMessage) {
      await input.onSaveMessage({ sessionId, agentName, role: "assistant", content: normalizeNewlines(saved) });
    }
    ctx[3] = saved;
  }

  // ══════════════════════════════════════════════════════════════
  // Step 4: 内容生成 — 按 skill 模板生成 + 调 write_file
  // ══════════════════════════════════════════════════════════════
  if (currentStep <= 4) {
    yield { type: "phase", phase: "thinking", meta: { label: "生成内容" } };

    // 找到匹配的 skill 全文
    const skillName = parseSelectedSkill(ctx[3] || "", agentCtx.skills);
    const matchedSkill = skillName
      ? agentCtx.skills.find(s => s.name === skillName)
      : null;
    const skillContent = matchedSkill?.entry
      ? `## 选中的技能：${matchedSkill.name}\n\n${matchedSkill.entry}`
      : agentCtx.skills.map(s => `## ${s.name}\n\n${s.entry}`).join("\n\n---\n\n");

    const prompt = `你是 ${agentName}。

## 任务需求

${ctx[1] || userMessage}

## 相关记忆

${ctx[2] || "(无)"}

${skillContent}

## 指令

1. 严格按照上面的技能模板（如果匹配）完成任务内容的生成。
2. 生成完整文档内容后，使用 \`write_file\` 工具保存到 workspace/ 目录下。`;

    // Step 4 有工具可用（write_file, web_search）
    const result = yield* callLLM([{ role: "system", content: prompt }], toolDefs, modelConfig);

    // 执行工具调用（write_file 等）
    if (result.toolCalls.length > 0) {
      yield* executeTools(result.toolCalls, toolHandlers);
    }

    const output = result.textContent || "(空)";
    const saved = `## Step 4: 生成内容\n\n${output}`;

    if (!suppressSave && input.onSaveMessage) {
      await input.onSaveMessage({ sessionId, agentName, role: "assistant", content: normalizeNewlines(saved) });
    }
    ctx[4] = saved;
  }

  // ══════════════════════════════════════════════════════════════
  // Step 5: 写文件兜底（如果 Step 4 没调 write_file，代码自动写）
  // ══════════════════════════════════════════════════════════════
  if (currentStep <= 5) {
    const writeHandler = toolHandlers["write_file"];
    if (writeHandler && ctx[4]) {
      const content = ctx[4].replace(/^## Step 4: 生成内容\n\n/, "");
      const fileName = `${agentName}-${Date.now()}.md`;
      yield { type: "phase", phase: "write", meta: { path: `workspace/${fileName}` } };
      await writeHandler.execute({ path: `workspace/${fileName}`, content });
    }
  }

  // ══════════════════════════════════════════════════════════════
  // Step 6: 总结回复
  // ══════════════════════════════════════════════════════════════
  if (currentStep <= 6) {
    yield { type: "phase", phase: "text", meta: { label: "总结" } };

    const prompt = `你是 ${agentName}。

## 任务需求

${userMessage}

## 生成结果

${ctx[4] || "(无生成内容)"}

## 指令

用 2-3 句话总结你做了什么、输出在哪个文件。简洁扼要，不要重复文档内容。`;

    const result = yield* callLLM([{ role: "system", content: prompt }], null, modelConfig);

    if (result.textContent) {
      yield { type: "delta", phase: "text", text: result.textContent };

      if (!suppressSave && input.onSaveMessage) {
        await input.onSaveMessage({
          sessionId, agentName, role: "assistant",
          content: normalizeNewlines(result.textContent),
        });
      }
    }
  }

  yield { type: "done" };
}

// ── 直接聊天模式（Yumi） ──
async function* runDirect(input: EngineInput): EngineOutput {
  const { sessionId, userId, userMessage, modelConfig } = input;

  const msgs = await loadSessionMessages(sessionId);
  const summary = buildConversationSummary(msgs);
  const availableAgents = await listAgentNames(userId);

  const messages: Array<Record<string, unknown>> = [
    {
      role: "system",
      content: `You are Yumi, a workflow coordinator. Available agents: ${availableAgents.join(", ") || "none yet"}. Help the user organize document-writing tasks.`,
    },
  ];
  if (summary) {
    messages.push({ role: "system", content: `Conversation:\n${summary}` });
  }
  messages.push({ role: "user", content: userMessage });

  yield { type: "phase", phase: "thinking", meta: { label: "Thinking" } };

  const result = yield* callLLM(messages, null, modelConfig);

  // reasoning_content 已实时 yield 为 thinking delta
  // content → text delta
  if (result.textContent) {
    yield { type: "delta", phase: "text", text: result.textContent };
  }

  if (input.onSaveMessage) {
    await input.onSaveMessage({
      sessionId,
      agentName: null,
      role: "assistant",
      content: normalizeNewlines(result.textContent),
    });
  }

  yield { type: "done" };
}

// ── 主入口 ──
export async function* run(input: EngineInput): EngineOutput {
  if (input.targetAgent) {
    yield* runAgent(input);
  } else {
    yield* runDirect(input);
  }
}
