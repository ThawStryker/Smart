# EdgeSpark 手册

平台模板从 `CLAUDE.md` 迁到这里。运行时不依赖这些文件。

## 目录

- 表：`server/src/defs/db_schema.ts`；关系：`db_relations.ts`；vars/secrets：`runtime.ts`
- 生成物：`server/src/__generated__/`（`edgespark pull types` / `pull schema --db`）
- 迁移：`server/drizzle/`（不要删、不要改已应用的 SQL）

## 常用命令

```bash
edgespark db generate
edgespark db migrate
edgespark storage apply
edgespark pull types
edgespark deploy
```

未登录：`edgespark login`，把 URL 给用户。禁止并行跑 CLI。

## 迁移红线

只加不减。不要 DROP TABLE/COLUMN、不要 RENAME。多余列留着即可。
`migrate` 必须在默认分支。危险操作只有用户明确要求才加 `--confirm-dangerous`。

## Storage

- 浏览器上传/下载：预签名 URL
- Worker 自己生成的字节：`storage.put()`
- 数据库存 `s3://bucket/path`，返回给前端必须是 `createPresignedGetUrl`
