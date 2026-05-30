---
name: comet
description: "Comet — OpenSpec + Superpowers 双星开发工作流。使用 /comet 自动检测阶段并分发到子命令。五个阶段：open → design → build → verify → archive。"
---

# Comet — OpenSpec + Superpowers 双星开发工作流

OpenSpec 和 Superpowers 像双星系统一样围绕同一目标运行。

```
OpenSpec handles WHAT  — 大纲、提案、规格生命周期、归档
Superpowers handles HOW — 技术设计、规划、执行、收尾
```

**核心原则：brainstorming 不可跳过。每个变更都必须经过深度设计（hotfix 和 tweak 预设除外）。**

---

## 决策核心

Agent 只需阅读本节即可进行决策。需要时参考附录。

### 自动阶段检测

**Step 0: 活动变更发现与意图检测**

1. 首先检测预设；如果匹配 hotfix/tweak，直接调用对应的预设技能，不进入正常的 open 分支
2. 无预设匹配时，运行 `openspec list --json` 获取所有活动变更

**预设检测优先级最高**：
- 用户明确描述 bug 修复 / hotfix + 符合 hotfix 条件 → 直接调用 `/comet-hotfix`
- 用户明确描述文案/配置/文档/提示小调整 + 符合 tweak 条件 → 直接调用 `/comet-tweak`
- 无预设匹配 → 按下表处理

| 活动变更 | 用户输入 | 行为 |
|----------------|------------|----------|
| 无 | 非预设输入 | → 调用 `/comet-open` |
| 恰好 1 个 | `/comet <描述>` | → **询问**：继续此变更还是创建新变更 |
| 多个 | `/comet <描述>` | → **询问**：继续已有还是创建新变更；如继续，列出变更供选择 |
| 恰好 1 个 | `/comet` 无描述 | → 自动选择，进入 Step 1 |
| 多个 | `/comet` 无描述 | → 列出变更供用户选择 |

<IMPORTANT>
当用户选择"创建新变更"时，**必须调用 `/comet-open`**。不要直接调用 `/opsx:new`。
`/comet-open` 执行双重初始化：OpenSpec 产物（由内部 `/opsx:new` 创建）加上 `.comet.yaml` 状态文件。
直接调用 `/opsx:new` 会缺少 `.comet.yaml`，导致后续阶段检测失败。
</IMPORTANT>

**Step 1: 读取 `.comet.yaml` 状态元数据**

优先读取 `openspec/changes/<name>/.comet.yaml`。如果不可用，回退到 `openspec status --change "<name>" --json`、`tasks.md` 和 `docs/superpowers/` 文件检查。

**恢复规则**：
- 每次上下文恢复时，重新运行 Step 0 和 Step 1；不要信任对话历史中的阶段检测结果
- 如果有活动变更且工作树有未提交更改，通过 `comet/reference/dirty-worktree.md` 处理。该协议定义了检查、归属和禁止项；本文不重复
- 如果 `phase: build`，首先检查 `build_mode` 和 `isolation` 是否已设置；如有字段未设置，返回 `/comet-build` 对应步骤补充后再执行；如两者均已设置，从 tasks.md 读取下一个未勾选任务并继续
- 如果 `phase: verify` 且 `verify_result: fail`，进入验证失败决策阻断点：暂停并询问用户是修复还是接受偏差；仅在用户选择修复后，运行 `bash "$COMET_STATE" transition <name> verify-fail` 并调用 `/comet-build`
- 如果 `phase: open` 但 proposal/design/tasks 已完成，先运行 `bash "$COMET_GUARD" <change-name> open --apply` 修复状态，再继续检测
- 如果 `phase: archive`，仅调用 `/comet-archive`；归档成功后变更将移至归档目录，因此不要对旧的活动目录运行 guard

**Step 2: 阶段判定**（按顺序检查，首次匹配即生效）

