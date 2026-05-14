# Phase 4 Implementation Plan: Skills / MCPs / 工具市场

> **Status: COMPLETED** (2026-05-14)
>
> 实际完成超出原计划范围，新增 SmartAgent 架构重构、斜杠命令系统、动态 Skill 加载、记忆系统、设计升级。

**Goal:** Add Skills management, MCPs management, and a tool marketplace with admin review to the Smart platform.

**Architecture:** New DB tables (skills, mcps) + extended market_listings. New server routes under /api/skills, /api/mcps, /api/market, /api/admin. New frontend pages at /skills, /mcps, /market, /admin. Admin access gated by userProfiles.role === "admin".

**Tech Stack:** Hono + Drizzle ORM + Cloudflare Workers + React + Vite + Tailwind CSS

---

### Task 1: Database schema — add skills, mcps tables and extend market_listings

**Files:**
- Modify: `server/src/defs/db_schema.ts`
- Modify: `server/src/defs/db_relations.ts`
- Modify: `server/src/defs/index.ts`

- [ ] **Step 1: Add skills and mcps table definitions to db_schema.ts**

Add after the `toolUsers` table definition (around line 128):

```typescript
// 技能/Skills 管理
export const skills = sqliteTable("skills", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  visibility: text("visibility").default("private"), // "global" | "private"
  ownerId: text("owner_id").notNull(),
  sourceType: text("source_type").notNull(), // "zip" | "git"
  sourceUrl: text("source_url"),
  storagePath: text("storage_path").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).default(true),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

// MCPs 管理
export const mcps = sqliteTable("mcps", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  visibility: text("visibility").default("private"), // "global" | "private"
  ownerId: text("owner_id").notNull(),
  config: text("config"), // JSON
  enabled: integer("enabled", { mode: "boolean" }).default(true),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});
```

- [ ] **Step 2: Add new columns to market_listings table**

Modify the existing `marketListings` definition to add `type`, `url`, `version`:

```typescript
export const marketListings = sqliteTable("market_listings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  toolId: integer("tool_id").notNull(),
  sellerId: text("seller_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  price: real("price"),
  category: text("category"),
  downloads: integer("downloads").default(0),
  ratingAvg: real("rating_avg"),
  status: text("status").default("pending_review"),
  type: text("type").default("tool"),          // NEW: "tool" | "url"
  url: text("url"),                             // NEW: external URL
  version: integer("version").default(1),       // NEW: version number
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});
```

- [ ] **Step 3: Add relations to db_relations.ts**

Add after existing relations:

```typescript
export const skillsRelations = relations(skills, ({ one }) => ({
  owner: one(userProfiles, {
    fields: [skills.ownerId],
    references: [userProfiles.userId],
  }),
}));

export const mcpsRelations = relations(mcps, ({ one }) => ({
  owner: one(userProfiles, {
    fields: [mcps.ownerId],
    references: [userProfiles.userId],
  }),
}));
```

- [ ] **Step 4: Update barrel export in defs/index.ts**

Add `skills`, `mcps` to the existing imports and `@defs` export list alongside existing table exports.

- [ ] **Step 5: Generate and apply migration**

```bash
cd server && edgespark db generate
edgespark db migrate
```

Expected: New migration file created in `drizzle/` and applied to D1.

- [ ] **Step 6: Commit**

```bash
git add server/src/defs/db_schema.ts server/src/defs/db_relations.ts server/src/defs/index.ts drizzle/
git commit -m "feat: add skills, mcps tables and extend market_listings"
```

---

### Task 2: User profile API + admin check helper

**Files:**
- Create: `server/src/routes/profile.ts`
- Create: `server/src/lib/admin-check.ts`

- [ ] **Step 1: Create admin check helper**

Create `server/src/lib/admin-check.ts`:

```typescript
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
```

- [ ] **Step 2: Create profile route**

Create `server/src/routes/profile.ts`:

