import fs from "node:fs/promises";
import path from "node:path";
import {
  applyBlocked,
  asExcerpt,
  asIsoTime,
  asStringArray,
  coerceStatus,
  toItem,
} from "../../normalize/index.js";
import { homeDir } from "../../normalize/home.js";

/**
 * Claude Code config root: CLAUDE_CONFIG_DIR, else ~/.claude
 * (Windows: %USERPROFILE%\.claude).
 * @param {NodeJS.ProcessEnv} [env]
 */
export function claudeConfigDir(env = process.env) {
  if (env.CLAUDE_CONFIG_DIR) return env.CLAUDE_CONFIG_DIR;
  if (env.AGENT_PROGRESS_CLAUDE_HOME) return env.AGENT_PROGRESS_CLAUDE_HOME;
  return path.join(homeDir(env), ".claude");
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function defaultClaudeTasksRoot(env = process.env) {
  if (env.AGENT_PROGRESS_CLAUDE_TASKS) return env.AGENT_PROGRESS_CLAUDE_TASKS;
  return path.join(claudeConfigDir(env), "tasks");
}

/**
 * Defensive parse: every field optional; unknown keys kept as rest.
 * @param {unknown} data
 */
export function parseClaudeTaskJson(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, reason: "not_object" };
  }
  const {
    id,
    subject,
    description,
    activeForm,
    status,
    blocks,
    blockedBy,
    ...rest
  } = /** @type {Record<string, unknown>} */ (data);

  return {
    ok: true,
    id: id == null ? undefined : String(id),
    subject: subject == null ? undefined : String(subject),
    description: description == null ? undefined : String(description),
    activeForm: activeForm == null ? undefined : String(activeForm),
    status: coerceStatus(status),
    blocks: asStringArray(blocks),
    blockedBy: asStringArray(blockedBy),
    rest,
  };
}

/**
 * @param {string} root
 */
export async function loadClaudeTasks(root) {
  /** @type {import('../../normalize/index.js').Item[]} */
  const items = [];
  const errors = [];

  let listEntries;
  try {
    listEntries = await fs.readdir(root, { withFileTypes: true });
  } catch (err) {
    const code = /** @type {NodeJS.ErrnoException} */ (err).code;
    if (code === "ENOENT") {
      return { items, errors, root, present: false };
    }
    throw err;
  }

  for (const entry of listEntries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;
    const listId = entry.name;
    const listDir = path.join(root, listId);
    const loaded = await loadList(listDir, listId);
    items.push(...loaded.items);
    errors.push(...loaded.errors);
  }

  return { items, errors, root, present: true };
}

/**
 * @param {string} listDir
 * @param {string} listId
 */
async function loadList(listDir, listId) {
  let files;
  try {
    files = await fs.readdir(listDir, { withFileTypes: true });
  } catch (err) {
    return {
      items: [],
      errors: [{ path: listDir, message: String(err) }],
    };
  }

  /** @type {Array<{ parsed: ReturnType<typeof parseClaudeTaskJson> & { ok: true }, filePath: string, updatedAt?: string }>} */
  const rows = [];
  const errors = [];

  for (const file of files) {
    if (!file.isFile()) continue;
    if (file.name.startsWith(".")) continue; // .lock, .highwatermark
    if (!file.name.endsWith(".json")) continue;
    const filePath = path.join(listDir, file.name);
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const data = JSON.parse(raw);
      const parsed = parseClaudeTaskJson(data);
      if (!parsed.ok) {
        errors.push({ path: filePath, message: parsed.reason });
        continue;
      }
      const st = await fs.stat(filePath);
      rows.push({
        parsed,
        filePath,
        updatedAt: asIsoTime(st.mtime),
      });
    } catch (err) {
      errors.push({ path: filePath, message: String(err) });
    }
  }

  const completedIds = new Set(
    rows
      .filter((row) => row.parsed.status === "completed")
      .map((row) => String(row.parsed.id ?? path.basename(row.filePath, ".json"))),
  );

  const items = rows.map((row) => {
    const fallbackId = path.basename(row.filePath, ".json");
    const taskId = row.parsed.id || fallbackId;
    const { status, blockedBy } = applyBlocked({
      status: row.parsed.status,
      blockedBy: row.parsed.blockedBy,
      completedIds,
    });
    const title =
      row.parsed.subject?.trim() ||
      row.parsed.activeForm?.trim() ||
      `Task ${taskId}`;
    const excerpt = asExcerpt(
      row.parsed.description || row.parsed.activeForm || Object.keys(row.parsed.rest).join(", "),
    );
    return toItem({
      id: `claude:${listId}:${taskId}`,
      title,
      status,
      blockedBy,
      source: { tool: "claude", path: row.filePath, listId },
      updatedAt: row.updatedAt,
      excerpt,
    });
  });

  return { items, errors };
}
