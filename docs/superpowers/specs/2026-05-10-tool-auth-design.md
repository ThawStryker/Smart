# 工具独立用户系统 设计文档

**Date:** 2026-05-10
**Status:** Approved

## Goal

每个部署的工具拥有独立的用户系统，与 Smart 平台账号完全隔离。用户注册的是工具账号，不是 Smart 账号。

## Architecture

```
book.torresx.cn
  └─ Smart SDK (Smart.auth.signUp/signIn)
       └─ POST /api/public/smart/auth/sign-up → D1 (tool_users 表)
       └─ POST /api/public/smart/auth/sign-in → Set-Cookie (smart_tool_{projectId})
```

## Design

### 1. 数据模型

新增 `tool_users` 表（D1）：

```sql
CREATE TABLE tool_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(project_id, email)
);
```

- `UNIQUE(project_id, email)` — 同一邮箱可在不同工具分别注册
- 密码用 Web Crypto PBKDF2 哈希存储

### 2. API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/public/smart/auth/sign-up` | 注册。body: `{ email, password, name, projectId }` → Set-Cookie |
| POST | `/api/public/smart/auth/sign-in` | 登录。body: `{ email, password, projectId }` → Set-Cookie |
| POST | `/api/public/smart/auth/sign-out` | 退出。清除 Cookie |
| GET | `/api/public/smart/auth/user` | 当前用户或 null |

所有端点均为 public（无需 Smart 登录）。

### 3. Cookie 隔离

Cookie 名：`smart_tool_{projectId}`

确保不同工具的 cookie 互不干扰，也与 Smart 平台自身的 cookie 隔离。

### 4. SDK 接口

```js
// 注册
await Smart.auth.signUp(email, password, name)
// → POST /api/public/smart/auth/sign-up
// → 成功后自动设置 cookie，无需手动处理

// 登录
await Smart.auth.signIn(email, password)
// → POST /api/public/smart/auth/sign-in

// 退出
await Smart.auth.signOut()
// → POST /api/public/smart/auth/sign-out

// 当前用户
const user = await Smart.auth.user()
// → GET /api/public/smart/auth/user
// → { id, email, name } | null
```

### 5. 密码安全

使用 Web Crypto API 的 PBKDF2：
- 盐值：16 字节随机
- 迭代：100,000 次
- 哈希：SHA-256
- 存储格式：`salt:hash`（Base64 编码）

### 6. AI 生成代码示例

```html
<!-- 需要登录的工具 -->
<script>
async function init() {
  const user = await Smart.auth.user();
  if (!user) {
    window.location.href = '/login.html'; // 工具自己的登录页
    return;
  }
  // 正常加载...
}
init();
</script>
```

## File Changes

### New Files
| File | Purpose |
|------|---------|
| `server/src/routes/toolAuth.ts` | sign-up/sign-in/sign-out/user 端点 |
| `server/src/lib/password.ts` | PBKDF2 密码哈希工具 |

### Modified Files
| File | Changes |
|------|---------|
| `server/src/defs/db_schema.ts` | 添加 `tool_users` 表 |
| `server/src/defs/db_relations.ts` | 添加关系 |
| `server/src/index.ts` | 注册 toolAuth 路由 |
| `server/src/routes/sdk.ts` | 更新 SDK 添加 signUp/signIn 方法 |
| `server/src/routes/vibe.ts` | 更新 System Prompt |