```typescript
import { Hono } from "hono";
import { db } from "edgespark";
import { auth } from "edgespark/http";
import { eq } from "drizzle-orm";
import { userProfiles } from "@defs";
import { isAdmin } from "../lib/admin-check";

export const profileRoutes = new Hono()
  .get("/api/profile/me", async (c) => {
    const userId = auth.user!.id;
    const [profile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId));

    const admin = profile?.role === "admin";

    return c.json({
      userId,
      role: profile?.role || "user",
      displayName: profile?.displayName || null,
      isAdmin: admin,
    });
  });
```

- [ ] **Step 3: Register profile route in index.ts**

Add import and route registration in `server/src/index.ts`:

```typescript
import { profileRoutes } from "./routes/profile";
// ...
.route("/", profileRoutes)
```

- [ ] **Step 4: Commit**

```bash
git add server/src/lib/admin-check.ts server/src/routes/profile.ts server/src/index.ts
git commit -m "feat: add user profile API with admin role check"
```

---

### Task 3: Skills CRUD routes

**Files:**
- Create: `server/src/routes/skills.ts`

- [ ] **Step 1: Create skills routes**

Create `server/src/routes/skills.ts`:

```typescript
import { Hono } from "hono";
import { db, storage } from "edgespark";
import { auth } from "edgespark/http";
import { eq, and, or } from "drizzle-orm";
import { skills, buckets } from "@defs";

export const skillsRoutes = new Hono()
  .get("/api/skills", async (c) => {
    const userId = auth.user!.id;
    const rows = await db
      .select()
      .from(skills)
      .where(
        or(
          eq(skills.visibility, "global"),
          and(eq(skills.visibility, "private"), eq(skills.ownerId, userId))
        )
      )
      .orderBy(skills.createdAt);
    return c.json(rows);
  })

  .post("/api/skills", async (c) => {
    const userId = auth.user!.id;
    const contentType = c.req.header("Content-Type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await c.req.formData();
      const name = formData.get("name") as string;
      const description = formData.get("description") as string || "";
      const file = formData.get("file") as File;

      if (!name || !file) return c.json({ error: "name and file required" }, 400);

      const storagePath = `skills/${userId}/${Date.now()}/`;
      await storage.from(buckets.sourceBuckets).put(storagePath + file.name, await file.arrayBuffer());

      const [row] = await db.insert(skills).values({
        name, description,
        visibility: "private",
        ownerId: userId,
        sourceType: "zip",
        storagePath,
      }).returning();
      return c.json(row, 201);
    }

    // JSON body — git URL
    const body = await c.req.json<{ gitUrl: string; name: string; description?: string }>();
    if (!body.name || !body.gitUrl) return c.json({ error: "name and gitUrl required" }, 400);

    const storagePath = `skills/${userId}/${Date.now()}/`;
    const [row] = await db.insert(skills).values({
      name: body.name,
      description: body.description || "",
      visibility: "private",
      ownerId: userId,
      sourceType: "git",
      sourceUrl: body.gitUrl,
      storagePath,
    }).returning();
    return c.json(row, 201);
  })

  .patch("/api/skills/:id", async (c) => {
    const userId = auth.user!.id;
    const id = parseInt(c.req.param("id"), 10);
    const [existing] = await db.select().from(skills).where(eq(skills.id, id));
    if (!existing) return c.json({ error: "Skill not found" }, 404);
    if (existing.visibility === "private" && existing.ownerId !== userId) {
      return c.json({ error: "Not authorized" }, 403);
    }

    const body = await c.req.json<{ name?: string; description?: string; enabled?: boolean }>();
    await db.update(skills).set({ ...body, updatedAt: new Date().toISOString() }).where(eq(skills.id, id));
    return c.json({ success: true });
  })

  .delete("/api/skills/:id", async (c) => {
    const userId = auth.user!.id;
    const id = parseInt(c.req.param("id"), 10);
    const [existing] = await db.select().from(skills).where(eq(skills.id, id));
    if (!existing) return c.json({ error: "Skill not found" }, 404);
    if (existing.visibility === "private" && existing.ownerId !== userId) {
      return c.json({ error: "Not authorized" }, 403);
    }

    await db.delete(skills).where(eq(skills.id, id));
    return c.json({ success: true });
  });
```