1. `archived: true` 或变更已移至归档 → 工作流完成
2. `verify_result: pass` 且 `archived` 不为 `true` → 调用 `/comet-archive`
3. `verify_result: fail` → 进入验证失败决策阻断点（暂停并询问修复或接受偏差；仅在用户选择修复后，运行 `verify-fail` 然后 `/comet-build`）
4. `phase: verify` 或 tasks.md 全部勾选 → 调用 `/comet-verify`
5. `phase: build` 或有 Design Doc 但计划/执行未完成 → 按工作流路由：`hotfix` → `/comet-hotfix`，`tweak` → `/comet-tweak`，`full` → `/comet-build`
6. `phase: design` 或有变更但无 Design Doc → 调用 `/comet-design`
7. `phase: open` 或活动变更存在但 `.comet.yaml` 缺失 → 调用 `/comet-open`
8. 无活动变更 → 调用 `/comet-open`

如果元数据与文件状态冲突，以可验证的文件状态为事实来源，先修正 `.comet.yaml` 再继续。

### 预设升级条件

**hotfix → full**（满足任一条件即升级）：
- 变更涉及 **3+ 个文件**
- 架构变更（新模块、新接口、新依赖）
- 数据库 schema 变更
- 修复引入了新的公共 API
- 修复范围超出单个函数/模块

**tweak → full**（满足任一条件即升级）：
- 变更涉及 **5+ 个文件**
- 需要跨模块协调
- 需要 **5+** 个新测试用例
- 配置项的添加或删除（非值变更）

### 错误处理快速参考

| 场景 | 处理方式 |
|----------|----------|
| `openspec list --json` 失败 | 检查 openspec 是否安装，提示用户运行 `openspec init` |
| 子技能不可用 | 停止工作流，提示安装或启用对应技能 |
| `.comet.yaml` 格式错误或缺失 | 以文件状态为事实来源，用 `bash $COMET_STATE set` 修正后继续 |
| 构建/测试失败 | 返回 build 阶段修复，不要进入 verify |
| 变更目录结构不完整 | 按 `comet-open` 产物要求补全缺失文件 |

### 阶段流转

<IMPORTANT>
单次 `/comet` 调用从检测到的阶段开始，在满足退出条件时前进到下一阶段。

流程链：open → design → build → verify → archive

**连续执行要求**：从检测到的阶段开始，agent 自动继续执行所有后续阶段。但**自动推进仅适用于无用户决策的流转点**。遇到用户决策点时，**必须使用 AskUserQuestion 工具暂停并等待用户的明确回复**。不得使用推荐规则、默认值或历史偏好代替用户确认，也不得仅输出文本提示后继续执行。

**决策点即阻断点**：每当到达以下任一节点时，当前 `/comet` 调用必须停止，**使用 AskUserQuestion 工具等待用户选择**。仅在用户明确选择后，才能写入对应状态字段并执行操作，然后恢复自动推进。

需要用户参与的节点（仅在这些节点暂停）：
1. Open 阶段 proposal/design/tasks 审核确认
2. Brainstorming 过程中确认设计方案
3. Build 阶段选择工作流配置（隔离方式 + 执行方式，单次交互）
4. Verify 失败时决定修复或接受偏差（包括 Spec 漂移处理）
5. Finishing-branch 选择分支处理方式
6. 遇到升级条件（hotfix/tweak → full 工作流）
7. Build 阶段范围扩展需要重新设计或拆分为新变更

Agent 不应跳过这些决策点；其他无歧义的阶段流转必须自动进行，不得中途退出。在决策点处，**文本输出不得替代工具等待 — 必须通过 AskUserQuestion 明确获取用户选择后才能继续**。

**红旗信号** — 当以下想法出现时，立即停止并检查：

| Agent 想法 | 实际风险 |
|--------------|-------------|
| "用户大概率会同意这个方案" | 不能替用户决定 — 使用 AskUserQuestion |
| "这只是个小改动，不需要确认" | 决策点没有大小豁免 — 阻断点必须等待 |
| "用户上次选了 A，这次也选 A" | 历史偏好不能替代当前确认 |
| "我已经解释了方案，用户没反对" | 未反对 ≠ 同意 — 必须用工具获取明确选择 |
| "流程已经走到这了，应该没问题" | 验证未通过 ≠ 通过 — 检查 verify_result |
</IMPORTANT>

---

## 子命令快速参考

