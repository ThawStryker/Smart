# Phase 4 Design: Skills / MCPs / 工具市场

## Overview

Add three features to Smart: Skills management, MCPs management, and a tool marketplace with admin review.

## Database

### New: `skills`

| Column | Type | Notes |
|--------|------|-------|
| id | integer PK autoincrement | |
| name | text not null | Display name |
| description | text | |
| visibility | text not null default "private" | `"global"` or `"private"` |
| ownerId | text not null | Uploader userId |
| sourceType | text not null | `"zip"` or `"git"` |
| sourceUrl | text | Git URL (empty for zip) |
| storagePath | text not null | R2 directory path after extraction |
| enabled | boolean default true | |
| createdAt | text | |
| updatedAt | text | |

### New: `mcps`

| Column | Type | Notes |
|--------|------|-------|
| id | integer PK autoincrement | |
| name | text not null | Display name |
| description | text | |
| visibility | text not null default "private" | `"global"` or `"private"` |
| ownerId | text not null | Uploader userId |
| config | text | JSON: `{ type, command, url, env }` |
| enabled | boolean default true | |
| createdAt | text | |
| updatedAt | text | |

### Modify: `market_listings` (add 3 columns)

| New Column | Type | Notes |
|------------|------|-------|
| type | text default "tool" | `"tool"` or `"url"` |
| url | text | External URL when type="url" |
| version | integer default 1 | Increment on update |

Existing columns unchanged: id, toolId, sellerId, title, description, price, category, downloads, ratingAvg, status, createdAt.

### No migration needed for userProfiles

`userProfiles.role` already exists. Set to `"admin"` for admin users.

## API

### Skills (protected, `/api/skills`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List: own private + all global skills |
| POST | `/` | Upload skill (multipart: zip file OR JSON: { gitUrl, name, description }) |
| PATCH | `/:id` | Update name/description/enabled |
| DELETE | `/:id` | Delete skill + R2 files |

### MCPs (protected, `/api/mcps`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List: own private + all global MCPs |
| POST | `/` | Add MCP: JSON { name, description, config } |
| PATCH | `/:id` | Update name/description/config/enabled |
| DELETE | `/:id` | Delete MCP |

### Market (public + protected)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/public/market` | Public | Browse approved listings |
| GET | `/api/public/market/:id` | Public | Single listing detail |
| POST | `/api/projects/:pid/publish` | Protected | Publish project to market |
| POST | `/api/market/:id/update` | Protected | Push update (owner only, no re-review) |

### Admin (protected, `/api/admin`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/market/pending` | List pending-review listings |
| POST | `/market/:id/approve` | Approve listing |
| POST | `/market/:id/reject` | Reject listing |
| POST | `/market/url` | Add external URL tool { title, description, url, category } |
| POST | `/skills` | Upload global skill (same body as user upload) |
| POST | `/mcps` | Add global MCP |
| GET | `/users` | List all users (for role management, future) |

### Auth middleware for admin routes

Simple check: `userProfiles.role === "admin"`. If not, return 403.

## Frontend Pages

### Skills management (`/skills`)
- List: name, description, visibility, enabled toggle, source type
- Upload: zip file upload OR git URL input
- Delete with confirmation
- Global skills shown with "global" badge
- Edit name/description inline

### MCPs management (`/mcps`)
- Same structure as skills
- Add: form with name, description, config JSON editor
- List with enable/disable toggle

### Tool market (`/market`)
- Public page, no auth required
- Grid of cards: title, description, category, author, downloads
- Click card: if type="tool" → open deployed URL; if type="url" → open external URL
- Search/filter by category

### Admin page (`/admin`)
- Accessible only if userProfiles.role === "admin"
- Tab 1: Pending review queue — list pending listings, approve/reject buttons
- Tab 2: Upload global skill — same form as skills page but visibility forced to "global"
- Tab 3: Add global MCP
- Tab 4: Add external URL tool to market — form: title, description, url, category

### TopNav updates
- Make Skills, MCPs, 工具市场 links functional (currently href="#")
- Add "管理" link visible to admin users
- Remove dead links: 任务, Agents, Bots, AI工具

## Storage Layout

```
R2 tool-sources:
  skills/{skillId}/
    SKILL.md
    scripts/...
    docs/...
```

## Agent Integration (future)

- System Prompt includes enabled skills/MCPs list
- Agent invokes skills via `/skillname` format
- MCP connections initialized from config JSON
- This is spec-only for now; implementation deferred

## Implementation Order

1. Database: add skills/mcps tables, alter market_listings
2. Server: admin middleware, skills CRUD, mcps CRUD, market endpoints
3. Frontend: skills page → mcps page → market page → admin page
4. Deploy & verify
