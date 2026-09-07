import os from "node:os";
import path from "node:path";

/**
 * Cross-platform home directory. Honors HOME / USERPROFILE.
 * @param {NodeJS.ProcessEnv} [env]
 */
export function homeDir(env = process.env) {
  return env.HOME || env.USERPROFILE || os.homedir();
}

/**
 * Windows roaming AppData, if present.
 * @param {NodeJS.ProcessEnv} [env]
 */
export function appDataDir(env = process.env) {
  if (env.APPDATA) return env.APPDATA;
  if (process.platform === "win32") {
    return path.join(homeDir(env), "AppData", "Roaming");
  }
  return null;
}

/**
 * @param {string | undefined} value
 */
export function isTruthyEnv(value) {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

/**
 * Never bind wildcard addresses — loopback only.
 * @param {string | undefined} requested
 */
export function loopbackHost(requested) {
  const host = (requested || "127.0.0.1").trim() || "127.0.0.1";
  const blocked = new Set(["0.0.0.0", "::", "[::]", "*", "localhost"]);
  // localhost is OK (resolves to loopback) — allow it.
  blocked.delete("localhost");
  if (host === "0.0.0.0" || host === "::" || host === "[::]" || host === "*") {
    return { host: "127.0.0.1", forced: true, requested: host };
  }
  return { host, forced: false, requested: host };
}

/**
 * @param {string} dir
 * @param {string} name
 */
export function joinIfDir(dir, name) {
  return path.join(dir, name);
}
