import { Hono } from "hono";
import { db } from "edgespark";
import { eq } from "drizzle-orm";
import { scryptAsync } from "@noble/hashes/scrypt.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { esSystemAuthUser, esSystemAuthAccount } from "@defs";

// 与 Better Auth 完全一致的密码哈希参数
const SCRYPT_CONFIG = { N: 16384, r: 16, p: 1, dkLen: 64 } as const;

async function hashPassword(password: string): Promise<string> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = Array.from(saltBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  const key = await scryptAsync(password.normalize("NFKC"), salt, SCRYPT_CONFIG);
  return `${salt}:${bytesToHex(key)}`;
}

export const resetPasswordRoutes = new Hono()
  .post("/api/public/smart/reset-password", async (c) => {
    const { email, newPassword } = await c.req.json<{ email: string; newPassword: string }>();

    if (!email || !newPassword) {
      return c.json({ error: "Email and newPassword are required" }, 400);
    }

    if (newPassword.length < 8) {
      return c.json({ error: "Password must be at least 8 characters" }, 400);
    }

    // 验证用户存在
    const [user] = await db
      .select({ id: esSystemAuthUser.id })
      .from(esSystemAuthUser)
      .where(eq(esSystemAuthUser.email, email));
    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    // 验证该用户是 credential 登录方式
    const [account] = await db
      .select({ id: esSystemAuthAccount.id })
      .from(esSystemAuthAccount)
      .where(eq(esSystemAuthAccount.userId, user.id));

    if (!account) {
      return c.json({ error: "Account not found" }, 404);
    }

    // 用 scrypt 哈希新密码
    const newHash = await hashPassword(newPassword);

    // 更新密码
    await db
      .update(esSystemAuthAccount)
      .set({ password: newHash })
      .where(eq(esSystemAuthAccount.userId, user.id));

    return c.json({ success: true, message: "Password reset completed" });
  });
