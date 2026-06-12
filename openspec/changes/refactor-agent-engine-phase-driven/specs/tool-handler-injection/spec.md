## tool-handler-injection

工具回调由上层组装时注入 Engine，Engine 不关心工具实现细节。

### ToolHandler 接口

```typescript
interface ToolHandler {
  execute(args: Record<string, unknown>): Promise<string>;
  phase: PhaseName;
  meta?: (args: Record<string, unknown>) => Record<string, unknown>;
}
```

### 注入方式

上层在 `chat.ts` 中组装 toolHandlers 映射：

```typescript
const toolHandlers: Record<string, ToolHandler> = {
  read_file: {
    execute: (args) => agentModule.readFile(args),
    phase: "read",
    meta: (args) => ({ path: args.path }),
  },
  write_file: {
    execute: (args) => workspaceModule.writeFile(args),
    phase: "write",
    meta: (args) => ({ path: args.path }),
  },
  // ...
};
```

### Engine 内部使用

```
收到 tool_call(name, args):
  handler = toolHandlers[name]
  
  // 1. 声明 phase
  yield { type: "phase", phase: handler.phase, meta: handler.meta?.(args) }
  
  // 2. 执行工具
  result = await handler.execute(args)
  
  // 3. 推送结果
  yield { type: "delta", phase: handler.phase, text: result }
```

### write_file 特殊处理

`write_file` 的 ToolHandler.execute 内部拆分：

```typescript
// file-ops.ts 暴露底层方法
export async function createFile(path, userId): Promise<void> { ... }
export async function writeContent(path, content, userId): Promise<void> { ... }

// ToolHandler 组装
write_file: {
  execute: async (args) => {
    await createFile(args.path, userId);
    await writeContent(args.path, args.content, userId);
    return `File written: ${args.path}`;
  },
  phase: "write",
  meta: (args) => ({ path: args.path }),
}
```

Engine 在 write 的 phase 事件中附带 path，前端据此自动打开文件；delta 事件推送文件内容到 DocumentEditor。

### 约束

- 每个工具必须绑定一个 phase
- `meta` 函数可选，用于生成前端卡片元数据
- `execute` 是纯异步函数，不访问 Engine 内部状态
