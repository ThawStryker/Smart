# Unified TopNav & Logo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract a shared `<Logo />` component, unify TopNav as the single navbar across Landing and authenticated pages, with auth-adaptive menus.

**Architecture:** New `Logo.tsx` component with BoltIcon inline. `TopNav.tsx` gains unauthenticated mode (logo + login button only). `LandingPage.tsx` drops its inline navbar and uses `<TopNav />`. `LoginPage.tsx` swaps its blue-square logo for `<Logo />`.

**Tech Stack:** React, TypeScript, Tailwind CSS, react-router-dom

---

### Task 1: Create shared `<Logo />` component

**Files:**
- Create: `web/src/components/layout/Logo.tsx`

- [ ] **Step 1: Write the Logo component**

```tsx
const BoltIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
  </svg>
);

interface LogoProps {
  className?: string;
}

export function Logo({ className }: LogoProps) {
  return (
    <div className={`flex items-center gap-2.5 cursor-pointer select-none ${className ?? ""}`}>
      <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm shadow-indigo-200">
        <BoltIcon />
      </div>
      <span className="font-bold text-lg tracking-tight text-neutral-900">Smart</span>
    </div>
  );
}
```

- [ ] **Step 2: Verify file compiles**

```bash
cd web && npx tsc --noEmit src/components/layout/Logo.tsx 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add web/src/components/layout/Logo.tsx
git commit -m "feat: add shared Logo component"
```

---

### Task 2: Update TopNav with Logo, new order, and unauthenticated mode

**Files:**
- Modify: `web/src/components/layout/TopNav.tsx`

- [ ] **Step 1: Rewrite TopNav.tsx**

Replace the entire file content with:

```tsx
import { useNavigate, useLocation } from "react-router-dom";
import { client } from "@/lib/edgespark";
import { useTheme } from "@/hooks/useTheme";
import type { AuthUser } from "@edgespark/web";
import { Logo } from "@/components/layout/Logo";

interface TopNavProps {
  user?: AuthUser | null;
  isAdmin?: boolean;
}

const navItems = [
  { label: "Work", path: "/work" },
  { label: "Coding", path: "/dashboard" },
  { label: "Skill", path: "/skills" },
  { label: "MCP", path: "/mcps" },
];

export function TopNav({ user, isAdmin }: TopNavProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggle } = useTheme();

  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-neutral-100 px-6 h-14 flex items-center justify-between">
      <div className="flex items-center gap-10">
        <div onClick={() => navigate("/")}>
          <Logo />
        </div>
        {user && (
          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path || (item.path === "/dashboard" && location.pathname.startsWith("/project"));
              return (
                <button
                  key={item.label}
                  onClick={() => navigate(item.path)}
                  className={`relative px-3 py-1.5 text-[13px] rounded-md transition-all duration-200 ${
                    isActive
                      ? "text-neutral-900 font-medium bg-neutral-100"
                      : "text-neutral-400 hover:text-neutral-600 hover:bg-neutral-50"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
        )}
      </div>
      <div className="flex items-center gap-2">
        {!user ? (
          <button onClick={() => navigate("/login")} className="text-[13px] text-neutral-400 hover:text-neutral-600 transition-colors px-3 py-1.5 rounded-md hover:bg-neutral-50">
            登录
          </button>
        ) : (
          <>
            <button onClick={toggle}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-all duration-200 hover:scale-110"
              style={{ background: "var(--app-surface-alt)", color: "var(--app-text-secondary)" }}
              title={theme === "light" ? "Switch to dark" : "Switch to light"}>
              {theme === "light" ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
              )}
            </button>
            <button onClick={() => navigate("/market")} className="text-[13px] text-neutral-400 hover:text-neutral-600 transition-colors px-3 py-1.5 rounded-md hover:bg-neutral-50">
              工具市场
            </button>
            {isAdmin && (
              <button onClick={() => navigate("/admin")} className="text-[13px] text-amber-600 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-md transition-colors font-medium">
                管理
              </button>
            )}
            {user?.name && (
              <span className="text-[13px] text-neutral-400 ml-1">{user.name}</span>
            )}
            <button onClick={() => client.auth.signOut()} className="text-[13px] text-neutral-400 hover:text-red-500 transition-colors px-2 py-1.5 rounded-md hover:bg-red-50 ml-1">
              退出
            </button>
          </>
        )}
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add web/src/components/layout/TopNav.tsx
git commit -m "feat: use shared Logo, reorder nav to Work/Coding/Skill/MCP, add unauthenticated mode"
```

---

### Task 3: Update LandingPage to use TopNav

**Files:**
- Modify: `web/src/pages/LandingPage.tsx`

- [ ] **Step 1: Apply changes to LandingPage.tsx**

Three edits needed:

**Edit 1:** Replace imports (lines 1-6) — remove `useProfile`, add `TopNav`:

```tsx
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { client } from "@/lib/edgespark";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { TopNav } from "@/components/layout/TopNav";
```

**Edit 2:** Remove `const { isAdmin } = useProfile();` (line 42)

**Edit 3:** Replace the header block (lines 64-94) with `<TopNav user={user} />`:

Remove:
```tsx
      {/* Nav */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-neutral-200 shrink-0 bg-white/80 backdrop-blur-sm shadow-sm">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 flex items-center justify-center shadow-md shadow-indigo-200">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          </div>
          <span className="font-bold text-lg bg-gradient-to-r from-indigo-500 to-violet-600 bg-clip-text text-transparent">Smart</span>
        </div>
        <div className="flex items-center gap-4">
          {!authLoading && (
            user ? (
              <>
                {isAdmin && (
                  <button onClick={() => navigate("/admin")} className="text-sm bg-amber-50 text-amber-600 px-3 py-1.5 rounded-lg hover:shadow-sm hover:shadow-amber-100 transition-all">
                    管理
                  </button>
                )}
                <span className="text-sm text-neutral-600 font-medium px-3 py-1.5 bg-neutral-50 rounded-lg">
                  {user.name}
                </span>
                <button onClick={() => client.auth.signOut()} className="text-sm text-neutral-600 hover:text-red-500 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-50">
                  退出
                </button>
              </>
            ) : (
              <button onClick={() => navigate("/login")} className="text-sm text-neutral-600 hover:text-amber-600 transition-colors">
                登录
              </button>
            )
          )}
        </div>
      </header>
```

Add in its place:
```tsx
      <TopNav user={user} />
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/LandingPage.tsx
git commit -m "feat: use shared TopNav in Landing page instead of inline navbar"
```

---

### Task 4: Update LoginPage to use shared Logo

**Files:**
- Modify: `web/src/pages/LoginPage.tsx`

- [ ] **Step 1: Apply changes to LoginPage.tsx**

**Edit 1:** Add Logo import after the edgespark import:
```tsx
import { Logo } from "@/components/layout/Logo";
```

**Edit 2:** Replace the inline logo (lines 18-22):
```tsx
        <div className="flex items-center gap-2 mb-6 justify-center">
          <div className="w-10 h-10 rounded bg-blue-600 flex items-center justify-center">
            <span className="text-white text-xl font-bold">S</span>
          </div>
          <span className="font-bold text-2xl">Smart</span>
        </div>
```

With:
```tsx
        <div className="flex justify-center mb-6">
          <Logo />
        </div>
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/LoginPage.tsx
git commit -m "feat: use shared Logo component in Login page"
```

---

### Task 5: Final verification

- [ ] **Step 1: Full type check**

```bash
cd web && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 2: Build check**

```bash
cd web && npm run build 2>&1 | tail -20
```

Expected: build succeeds.