| 命令 | 阶段 | 负责方 | 产物 |
|---------|-------|-------|-----------|
| `/comet-open` | 1. Open | OpenSpec | proposal.md, design.md, tasks.md |
| `/comet-design` | 2. Deep Design | Superpowers | Design Doc, delta spec |
| `/comet-build` | 3. Plan and Build | Superpowers | 实施计划, 代码提交 |
| `/comet-verify` | 4. Verify and Close | 双方 | 验证报告, 分支处理 |
| `/comet-archive` | 5. Archive | OpenSpec | delta→main spec 同步, design doc 标记, 归档 |
| `/comet-hotfix` | 预设路径 | 双方 | 快速修复（跳过 brainstorming） |
| `/comet-tweak` | 预设路径 | 双方 | 小改动（跳过 brainstorming 和完整计划） |

```
/comet
  ↓ 自动检测
/comet-open ──→ /comet-design ──→ /comet-build ──→ /comet-verify ──→ /comet-archive
  (OpenSpec)      (Superpowers)     (Superpowers)     (双方)          (OpenSpec)

/comet-hotfix (预设, 跳过 brainstorming)
  open ──→ build ──→ verify ──→ archive
    ↑ 如触发升级 → 阻断等待确认 → 补充 Design Doc → 返回 full 工作流

/comet-tweak (预设, 跳过 brainstorming 和完整计划)
  open ──→ 轻量 build ──→ 轻量 verify ──→ archive
    ↑ 如触发升级 → 阻断等待确认 → 补充 Design Doc → 返回 full 工作流
```

---

## 参考附录

### .comet.yaml 字段参考

```yaml
workflow: full
phase: build
design_doc: docs/superpowers/specs/YYYY-MM-DD-topic-design.md
plan: docs/superpowers/plans/YYYY-MM-DD-feature.md
base_ref: a1b2c3d4e5f6...
build_mode: subagent-driven-development
isolation: branch
verify_mode: light
verify_result: pending
verification_report: null
branch_status: pending
created_at: 2026-05-26
verified_at: null
archived: false
```

| 字段 | 含义 |
|-------|---------|
| `workflow` | `full`、`hotfix` 或 `tweak` |
| `phase` | 当前阶段：`open`、`design`、`build`、`verify`、`archive`（初始化统一设为 `open`，guard 处理流转） |
| `design_doc` | 关联的 Superpowers Design Doc 路径，可为空 |
| `plan` | 关联的 Superpowers Plan 路径，可为空 |
| `base_ref` | 初始化时记录的 Git 提交 SHA，用于规模评估。无 plan 时作为回退方案 |
| `build_mode` | 选择的执行方式，可为空 |
| `isolation` | `branch` 或 `worktree`，工作空间隔离方式。Full 工作流初始化时可留为 `null`，但仅在 `/comet-build` Step 3 之前；hotfix/tweak 默认为 `branch` |
| `verify_mode` | `light` 或 `full`，可为空 |
| `verify_result` | `pending`、`pass` 或 `fail` |
| `verification_report` | 验证报告文件路径；必须指向已存在的文件，verify 才能通过 |
| `branch_status` | `pending` 或 `handled`；分支处理完成后设为 `handled` |
| `created_at` | 变更创建日期（初始化时自动设置），格式 `YYYY-MM-DD` |
| `verified_at` | 验证通过时间，可为空 |
| `archived` | 变更是否已归档 |

可选字段：

| 字段 | 含义 |
|-------|---------|
| `direct_override` | `true`/`false`。Full 工作流仅在显式设为 `true` 时允许使用 `build_mode: direct` |
| `build_command` | 项目构建命令。Guard 优先运行此命令并输出失败信息 |
| `verify_command` | 项目验证命令。Verify guard 优先运行此命令；如未设置，回退到 build 命令 |

状态机硬约束：
- `build → verify` 之前，`isolation` 必须为 `branch` 或 `worktree`
- `build → verify` 之前，`build_mode` 必须已选择
- `build_mode: direct` 默认仅对 `hotfix` / `tweak` 允许；full 工作流需要 `direct_override: true`
- 这些约束由 `comet-guard.sh build --apply` 和 `comet-state.sh transition <name> build-complete` 共同强制执行

