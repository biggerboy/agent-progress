/** @typedef {'pending' | 'in_progress' | 'completed' | 'blocked'} ItemStatus */

/**
 * @typedef {object} ItemSource
 * @property {string} tool
 * @property {string} path
 * @property {string} [listId]
 */

/**
 * @typedef {object} Item
 * @property {string} id
 * @property {string} title
 * @property {ItemStatus} status
 * @property {string[]} [blockedBy]
 * @property {ItemSource} source
 * @property {string} [updatedAt]
 * @property {string} [excerpt]
 */

export const ITEM_STATUSES = /** @type {const} */ ([
  "pending",
  "in_progress",
  "completed",
  "blocked",
]);

/**
 * @param {unknown} value
 * @returns {string[]}
 */
export function asStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v) => v != null && v !== "")
    .map((v) => String(v));
}

/**
 * @param {unknown} value
 * @param {number} [max]
 */
export function asExcerpt(value, max = 240) {
  if (value == null) return undefined;
  const text = String(value).replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * @param {Date | number | string | undefined | null} value
 */
export function asIsoTime(value) {
  if (value == null || value === "") return undefined;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

/**
 * @param {unknown} raw
 * @returns {ItemStatus | undefined}
 */
export function coerceStatus(raw) {
  if (raw == null) return undefined;
  const value = String(raw).trim().toLowerCase().replace(/-/g, "_");
  if (value === "open" || value === "todo" || value === "ready") return "pending";
  if (
    value === "doing" ||
    value === "running" ||
    value === "active" ||
    value === "planning" ||
    value === "implementing" ||
    value === "reviewing" ||
    value === "verifying"
  ) {
    return "in_progress";
  }
  if (value === "resolved" || value === "done" || value === "cancelled" || value === "canceled") {
    return "completed";
  }
  if (value === "error" || value === "blocked") return "blocked";
  if (ITEM_STATUSES.includes(/** @type {ItemStatus} */ (value))) {
    return /** @type {ItemStatus} */ (value);
  }
  return undefined;
}

/**
 * A task is blocked when it is not completed and still depends on
 * at least one unfinished (or unknown) blocker.
 *
 * @param {object} input
 * @param {ItemStatus | undefined} input.status
 * @param {string[]} [input.blockedBy]
 * @param {Set<string>} [input.completedIds]
 */
export function applyBlocked({ status, blockedBy = [], completedIds }) {
  const base = status || "pending";
  if (base === "completed") return { status: base, blockedBy: [] };
  const active = blockedBy.filter((id) => !completedIds || !completedIds.has(String(id)));
  if (active.length > 0) {
    return { status: "blocked", blockedBy: active };
  }
  return { status: base, blockedBy: [] };
}

/**
 * @param {Partial<Item> & { id: string, title: string, source: ItemSource }} item
 * @returns {Item}
 */
export function toItem(item) {
  return {
    id: item.id,
    title: item.title,
    status: item.status || "pending",
    blockedBy: item.blockedBy && item.blockedBy.length ? item.blockedBy : undefined,
    source: item.source,
    updatedAt: item.updatedAt,
    excerpt: item.excerpt,
  };
}
