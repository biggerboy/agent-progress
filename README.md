# agent-progress / 「干到哪了」

Local, **read-only** web board for people who dropped Jira/Linear and only use coding agents.

本地、**只读** 的进度看板：给你已经不用 Jira/Linear、只靠 coding agent 干活的人看「现在干到哪了」。

## One-liner

Cross-tool columns: 待做 / 进行中 / 完成 / 阻塞, plus evidence of which file each card came from.

四个列：待做 / 进行中 / 完成 / 阻塞；点开卡片能看到来源路径（证据）。

## Security

- Process binds **127.0.0.1 only** (never `0.0.0.0`). Loopback web, no accounts, no cloud sync.
- Filesystem access is **read-only**. The app never writes back to Claude tasks, Cursor plans, or Codex sessions.
- 只监听本机回环地址；只读磁盘；没有账号、没有同步、没有写回。

## Run

Requires Node.js 20+ (Bun works too: `bun start`).

```bash
npm start
# or
bun start
```

Then open http://127.0.0.1:4173/

If `~/.claude/tasks` is missing, `start` automatically serves `fixtures/` so the four statuses are visible. Force fixtures:

```bash
npm start -- --fixtures
# AGENT_PROGRESS_USE_FIXTURES=1 npm start
```

Tests:

```bash
npm test
```

## Directories that are read

| Priority | Source | Default path | Override |
|----------|--------|----------------|----------|
| P0 required | Claude Code Tasks | `~/.claude/tasks/{listId}/*.json` (Windows: `%USERPROFILE%\.claude\tasks`) | `CLAUDE_CONFIG_DIR`, `AGENT_PROGRESS_CLAUDE_TASKS` |
| P1 optional | Cursor plans | `~/.cursor/plans/` and `<workspace>/.cursor/plans/` | `CURSOR_HOME`, `AGENT_PROGRESS_CURSOR_PLANS`, `AGENT_PROGRESS_WORKSPACE` |
| P2 meta only | Codex sessions | `$CODEX_HOME/sessions` (default `~/.codex/sessions`) | `CODEX_HOME`, `CODEX_SESSIONS_DIR` |

Also honored: `HOME` / `%USERPROFILE%`, `%APPDATA%` (Windows home fallback), `AGENT_PROGRESS_PORT` (default `4173`). `AGENT_PROGRESS_HOST=0.0.0.0` is ignored and forced back to `127.0.0.1`.

Claude layout: `{listId}/1.json` plus optional `.lock`, `.highwatermark` (skipped). Status `pending|in_progress|completed`; non-empty `blockedBy` whose blockers are not completed → board status `blocked`.

Cursor plans are a **read-only plan layer** (Markdown / `.plan.md`). If the folders are absent, the board continues with Claude only.

Codex is **session meta only** (recent id / cwd / path). It is **not** a task-status source and never appears as a fake kanban card.

## Validate two-week self-use

用两周真实工作检验，而不是一次 demo：

1. 每天 `npm start`，确认只开了 `127.0.0.1`，刷新后卡片会跟着 Claude task 文件变。
2. 在 Claude Code 里建一个 list：pending、in_progress、completed，再加一条 `blockedBy` 指向未完成任务 —— 四个列都该有货。把 blocker 标完成，被挡的卡片应回到「待做」。
3. 放一份 Cursor `.plan.md` 到 `~/.cursor/plans/` 或仓库 `.cursor/plans/`，看板多一条 plan 层卡片；删掉目录应优雅降级，不崩。
4. 如果本机有 Codex，底部只出现会话 cwd，不进四列。没有 Codex 就隐藏该块。
5. 不要期待写回、派活、调度、权限、多人协作 —— 那些都是 non-goals。两周后如果还是「打开就能知道 agent 干到哪了」，MVP 就算站住了。

English checklist: run daily on loopback; create real Claude tasks covering all four statuses and watch `blockedBy`; drop a Cursor plan and confirm absence degrades; Codex stays meta-only; do not expect write-back or agent dispatch.

## Non-goals

- Write back to Claude / Cursor / Codex
- Dispatch work to agents / invoke CLIs
- Live session monitoring wall
- Full PM (scheduling, permissions, people)
- Electron, IDE plugin, TUI, auto-open-browser

## Layout

```
packages/adapters/claude-tasks
packages/adapters/cursor-plans
packages/adapters/codex-sessions
packages/normalize
apps/web
fixtures/
```
