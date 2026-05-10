import { Hono } from "hono";
import { db } from "edgespark";
import { eq, and } from "drizzle-orm";
import { toolUsers } from "@defs";
import { hashPassword, verifyPassword } from "../lib/password";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";

const COOKIE_PREFIX = "smart_tool_";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function getToolCookieName(projectId: number) {
  return `${COOKIE_PREFIX}${projectId}`;
}

export const toolAuthRoutes = new Hono()
  .post("/api/public/smart/auth/sign-up", async (c) => {
    const body = await c.req.json<{ email: string; password: string; name: string; projectId: number }>();
    if (!body.email || !body.password || !body.projectId) {
      return c.json({ error: "email, password, and projectId required" }, 400);
    }
    if (body.password.length < 6) {
      return c.json({ error: "Password must be at least 6 characters" }, 400);
    }

    const email = body.email.toLowerCase().trim();
    const [existing] = await db
      .select()
      .from(toolUsers)
      .where(and(eq(toolUsers.projectId, body.projectId), eq(toolUsers.email, email)));
    if (existing) return c.json({ error: "Email already registered" }, 409);

    const passwordHash = await hashPassword(body.password);
    const [user] = await db
      .insert(toolUsers)
      .values({
        projectId: body.projectId,
        email,
        passwordHash,
        name: body.name || email.split("@")[0],
      })
      .returning({ id: toolUsers.id, email: toolUsers.email, name: toolUsers.name });

    if (!user) return c.json({ error: "Failed to create user" }, 500);

    setCookie(c, getToolCookieName(body.projectId), String(user.id), {
      httpOnly: true, secure: true, sameSite: "Lax", maxAge: COOKIE_MAX_AGE, path: "/",
    });

    return c.json({ user: { id: user.id, email: user.email, name: user.name } }, 201);
  })
  .post("/api/public/smart/auth/sign-in", async (c) => {
    const body = await c.req.json<{ email: string; password: string; projectId: number }>();
    if (!body.email || !body.password || !body.projectId) {
      return c.json({ error: "email, password, and projectId required" }, 400);
    }

    const email = body.email.toLowerCase().trim();
    const [user] = await db
      .select()
      .from(toolUsers)
      .where(and(eq(toolUsers.projectId, body.projectId), eq(toolUsers.email, email)));

    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      return c.json({ error: "Invalid email or password" }, 401);
    }

    setCookie(c, getToolCookieName(body.projectId), String(user.id), {
      httpOnly: true, secure: true, sameSite: "Lax", maxAge: COOKIE_MAX_AGE, path: "/",
    });

    return c.json({ user: { id: user.id, email: user.email, name: user.name } });
  })
  .post("/api/public/smart/auth/sign-out", async (c) => {
    const body = await c.req.json<{ projectId: number }>();
    if (body.projectId) {
      deleteCookie(c, getToolCookieName(body.projectId), { path: "/" });
    }
    return c.json({ success: true });
  })
  .get("/api/public/smart/auth/user", async (c) => {
    const projectId = parseInt(c.req.query("projectId") || "0", 10);
    if (!projectId) return c.json({ user: null });

    const userId = parseInt(getCookie(c, getToolCookieName(projectId)) || "0", 10);
    if (!userId) return c.json({ user: null });

    const [user] = await db
      .select({ id: toolUsers.id, email: toolUsers.email, name: toolUsers.name })
      .from(toolUsers)
      .where(eq(toolUsers.id, userId));

    if (!user) return c.json({ user: null });
    return c.json({ user });
  });