- [ ] **Step 2: Register in index.ts**

```typescript
import { skillsRoutes } from "./routes/skills";
// ...
.route("/", skillsRoutes)
```

- [ ] **Step 3: Commit**

---

### Task 4: MCPs CRUD routes

**Files:**
- Create: `server/src/routes/mcps.ts`

- [ ] **Step 1: Create mcps routes**

Create `server/src/routes/mcps.ts`:

```typescript
import { Hono } from "hono";
import { db } from "edgespark";
import { auth } from "edgespark/http";
import { eq, and, or } from "drizzle-orm";
import { mcps } from "@defs";

export const mcpsRoutes = new Hono()
  .get("/api/mcps", async (c) => {
    const userId = auth.user!.id;
    const rows = await db
      .select()
      .from(mcps)
      .where(
        or(
          eq(mcps.visibility, "global"),
          and(eq(mcps.visibility, "private"), eq(mcps.ownerId, userId))
        )
      )
      .orderBy(mcps.createdAt);
    return c.json(rows);
  })

  .post("/api/mcps", async (c) => {
    const userId = auth.user!.id;
    const body = await c.req.json<{ name: string; description?: string; config?: Record<string, unknown> }>();
    if (!body.name) return c.json({ error: "name required" }, 400);

    const [row] = await db.insert(mcps).values({
      name: body.name,
      description: body.description || "",
      visibility: "private",
      ownerId: userId,
      config: body.config ? JSON.stringify(body.config) : null,
    }).returning();
    return c.json(row, 201);
  })

  .patch("/api/mcps/:id", async (c) => {
    const userId = auth.user!.id;
    const id = parseInt(c.req.param("id"), 10);
    const [existing] = await db.select().from(mcps).where(eq(mcps.id, id));
    if (!existing) return c.json({ error: "MCP not found" }, 404);
    if (existing.visibility === "private" && existing.ownerId !== userId) {
      return c.json({ error: "Not authorized" }, 403);
    }

    const body = await c.req.json<{ name?: string; description?: string; config?: Record<string, unknown>; enabled?: boolean }>();
    const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (body.name !== undefined) update.name = body.name;
    if (body.description !== undefined) update.description = body.description;
    if (body.config !== undefined) update.config = JSON.stringify(body.config);
    if (body.enabled !== undefined) update.enabled = body.enabled;

    await db.update(mcps).set(update).where(eq(mcps.id, id));
    return c.json({ success: true });
  })

  .delete("/api/mcps/:id", async (c) => {
    const userId = auth.user!.id;
    const id = parseInt(c.req.param("id"), 10);
    const [existing] = await db.select().from(mcps).where(eq(mcps.id, id));
    if (!existing) return c.json({ error: "MCP not found" }, 404);
    if (existing.visibility === "private" && existing.ownerId !== userId) {
      return c.json({ error: "Not authorized" }, 403);
    }

    await db.delete(mcps).where(eq(mcps.id, id));
    return c.json({ success: true });
  });
```

- [ ] **Step 2: Register in index.ts**

```typescript
import { mcpsRoutes } from "./routes/mcps";
// ...
.route("/", mcpsRoutes)
```

- [ ] **Step 3: Commit**

---

### Task 5: Market routes (public browsing + publish + update)

**Files:**
- Create: `server/src/routes/market.ts`

- [ ] **Step 1: Create market routes**

Create `server/src/routes/market.ts`:

