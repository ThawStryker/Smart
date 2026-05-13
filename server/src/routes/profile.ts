import { Hono } from "hono";
import { db } from "edgespark";
import { auth } from "edgespark/http";
import { eq } from "drizzle-orm";
import { userProfiles } from "@defs";

export const profileRoutes = new Hono()
  .get("/api/profile/me", async (c) => {
    const userId = auth.user!.id;
    const [profile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId));

    return c.json({
      userId,
      role: profile?.role || "user",
      displayName: profile?.displayName || null,
      isAdmin: profile?.role === "admin",
    });
  });
