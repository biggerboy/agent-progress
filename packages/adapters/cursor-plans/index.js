import fs from "node:fs/promises";
import path from "node:path";
import { asExcerpt, asIsoTime, coerceStatus, toItem } from "../../normalize/index.js";
import { homeDir } from "../../normalize/home.js";

/**
 * Cursor user dir: CURSOR_HOME, else ~/.cursor (Windows: %USERPROFILE%\.cursor).
 * @param {NodeJS.ProcessEnv} [env]
 */
export function cursorHomeDir(env = process.env) {
  if (env.CURSOR_HOME) return env.CURSOR_HOME;
  if (env.AGENT_PROGRESS_CURSOR_HOME) return env.AGENT_PROGRESS_CURSOR_HOME;
  return path.join(homeDir(env), ".cursor");
}

/**
 * @param {object} [opts]
 * @param {NodeJS.ProcessEnv} [opts.env]
 * @param {string} [opts.workspace]
 */
export function defaultCursorPlanDirs({ env = process.env, workspace } = {}) {
  const dirs = [];
  if (env.AGENT_PROGRESS_CURSOR_PLANS) {
    dirs.push(env.AGENT_PROGRESS_CURSOR_PLANS);
  }
  dirs.push(path.join(cursorHomeDir(env), "plans"));
  if (workspace) {
    dirs.push(path.join(workspace, ".cursor", "plans"));
  }
  return [...new Set(dirs)];
}

/**
 * Lightweight frontmatter + checkbox parse. Unknown YAML is ignored.
 * @param {string} content
 */
export function parsePlanMarkdown(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const yaml = match ? match[1] : "";
  const body = match ? content.slice(match[0].length) : content;

  const name = scalar(yaml, "name");
  const overview = scalar(yaml, "overview");
  const todos = parseTodos(yaml);
  const checks = [...body.matchAll(/^\s*[-*]\s*\[([ xX])\]\s+(.*)$/gm)].map((m) => ({
    done: m[1].trim() !== "",
    text: m[2].trim(),
  }));
  const heading = body.match(/^#\s+(.+)$/m)?.[1]?.trim();

  return { name, overview, todos, checks, heading, body };
}

/**
 * @param {string[]} dirs
 */
export async function loadCursorPlans(dirs) {
  /** @type {import('../../normalize/index.js').Item[]} */
  const items = [];
  const errors = [];
  const seen = new Set();
  const presentDirs = [];

  for (const dir of dirs) {
    const files = await listPlanFiles(dir);
    if (files.present) presentDirs.push(dir);
    errors.push(...files.errors);
    for (const filePath of files.paths) {
      const key = path.resolve(filePath);
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        const raw = await fs.readFile(filePath, "utf8");
        const st = await fs.stat(filePath);
        items.push(planToItem(raw, filePath, st.mtime));
      } catch (err) {
        errors.push({ path: filePath, message: String(err) });
      }
    }
  }

  return { items, errors, dirs, presentDirs };
}

/**
 * @param {string} content
 * @param {string} filePath
 * @param {Date} mtime
 */
export function planToItem(content, filePath, mtime) {
  const parsed = parsePlanMarkdown(content);
  const title =
    parsed.name?.trim() ||
    parsed.heading ||
    path.basename(filePath).replace(/\.plan\.md$/i, "").replace(/\.md$/i, "");
  const statuses = [
    ...parsed.todos.map((t) => t.status),
    ...parsed.checks.map((c) => (c.done ? "completed" : "pending")),
  ].filter(Boolean);
  const status = aggregatePlanStatus(statuses);
  const excerpt = asExcerpt(
    parsed.overview ||
      parsed.todos.map((t) => t.content).filter(Boolean).join(" · ") ||
      parsed.body,
  );
  return toItem({
    id: `cursor-plan:${filePath}`,
    title,
    status,
    source: { tool: "cursor", path: filePath },
    updatedAt: asIsoTime(mtime),
    excerpt,
  });
}

/**
 * @param {Array<string | undefined>} statuses
 */
export function aggregatePlanStatus(statuses) {
  const mapped = statuses.map((s) => coerceStatus(s) || "pending");
  if (mapped.length === 0) return "pending";
  if (mapped.every((s) => s === "completed")) return "completed";
  if (mapped.some((s) => s === "blocked")) return "blocked";
  if (mapped.some((s) => s === "in_progress")) return "in_progress";
  return "pending";
}

/**
 * @param {string} yaml
 * @param {string} key
 */
function scalar(yaml, key) {
  const m = yaml.match(new RegExp(`^${key}\\s*:\\s*(.*)$`, "m"));
  if (!m) return undefined;
  let value = m[1].trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return value || undefined;
}

/**
 * @param {string} yaml
 */
function parseTodos(yaml) {
  const lines = yaml.split(/\r?\n/);
  const start = lines.findIndex((line) => /^todos\s*:/i.test(line));
  if (start < 0) return [];
  /** @type {Array<{ id?: string, content?: string, status?: string }>} */
  const todos = [];
  let current = null;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^[A-Za-z0-9_-]+\s*:/.test(line) && !/^\s/.test(line)) break;
    const item = line.match(/^\s*-\s+(?:id\s*:\s*(.*)|(.*))$/);
    if (item && /^\s*-\s+/.test(line)) {
      if (current) todos.push(current);
      current = {};
      const rest = line.replace(/^\s*-\s+/, "");
      assignTodoField(current, rest);
      continue;
    }
    if (current) {
      const field = line.match(/^\s+([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
      if (field) assignTodoField(current, `${field[1]}: ${field[2]}`);
    }
  }
  if (current) todos.push(current);
  return todos;
}

/**
 * @param {Record<string, string | undefined>} todo
 * @param {string} rest
 */
function assignTodoField(todo, rest) {
  const m = rest.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
  if (!m) return;
  const key = m[1];
  let value = m[2].trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  if (key === "id" || key === "content" || key === "status") todo[key] = value;
}

/**
 * @param {string} dir
 */
async function listPlanFiles(dir) {
  const paths = [];
  const errors = [];
  let present = false;
  try {
    await fs.access(dir);
    present = true;
  } catch {
    return { paths, errors, present: false };
  }
  await walk(dir, paths, errors, 0);
  return { paths, errors, present };
}

/**
 * @param {string} dir
 * @param {string[]} paths
 * @param {object[]} errors
 * @param {number} depth
 */
async function walk(dir, paths, errors, depth) {
  if (depth > 6) return;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    errors.push({ path: dir, message: String(err) });
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, paths, errors, depth + 1);
    } else if (/\.plan\.md$/i.test(entry.name) || (entry.name.endsWith(".md") && dir.toLowerCase().includes(`${path.sep}plans`))) {
      paths.push(full);
    }
  }
}
