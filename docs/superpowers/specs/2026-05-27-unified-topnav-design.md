# Unified TopNav & Logo

## Problem

Landing page (`/`) and authenticated pages (`/dashboard`, `/work`, etc.) each render their own independent navbar with slightly different logo styling. When users navigate between them, React Router does a full component unmount/mount, causing a visible "jump" and logo flicker.

Additionally, `LoginPage` has a third logo variant (blue square + "S") that's inconsistent.

## Solution

Extract a shared `<Logo />` component and make `TopNav` the single navbar for all pages. `TopNav` adapts its menu based on auth state.

## Changes

### 1. New: `web/src/components/layout/Logo.tsx`

Shared `<Logo />` component — unified styling from both current implementations:
- Icon: `w-8 h-8 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600` with white BoltIcon inside
- Text: `font-bold text-lg text-neutral-900` (solid color, not gradient — cleaner and consistent with the TopNav look)
- Includes the BoltIcon SVG inline
- Props: `className?` for optional overrides

### 2. Modify: `web/src/components/layout/TopNav.tsx`

- Replace inline logo with `<Logo />`
- Nav order: **Work → Coding → Skill → MCP**
- When `user` is null/undefined: hide all nav items, hide theme toggle, hide "工具市场", hide admin/username/signout. Show only Logo (left) + "登录" button (right, linking to `/login`)
- When `user` is present: current behavior (all nav items + right-side controls)
- `user` prop already exists and is optional

### 3. Modify: `web/src/pages/LandingPage.tsx`

- Remove the entire inline `<header>` navbar (lines 64-94)
- Import and render `<TopNav />` at the top
- Pass `user` from existing `useAuth()` hook
- Keep hero, tool grid, and footer unchanged
- Remove unused `isAdmin` logic from the old navbar (TopNav handles it)
- `client` import can be removed if no longer used directly

### 4. Modify: `web/src/pages/LoginPage.tsx`

- Replace the inline logo (blue "S" square) with `<Logo />`
- Adjust sizing if needed

## Files affected

| File | Change |
|---|---|
| `web/src/components/layout/Logo.tsx` | New |
| `web/src/components/layout/TopNav.tsx` | Modify |
| `web/src/pages/LandingPage.tsx` | Modify |
| `web/src/pages/LoginPage.tsx` | Modify |

## Routes unchanged

No route changes needed. Landing stays at `/`, auth pages stay under `AppLayout`.

## Verification

- Landing page: TopNav shows Logo only + "登录" button
- Login page: centered Logo (no TopNav, no change to layout)
- Dashboard/Work/etc: full TopNav with Logo + nav items (Work, Coding, Skill, MCP) + user controls
- Navigate Landing → Dashboard: TopNav remains mounted (same DOM), only content below changes — no logo flicker
