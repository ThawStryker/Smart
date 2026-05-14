export const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

export function emit(queue: Array<Record<string, unknown>>, data: Record<string, unknown>) {
  queue.push(data);
}

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