```typescript
import { Hono } from "hono";
import { db, storage } from "edgespark";
import { auth } from "edgespark/http";
import { eq, and, desc } from "drizzle-orm";
import { marketListings, tools, domains, buckets } from "@defs";

export const marketRoutes = new Hono()
  .get("/api/public/market", async (c) => {
    const rows = await db
      .select()
      .from(marketListings)
      .where(eq(marketListings.status, "approved"))
      .orderBy(desc(marketListings.createdAt));
    return c.json(rows);
  })

  .get("/api/public/market/:id", async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const [row] = await db.select().from(marketListings).where(eq(marketListings.id, id));
    if (!row || row.status !== "approved") return c.json({ error: "Not found" }, 404);
    return c.json(row);
  })

  .post("/api/projects/:projectId/publish", async (c) => {
    const userId = auth.user!.id;
    const projectId = parseInt(c.req.param("projectId"), 10);

    const body = await c.req.json<{ title: string; description?: string; category?: string }>();
    if (!body.title) return c.json({ error: "title required" }, 400);

    const [tool] = await db
      .select()
      .from(tools)
      .where(eq(tools.projectId, projectId))
      .orderBy(desc(tools.createdAt))
      .limit(1);
    if (!tool) return c.json({ error: "No tool found" }, 404);

    const [existing] = await db
      .select()
      .from(marketListings)
      .where(and(eq(marketListings.toolId, tool.id), eq(marketListings.type, "tool")));
    if (existing) {
      return c.json({ error: "Already published. Use update instead.", id: existing.id }, 409);
    }

    const [row] = await db.insert(marketListings).values({
      toolId: tool.id,
      sellerId: userId,
      title: body.title,
      description: body.description || "",
      category: body.category || "",
      type: "tool",
      status: "pending_review",
      version: 1,
    }).returning();
    return c.json(row, 201);
  })

  .post("/api/market/:id/update", async (c) => {
    const userId = auth.user!.id;
    const id = parseInt(c.req.param("id"), 10);
    const [existing] = await db.select().from(marketListings).where(eq(marketListings.id, id));
    if (!existing) return c.json({ error: "Not found" }, 404);
    if (existing.sellerId !== userId) return c.json({ error: "Not authorized" }, 403);
    if (existing.type !== "tool") return c.json({ error: "URL listings cannot be updated this way" }, 400);

    const body = await c.req.json<{ title?: string; description?: string; category?: string }>();
    await db.update(marketListings).set({
      ...body,
      version: existing.version + 1,
      status: "pending_review",
    }).where(eq(marketListings.id, id));
    return c.json({ success: true, version: existing.version + 1 });
  });
```

- [ ] **Step 2: Register in index.ts**

```typescript
import { marketRoutes } from "./routes/market";
// ...
.route("/", marketRoutes)
```

- [ ] **Step 3: Commit**

---

### Task 6: Admin routes (review, global skills/mcps, URL tools)

**Files:**
- Create: `server/src/routes/admin.ts`

- [ ] **Step 1: Create admin routes**

Create `server/src/routes/admin.ts`:

