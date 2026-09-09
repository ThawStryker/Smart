import type { PhaseEvent } from "./mose/phases";

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

function describeStreamError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const low = msg.toLowerCase();
  if (low.includes("network") || low.includes("fetch") || low.includes("connection")) {
    return `网络中断: ${msg}`;
  }
  return msg || "Stream error";
}

// 向后兼容：旧代码仍使用 eventQueue 数组模式
export function emit(queue: Array<Record<string, unknown>>, data: Record<string, unknown>) {
  queue.push(data);
}

// 向后兼容：旧 eventQueue 轮询模式（Coding/Market 模块使用）
export function createSSEStream(eventQueue: Array<Record<string, unknown>>): ReadableStream {
  return new ReadableStream({
    async start(controller) {
      while (true) {
        while (eventQueue.length > 0) {
          const data = eventQueue.shift()!;
          try {
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`));
            if (data.type === "done") { controller.close(); return; }
          } catch { return; }
        }
        await new Promise(r => setTimeout(r, 50));
      }
    },
    cancel() { /* background task continues */ },
  });
}

// 新 Phase 驱动模式（Work 模块使用）
export function createPhaseSSEStream(
  events: AsyncIterable<PhaseEvent>,
): ReadableStream {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const send = (chunk: string) => {
        controller.enqueue(encoder.encode(chunk));
      };
      // 等模型首包时保持连接，避免代理把空闲 SSE 掐掉
      const ping = setInterval(() => {
        try { send(": ping\n\n"); } catch { /* 客户端已断开 */ }
      }, 15000);
      try {
        send(": connected\n\n");
        for await (const event of events) {
          send(`data: ${JSON.stringify(event)}\n\n`);
          if (event.type === "done") break;
        }
      } catch (err: unknown) {
        try {
          send(`data: ${JSON.stringify({ type: "error", message: describeStreamError(err) })}\n\n`);
        } catch { /* 客户端已断开 */ }
      } finally {
        clearInterval(ping);
        try { controller.close(); } catch { /* already closed */ }
      }
    },
    cancel() {},
  });
}
