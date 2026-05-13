import { db } from "edgespark";
import { eq } from "drizzle-orm";
import { userProfiles } from "@defs";

export async function isAdmin(userId: string): Promise<boolean> {
  const [profile] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId));
  return profile?.role === "admin";
}