```typescript
import { Hono } from "hono";
import { db } from "edgespark";
import { auth } from "edgespark/http";
import { eq } from "drizzle-orm";
import { marketListings, skills, mcps } from "@defs";
import { isAdmin } from "../lib/admin-check";

async function requireAdmin(c: any) {
  if (!(await isAdmin(auth.user!.id))) {
    return c.json({ error: "Admin only" }, 403);
  }
  return null;
}

export const adminRoutes = new Hono()
  .use("/api/admin/*", async (c, next) => {
    const res = await requireAdmin(c);
    if (res) return res;
    await next();
  })

  .get("/api/admin/market/pending", async (c) => {
    const rows = await db
      .select()
      .from(marketListings)
      .where(eq(marketListings.status, "pending_review"));
    return c.json(rows);
  })

  .post("/api/admin/market/:id/approve", async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const [row] = await db.select().from(marketListings).where(eq(marketListings.id, id));
    if (!row) return c.json({ error: "Not found" }, 404);

    await db.update(marketListings).set({ status: "approved" }).where(eq(marketListings.id, id));
    return c.json({ success: true });
  })

  .post("/api/admin/market/:id/reject", async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const [row] = await db.select().from(marketListings).where(eq(marketListings.id, id));
    if (!row) return c.json({ error: "Not found" }, 404);

    await db.update(marketListings).set({ status: "rejected" }).where(eq(marketListings.id, id));
    return c.json({ success: true });
  })

  .post("/api/admin/market/url", async (c) => {
    const body = await c.req.json<{ title: string; description?: string; url: string; category?: string }>();
    if (!body.title || !body.url) return c.json({ error: "title and url required" }, 400);

    const [row] = await db.insert(marketListings).values({
      toolId: 0,
      sellerId: auth.user!.id,
      title: body.title,
      description: body.description || "",
      category: body.category || "",
      type: "url",
      url: body.url,
      status: "approved",
    }).returning();
    return c.json(row, 201);
  })

  .post("/api/admin/skills", async (c) => {
    const body = await c.req.json<{ name: string; description?: string; gitUrl?: string }>();
    if (!body.name) return c.json({ error: "name required" }, 400);

    const [row] = await db.insert(skills).values({
      name: body.name,
      description: body.description || "",
      visibility: "global",
      ownerId: auth.user!.id,
      sourceType: body.gitUrl ? "git" : "zip",
      sourceUrl: body.gitUrl || null,
      storagePath: `skills/global/${Date.now()}/`,
    }).returning();
    return c.json(row, 201);
  })

  .post("/api/admin/mcps", async (c) => {
    const body = await c.req.json<{ name: string; description?: string; config?: Record<string, unknown> }>();
    if (!body.name) return c.json({ error: "name required" }, 400);

    const [row] = await db.insert(mcps).values({
      name: body.name,
      description: body.description || "",
      visibility: "global",
      ownerId: auth.user!.id,
      config: body.config ? JSON.stringify(body.config) : null,
    }).returning();
    return c.json(row, 201);
  });
```

- [ ] **Step 2: Register in index.ts**

```typescript
import { adminRoutes } from "./routes/admin";
// ...
.route("/", adminRoutes)
```

- [ ] **Step 3: Commit**

---

### Task 7: Register all new routes in index.ts

**Files:**
- Modify: `server/src/index.ts`

Combine all imports and route registrations from tasks 2-6 into a single clean edit:

```typescript
import { profileRoutes } from "./routes/profile";
import { skillsRoutes } from "./routes/skills";
import { mcpsRoutes } from "./routes/mcps";
import { marketRoutes } from "./routes/market";
import { adminRoutes } from "./routes/admin";

const app = new Hono()
  .get("/api/public/hello", (c) =>
    c.json({ message: "Hello from EdgeSpark! Spark your idea to the Edge." })
  )
  .route("/api/projects", projectsRoutes)
  .route("/api/projects", vibeRoutes)
  .route("/api/projects", stepsRoutes)
  .route("/api/projects", dataRoutes)
  .route("/api/projects", deployRoutes)
  .route("/", toolDataRoutes)
  .route("/", toolAuthRoutes)
  .route("/", sdkRoutes)
  .route("/", previewRoutes)
  .route("/", serveRoutes)
  .route("/", domainSyncRoutes)
  .route("/", profileRoutes)
  .route("/", skillsRoutes)
  .route("/", mcpsRoutes)
  .route("/", marketRoutes)
  .route("/", adminRoutes);
```

- [ ] **Step 1: Commit**

```bash
git add server/src/index.ts
git commit -m "feat: register Phase 4 routes"
```

---

### Task 8: Frontend — user role hook

**Files:**
- Create: `web/src/hooks/useProfile.ts`

- [ ] **Step 1: Create useProfile hook**

Create `web/src/hooks/useProfile.ts`:

```typescript
import { useEffect, useState } from "react";
import { client } from "@/lib/edgespark";

interface Profile {
  userId: string;
  role: string;
  displayName: string | null;
  isAdmin: boolean;
}

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    client.api.fetch("/api/profile/me")
      .then(r => r.json())
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, []);

  return { profile, loading, isAdmin: profile?.isAdmin ?? false };
}
```

