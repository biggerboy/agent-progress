import fs from "node:fs/promises";
import path from "node:path";
import { asIsoTime } from "../../normalize/index.js";
import { homeDir } from "../../normalize/home.js";

/**
 * Codex state root: CODEX_HOME, else ~/.codex (Windows: %USERPROFILE%\.codex).
 * @param {NodeJS.ProcessEnv} [env]
 */
export function codexHomeDir(env = process.env) {
  if (env.CODEX_HOME) return env.CODEX_HOME;
  return path.join(homeDir(env), ".codex");
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function defaultCodexSessionsRoot(env = process.env) {
  if (env.CODEX_SESSIONS_DIR) return env.CODEX_SESSIONS_DIR;
  if (env.CODEX_SESSIONS_DATA_DIR) return env.CODEX_SESSIONS_DATA_DIR;
  return path.join(codexHomeDir(env), "sessions");
}

/**
 * Recent session metadata only — never a task-status source.
 * @param {string} root
 * @param {{ limit?: number }} [opts]
 */
export async function loadCodexSessions(root, { limit = 20 } = {}) {
  /** @type {Array<{ id: string, cwd?: string, path: string, updatedAt?: string, title?: string }>} */
  const sessions = [];
  const errors = [];
  let present = false;

  try {
    await fs.access(root);
    present = true;
  } catch {
    return { sessions, errors, root, present: false };
  }

  const files = [];
  await walk(root, files, errors, 0);

  const ranked = await Promise.all(
    files.map(async (filePath) => {
      try {
        const st = await fs.stat(filePath);
        return { filePath, mtime: st.mtimeMs };
      } catch {
        return { filePath, mtime: 0 };
      }
    }),
  );
  ranked.sort((a, b) => b.mtime - a.mtime);

  for (const row of ranked.slice(0, limit * 3)) {
    try {
      const session = await readSessionMeta(row.filePath, row.mtime);
      if (session) sessions.push(session);
      if (sessions.length >= limit) break;
    } catch (err) {
      errors.push({ path: row.filePath, message: String(err) });
    }
  }

  return { sessions, errors, root, present };
}

/**
 * @param {string} filePath
 * @param {number} mtime
 */
async function readSessionMeta(filePath, mtime) {
  const base = path.basename(filePath);
  if (base === "meta.json") {
    const data = JSON.parse(await fs.readFile(filePath, "utf8"));
    if (!data || typeof data !== "object") return null;
    const rec = /** @type {Record<string, unknown>} */ (data);
    return {
      id: String(rec.id || rec.session_id || path.basename(path.dirname(filePath))),
      cwd: rec.cwd != null ? String(rec.cwd) : undefined,
      path: filePath,
      updatedAt: asIsoTime(rec.updated_at) || asIsoTime(mtime),
      title: rec.title != null ? String(rec.title) : undefined,
    };
  }

  const buf = await fs.readFile(filePath, { encoding: "utf8" });
  const head = buf.slice(0, 16_384);
  const lines = head.split(/\r?\n/).filter(Boolean).slice(0, 8);
  for (const line of lines) {
    let json;
    try {
      json = JSON.parse(line);
    } catch {
      continue;
    }
    const meta = extractJsonlMeta(json);
    if (meta) {
      const idFromName = base.replace(/^rollout-\d+-/, "").replace(/\.jsonl(\.zst)?$/i, "");
      return {
        id: meta.id || idFromName,
        cwd: meta.cwd,
        path: filePath,
        updatedAt: asIsoTime(meta.timestamp) || asIsoTime(mtime),
        title: meta.title,
      };
    }
  }

  const idFromName = base.replace(/^rollout-\d+-/, "").replace(/\.jsonl(\.zst)?$/i, "");
  return {
    id: idFromName || base,
    path: filePath,
    updatedAt: asIsoTime(mtime),
  };
}

/**
 * @param {unknown} json
 */
function extractJsonlMeta(json) {
  if (!json || typeof json !== "object") return null;
  const rec = /** @type {Record<string, unknown>} */ (json);
  const payload =
    rec.payload && typeof rec.payload === "object"
      ? /** @type {Record<string, unknown>} */ (rec.payload)
      : rec.session_meta && typeof rec.session_meta === "object"
        ? /** @type {Record<string, unknown>} */ (rec.session_meta)
        : rec;
  const type = String(rec.type || rec.kind || payload.type || "");
  const cwd = payload.cwd ?? rec.cwd;
  const id = payload.id ?? payload.session_id ?? rec.id ?? rec.session_id;
  const looksMeta =
    /session_meta|session-meta|session/i.test(type) || cwd != null || id != null;
  if (!looksMeta) return null;
  return {
    id: id != null ? String(id) : undefined,
    cwd: cwd != null ? String(cwd) : undefined,
    timestamp: rec.timestamp ?? payload.timestamp ?? rec.created_at,
    title: payload.title != null ? String(payload.title) : undefined,
  };
}

/**
 * @param {string} dir
 * @param {string[]} files
 * @param {object[]} errors
 * @param {number} depth
 */
async function walk(dir, files, errors, depth) {
  if (depth > 8) return;
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
      await walk(full, files, errors, depth + 1);
    } else if (entry.name === "meta.json" || /^rollout-.*\.jsonl$/i.test(entry.name)) {
      files.push(full);
    }
  }
}
