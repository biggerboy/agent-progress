import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isTruthyEnv } from "../../../packages/normalize/home.js";
import {
  defaultClaudeTasksRoot,
  loadClaudeTasks,
} from "../../../packages/adapters/claude-tasks/index.js";
import {
  defaultCursorPlanDirs,
  loadCursorPlans,
} from "../../../packages/adapters/cursor-plans/index.js";
import {
  defaultCodexSessionsRoot,
  loadCodexSessions,
} from "../../../packages/adapters/codex-sessions/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, "../../..");
export const FIXTURES_ROOT = path.join(REPO_ROOT, "fixtures");

/**
 * @param {string} dir
 */
export async function dirExists(dir) {
  try {
    const st = await fs.stat(dir);
    return st.isDirectory();
  } catch {
    return false;
  }
}

/**
 * @param {object} [opts]
 * @param {string[]} [opts.argv]
 * @param {NodeJS.ProcessEnv} [opts.env]
 * @param {string} [opts.cwd]
 */
export async function resolveSources({
  argv = process.argv.slice(2),
  env = process.env,
  cwd = process.cwd(),
} = {}) {
  const forceFixtures =
    argv.includes("--fixtures") || isTruthyEnv(env.AGENT_PROGRESS_USE_FIXTURES);

  const workspace =
    env.AGENT_PROGRESS_WORKSPACE || cwd;

  const realClaude = defaultClaudeTasksRoot(env);
  const realClaudePresent = await dirExists(realClaude);
  const useClaudeFixtures = forceFixtures || !realClaudePresent;

  const claudeRoot = useClaudeFixtures
    ? path.join(FIXTURES_ROOT, "claude", "tasks")
    : realClaude;

  const realCursorDirs = defaultCursorPlanDirs({ env, workspace });
  const fixtureCursorDirs = [
    path.join(FIXTURES_ROOT, "cursor", "plans"),
    path.join(FIXTURES_ROOT, "workspace", ".cursor", "plans"),
  ];
  const cursorDirs = [];
  if (useClaudeFixtures || forceFixtures) {
    cursorDirs.push(...fixtureCursorDirs);
  }
  if (!forceFixtures) {
    for (const dir of realCursorDirs) {
      if (await dirExists(dir)) cursorDirs.push(dir);
    }
  }

  const realCodex = defaultCodexSessionsRoot(env);
  const realCodexPresent = await dirExists(realCodex);
  const useCodexFixtures = forceFixtures || (useClaudeFixtures && !realCodexPresent);
  const codexRoot = useCodexFixtures
    ? path.join(FIXTURES_ROOT, "codex", "sessions")
    : realCodex;

  return {
    claudeRoot,
    cursorDirs: [...new Set(cursorDirs)],
    codexRoot,
    workspace,
    usingFixtures: useClaudeFixtures,
    forceFixtures,
    realClaudePresent,
    watchDirs: [claudeRoot, ...cursorDirs, useCodexFixtures || realCodexPresent ? (useCodexFixtures ? path.join(FIXTURES_ROOT, "codex", "sessions") : realCodex) : null].filter(Boolean),
    meta: {
      claudeRoot,
      claudeMode: useClaudeFixtures ? "fixtures" : "real",
      realClaudePath: realClaude,
      realClaudePresent,
      cursorDirs,
      codexRoot,
      codexMode: useCodexFixtures ? "fixtures" : "real",
      workspace,
    },
  };
}

/**
 * @param {Awaited<ReturnType<typeof resolveSources>>} sources
 */
export async function loadBoard(sources) {
  const [claude, cursor, codex] = await Promise.all([
    loadClaudeTasks(sources.claudeRoot),
    loadCursorPlans(sources.cursorDirs),
    loadCodexSessions(sources.codexRoot),
  ]);

  const items = [...claude.items, ...cursor.items].sort(sortItems);
  return {
    items,
    sessions: codex.sessions,
    generatedAt: new Date().toISOString(),
    meta: {
      ...sources.meta,
      counts: {
        items: items.length,
        sessions: codex.sessions.length,
        byStatus: countByStatus(items),
        byTool: countByTool(items),
      },
      errors: [...claude.errors, ...cursor.errors, ...codex.errors],
    },
  };
}

/**
 * @param {import('../../../packages/normalize/index.js').Item[]} items
 */
function countByStatus(items) {
  /** @type {Record<string, number>} */
  const counts = { pending: 0, in_progress: 0, completed: 0, blocked: 0 };
  for (const item of items) counts[item.status] = (counts[item.status] || 0) + 1;
  return counts;
}

/**
 * @param {import('../../../packages/normalize/index.js').Item[]} items
 */
function countByTool(items) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const item of items) {
    counts[item.source.tool] = (counts[item.source.tool] || 0) + 1;
  }
  return counts;
}

/**
 * @param {import('../../packages/normalize/index.js').Item} a
 * @param {import('../../packages/normalize/index.js').Item} b
 */
function sortItems(a, b) {
  const ta = a.updatedAt || "";
  const tb = b.updatedAt || "";
  if (ta !== tb) return tb.localeCompare(ta);
  return a.title.localeCompare(b.title);
}