### 脚本位置

Comet 脚本分布在 `comet/scripts/` 中。**不要硬编码路径** — 定位一次，缓存到环境变量：

```bash
COMET_ENV="${COMET_ENV:-$(find . "$HOME"/.*/skills "$HOME/.config" "$HOME/.gemini" -path '*/comet/scripts/comet-env.sh' -type f -print -quit 2>/dev/null)}"
if [ -z "$COMET_ENV" ]; then
  echo "ERROR: comet-env.sh not found. Ensure the comet skill is installed." >&2
  return 1
fi
. "$COMET_ENV"

# Stop workflow when script location fails
if [ -z "$COMET_GUARD" ] || [ -z "$COMET_STATE" ] || [ -z "$COMET_HANDOFF" ] || [ -z "$COMET_ARCHIVE" ]; then
  echo "ERROR: Comet scripts not found. Ensure the comet skill is installed." >&2
  echo "Expected path pattern: */comet/scripts/comet-*.sh under project or platform skill directories" >&2
  return 1
fi
```

**自动状态更新**：Guard 支持 `--apply` 标志，检查通过后自动更新 `.comet.yaml` 状态字段：

```bash
bash "$COMET_GUARD" <change-name> <phase> --apply
```

`--apply` 委托给 `comet-state transition`。当需要直接表达状态变更时，使用这些语义事件：

```bash
bash "$COMET_STATE" transition <change-name> open-complete
bash "$COMET_STATE" transition <change-name> design-complete
bash "$COMET_STATE" transition <change-name> build-complete
bash "$COMET_STATE" transition <change-name> verify-pass
bash "$COMET_STATE" transition <change-name> verify-fail
bash "$COMET_STATE" transition <archive-name> archived
```

**归档脚本**：一条命令完成所有归档步骤：

```bash
bash "$COMET_ARCHIVE" <change-name>
```

加载 comet 后，agent 应运行上述变量赋值一次，然后在会话中复用 `$COMET_GUARD`、`$COMET_STATE`、`$COMET_HANDOFF`、`$COMET_ARCHIVE`。

### 文件结构

```
openspec/                              # OpenSpec — WHAT
├── config.yaml
├── changes/
│   ├── <name>/                        # 活动变更
│   │   ├── .openspec.yaml
│   │   ├── .comet.yaml
│   │   ├── proposal.md                # Why + What
│   │   ├── design.md                  # 高层架构决策
│   │   ├── specs/<capability>/spec.md # 增量能力规格
│   │   ├── .comet/handoff/            # 脚本生成的阶段交接包
│   │   └── tasks.md                   # 任务清单
│   └── archive/YYYY-MM-DD-<name>/     # 已归档
└── specs/<capability>/spec.md         # 主规格（归档时从 delta 覆写）

docs/superpowers/                      # Superpowers — HOW
├── specs/YYYY-MM-DD-<topic>-design.md # 设计文档（技术 RFC，归档时标记状态）
└── plans/YYYY-MM-DD-<feature>.md      # 实施计划（文件头包含变更关联元数据）
```

### 最佳实践

1. **brainstorming 不可跳过** — 每个变更都必须经过深度设计（hotfix 和 tweak 除外）
2. **delta spec 是活文档** — 在阶段 3 中自由修改，归档时同步
3. **交接包由脚本生成** — OpenSpec → Superpowers 上下文必须通过 `comet-handoff.sh` 生成为紧凑的可溯源摘录（需要时使用 `--full`），并由 guard 验证来源/哈希/模式
4. **保持 tasks.md 同步** — 完成每个任务后勾选
5. **频繁提交** — 每个任务一次提交，提交信息反映设计意图
6. **归档前先验证** — 仅在 `/comet-verify` 通过后执行 `/comet-archive`
7. **增量更新分类** — 小编辑、中度 brainstorming、大型新变更
8. **Plan 必须关联变更** — 文件头包含 `change:` 和 `design-doc:` 元数据
9. **归档闭合** — design doc 和 plan 必须标记 `archived-with` 状态
10. **修改已有功能** — 直接开新变更
11. **预设有限制** — hotfix/tweak 满足升级条件时及时切换到 full 工作流
