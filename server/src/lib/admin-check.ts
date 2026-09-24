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

export async function canManageShared(
  visibility: string | null | undefined,
  ownerId: string | null | undefined,
  userId: string,
): Promise<boolean> {
  if (visibility === "global") return isAdmin(userId);
  return ownerId === userId;
}
