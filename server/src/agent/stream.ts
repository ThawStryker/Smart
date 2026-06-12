import type { PhaseEvent } from "./mose/phases";

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

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
      try {
        for await (const event of events) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          if (event.type === "done") {
            controller.close();
            return;
          }
        }
        controller.close();
      } catch (err: any) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "error", message: err.message || "Stream error" })}\n\n`),
        );
        controller.close();
      }
    },
    cancel() {},
  });
}
