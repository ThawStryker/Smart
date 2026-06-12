## async-generator-stream

用 AsyncGenerator 替代 eventQueue 数组轮询，简化 SSE 流控制。

### 当前方案（待替换）

```typescript
// 全局 eventQueue 数组 + 轮询
const eventQueue = [];
function emit(queue, data) { queue.push(data); }
function createSSEStream(queue) {
  return new ReadableStream({
    async start(controller) {
      while (true) {
        while (queue.length > 0) {
          const data = queue.shift();
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          if (data.type === "done") { controller.close(); return; }
        }
        await new Promise(r => setTimeout(r, 50)); // 轮询
      }
    }
  });
}
```

### 新方案

```typescript
export function createSSEStream(
  events: AsyncIterable<PhaseEvent>
): ReadableStream {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      for await (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        if (event.type === "done") {
          controller.close();
          return;
        }
      }
    },
    cancel() { /* stream cancelled by client */ },
  });
}
```

### Engine 侧

Engine 暴露 `run()` 方法返回 `AsyncIterable<PhaseEvent>`：

```typescript
async function* run(input: EngineInput): AsyncGenerator<PhaseEvent> {
  // Phase: thinking
  yield { type: "phase", phase: "thinking" };
  // ... LLM 调用，yield delta
  yield { type: "done" };
}
```

### chat.ts 集成

```typescript
const events = run(input);
const stream = createSSEStream(events);

// 不再需要 ctx.runInBackground
return new Response(stream, { headers: SSE_HEADERS });
```

### 约束

- `createSSEStream` 不再依赖全局 eventQueue
- 不再需要 `emit()` 全局函数
- 不再需要 `setTimeout` 轮询
- Engine 的 AsyncGenerator 在 `ReadableStream.start()` 中消费，由 CF Worker 管理生命周期