- [ ] **Step 2: Commit**

---

### Task 9: Frontend — TopNav + App routing update

**Files:**
- Modify: `web/src/components/layout/TopNav.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Update TopNav with functional links and admin link**

Rewrite `web/src/components/layout/TopNav.tsx`:

```typescript
import { useNavigate } from "react-router-dom";
import { client } from "@/lib/edgespark";
import type { AuthUser } from "@edgespark/web";

interface TopNavProps {
  user?: AuthUser | null;
  isAdmin?: boolean;
}

const navItems = [
  { label: "Skills", path: "/skills" },
  { label: "MCPs", path: "/mcps" },
  { label: "工具市场", path: "/market" },
];

export function TopNav({ user, isAdmin }: TopNavProps) {
  const navigate = useNavigate();

  return (
    <header className="bg-white border-b border-neutral-200 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-8">
        <div
          className="flex items-center gap-2 cursor-pointer"
          onClick={() => navigate("/dashboard")}
        >
          <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center">
            <span className="text-white text-lg font-bold">S</span>
          </div>
          <span className="font-bold text-lg">Smart</span>
        </div>
        <nav className="flex items-center gap-6 text-sm">
          {navItems.map((item) => (
            <a
              key={item.label}
              onClick={() => navigate(item.path)}
              className="text-neutral-500 hover:text-blue-600 transition-colors cursor-pointer"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-4">
        {isAdmin && (
          <button
            onClick={() => navigate("/admin")}
            className="text-sm bg-amber-50 text-amber-600 px-3 py-1 rounded hover:bg-amber-100 transition-colors"
          >
            管理
          </button>
        )}
        <button className="text-sm bg-blue-50 text-blue-600 px-3 py-1 rounded hover:bg-blue-100 transition-colors" onClick={() => navigate("/market")}>
          发布工具
        </button>
        {user?.name && (
          <span className="text-sm text-neutral-500">{user.name}</span>
        )}
        <button
          onClick={() => client.auth.signOut()}
          className="text-sm text-neutral-500 hover:text-red-500 transition-colors"
        >
          退出
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Add new routes to App.tsx**

Add imports and routes in `web/src/App.tsx`:

```typescript
import { SkillsPage } from "@/pages/SkillsPage";
import { McpsPage } from "@/pages/McpsPage";
import { MarketPage } from "@/pages/MarketPage";
import { AdminPage } from "@/pages/AdminPage";

// Add routes:
<Route path="/skills" element={<SkillsPage />} />
<Route path="/mcps" element={<McpsPage />} />
<Route path="/market" element={<MarketPage />} />
<Route path="/admin" element={<AdminPage />} />
```

- [ ] **Step 3: Update Dashboard and ProjectDetail to pass isAdmin to TopNav**

In `Dashboard.tsx` and `ProjectDetail.tsx`, add `useProfile()` hook and pass `isAdmin` prop to `<TopNav>`:

```typescript
import { useProfile } from "@/hooks/useProfile";
// ...
const { isAdmin } = useProfile();
// ...
<TopNav user={user} isAdmin={isAdmin} />
```

- [ ] **Step 4: Commit**

---

### Task 10: Frontend — Skills page

**Files:**
- Create: `web/src/pages/SkillsPage.tsx`

- [ ] **Step 1: Create SkillsPage**

Create `web/src/pages/SkillsPage.tsx`:

```typescript
import { useEffect, useState } from "react";
import { TopNav } from "@/components/layout/TopNav";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { client } from "@/lib/edgespark";

interface Skill {
  id: number;
  name: string;
  description: string;
  visibility: string;
  sourceType: string;
  enabled: boolean;
}

export function SkillsPage() {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin } = useProfile();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<"zip" | "git">("git");
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [gitUrl, setGitUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const fetchSkills = async () => {
    const res = await client.api.fetch("/api/skills");
    setSkills(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetchSkills(); }, []);

  const handleUpload = async () => {
    if (formType === "git") {
      await client.api.fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: desc, gitUrl }),
      });
    } else {
      const fd = new FormData();
      fd.append("name", name);
      fd.append("description", desc);
      if (file) fd.append("file", file);
      await client.api.fetch("/api/skills", { method: "POST", body: fd });
    }
    setShowForm(false);
    setName(""); setDesc(""); setGitUrl(""); setFile(null);
    fetchSkills();
  };

  const toggleSkill = async (id: number, enabled: boolean) => {
    await client.api.fetch(`/api/skills/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !enabled }),
    });
    fetchSkills();
  };

  const deleteSkill = async (id: number) => {
    if (!confirm("确定删除？")) return;
    await client.api.fetch(`/api/skills/${id}`, { method: "DELETE" });
    fetchSkills();
  };

  if (authLoading || loading) return <div className="p-8">加载中...</div>;
  if (!user) return null;

  return (
    <div className="h-screen flex flex-col">
      <TopNav user={user} isAdmin={isAdmin} />
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-medium">Skills</h1>
            <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 text-white px-4 py-2 rounded text-sm">
              上传 Skill
            </button>
          </div>

          {showForm && (
            <div className="bg-neutral-50 p-4 rounded mb-6">
              <div className="flex gap-3 mb-3">
                <button onClick={() => setFormType("git")} className={`px-3 py-1 rounded text-sm ${formType === "git" ? "bg-blue-600 text-white" : "bg-white"}`}>Git URL</button>
                <button onClick={() => setFormType("zip")} className={`px-3 py-1 rounded text-sm ${formType === "zip" ? "bg-blue-600 text-white" : "bg-white"}`}>ZIP 上传</button>
              </div>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="名称" className="w-full px-3 py-2 border rounded mb-2 text-sm" />
              <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="描述" className="w-full px-3 py-2 border rounded mb-2 text-sm" />
              {formType === "git" ? (
                <input value={gitUrl} onChange={e => setGitUrl(e.target.value)} placeholder="Git 仓库 URL" className="w-full px-3 py-2 border rounded mb-2 text-sm" />
              ) : (
                <input type="file" onChange={e => setFile(e.target.files?.[0] || null)} className="w-full text-sm mb-2" />
              )}
              <button onClick={handleUpload} className="bg-blue-600 text-white px-4 py-2 rounded text-sm">提交</button>
            </div>
          )}

          {skills.length === 0 ? (
            <p className="text-neutral-400 text-sm">暂无 Skill</p>
          ) : (
            <div className="space-y-2">
              {skills.map(s => (
                <div key={s.id} className="flex items-center gap-4 p-3 bg-white border rounded">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{s.name}</span>
                      {s.visibility === "global" && <span className="text-xs bg-amber-100 text-amber-600 px-1.5 rounded">全局</span>}
                    </div>
                    <div className="text-xs text-neutral-400">{s.description}</div>
                    <div className="text-xs text-neutral-300">来源: {s.sourceType}</div>
                  </div>
                  <button onClick={() => toggleSkill(s.id, s.enabled)} className={`text-xs px-2 py-1 rounded ${s.enabled ? "bg-green-100 text-green-600" : "bg-neutral-100 text-neutral-400"}`}>
                    {s.enabled ? "启用" : "禁用"}
                  </button>
                  <button onClick={() => deleteSkill(s.id)} className="text-xs text-red-400 hover:text-red-600">删除</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

---

### Task 11: Frontend — MCPs page

**Files:**
- Create: `web/src/pages/McpsPage.tsx`

Structure is nearly identical to SkillsPage, replacing skill-specific fields with MCP config (name, description, JSON config editor). Use the same pattern: list with enable/disable toggle, add form with name/description/config JSON textarea.

- [ ] **Step 1: Create McpsPage** — same pattern as SkillsPage, with a `<textarea>` for JSON config input.
- [ ] **Step 2: Commit**

---

### Task 12: Frontend — Market page

**Files:**
- Create: `web/src/pages/MarketPage.tsx`

Market is a public page showing approved tools in a card grid. Clicking a card opens the tool URL in a new tab.

- [ ] **Step 1: Create MarketPage**

```typescript
import { useEffect, useState } from "react";
import { TopNav } from "@/components/layout/TopNav";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { client } from "@/lib/edgespark";

interface Listing {
  id: number;
  title: string;
  description: string;
  category: string;
  type: string;
  url: string;
  downloads: number;
}

export function MarketPage() {
  const { user } = useAuth();
  const { isAdmin } = useProfile();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    client.api.fetch("/api/public/market")
      .then(r => r.json())
      .then(setListings)
      .finally(() => setLoading(false));
  }, []);

  const categories = [...new Set(listings.map(l => l.category).filter(Boolean))];

  const filtered = filter
    ? listings.filter(l => l.category === filter)
    : listings;

  if (loading) return <div className="p-8">加载中...</div>;

  return (
    <div className="h-screen flex flex-col">
      <TopNav user={user} isAdmin={isAdmin} />
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-xl font-medium mb-4">工具市场</h1>

          {categories.length > 0 && (
            <div className="flex gap-2 mb-4">
              <button onClick={() => setFilter("")} className={`px-3 py-1 rounded text-xs ${!filter ? "bg-blue-600 text-white" : "bg-neutral-100"}`}>全部</button>
              {categories.map(c => (
                <button key={c} onClick={() => setFilter(c)} className={`px-3 py-1 rounded text-xs ${filter === c ? "bg-blue-600 text-white" : "bg-neutral-100"}`}>{c}</button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(l => (
              <a
                key={l.id}
                href={l.type === "url" ? l.url : `https://${l.url}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-4 bg-white border rounded hover:shadow transition-shadow"
              >
                <div className="font-medium text-sm mb-1">{l.title}</div>
                <div className="text-xs text-neutral-400 mb-2 line-clamp-2">{l.description}</div>
                <div className="flex items-center justify-between text-xs text-neutral-300">
                  <span>{l.category}</span>
                  <span>{l.type === "url" ? "外部链接" : "Smart 工具"}</span>
                </div>
              </a>
            ))}
          </div>

          {filtered.length === 0 && (
            <p className="text-neutral-400 text-sm">暂无工具</p>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

---

### Task 13: Frontend — Admin page

**Files:**
- Create: `web/src/pages/AdminPage.tsx`

Admin page with tabs for: pending review queue, add global skill, add global MCP, add external URL tool.

- [ ] **Step 1: Create AdminPage**

```typescript
import { useEffect, useState } from "react";
import { TopNav } from "@/components/layout/TopNav";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { client } from "@/lib/edgespring";

// Redirect non-admin users

export function AdminPage() {
  const { user } = useAuth();
  const { isAdmin } = useProfile();
  const [tab, setTab] = useState("review");
  // ... tabbed UI with:
  // Tab 1 "审核": pending listings with approve/reject buttons
  // Tab 2 "外部链接": form to add URL tool to market
  // Tab 3 "全局 Skill": form to upload global skill
  // Tab 4 "全局 MCP": form to add global MCP

  if (!isAdmin) return <div className="p-8">无权限访问</div>;
  // ... render tabs + forms
}
```

Full implementation with all 4 tabs, API calls for each action, and proper loading states.

- [ ] **Step 2: Commit**

---

### Task 14: Typecheck, deploy, verify

- [ ] **Step 1: Typecheck server and web**

```bash
cd server && npx tsc --noEmit
cd ../web && npx tsc --noEmit
```

- [ ] **Step 2: Deploy**

```bash
edgespark deploy
```

- [ ] **Step 3: Manual verification**

- Visit /skills — upload a skill, toggle, delete
- Visit /mcps — add an MCP, toggle, delete
- Visit /market — browse listings
- Visit /admin — review pending, add URL tool
- Set userProfiles.role = "admin" for admin user

- [ ] **Step 4: Commit any final fixes**
