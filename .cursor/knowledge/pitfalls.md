# Work 坑

- **D1 最终一致性**：DELETE 后不要立刻 reload 当真相。前端用 `setFiles` 过滤，并用 `sessionStorage` 顶住短暂不一致。
- **Streaming 覆盖正文**：流式 `write_file` 期间不要 `onOpenFile`；Milkdown `markdownUpdated` 要看 `isStreamingRef`。
- **Skill 格式冲突**：skill 全文进 system prompt 时，格式示例表会盖过「输出结构」。
- **git checkout**：恢复文件后确认 `chat.ts` 仍从 `models.ts` 读模型，不要写死模型名。
- **跨轮状态**：newo 已并入 mose。`workSessions.stateJson` 是 session log；旧会话若格式不对，新开一轮。
- **不要改 prompt 当第一手段**：先查 `write_file` / `edit_file` 是否可用，再查 skill 是否加载。
