const COLUMNS = ["pending", "in_progress", "completed", "blocked"];

const boardEl = document.getElementById("board");
const emptyEl = document.getElementById("empty");
const bannerEl = document.getElementById("banner");
const metaEl = document.getElementById("meta");
const sessionsEl = document.getElementById("sessions");
const sessionList = document.getElementById("session-list");

let openIds = new Set();

async function loadBoard() {
  const res = await fetch("/api/board", { cache: "no-store" });
  if (!res.ok) throw new Error(`board ${res.status}`);
  return res.json();
}

function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  return d.toLocaleString();
}

function render(payload) {
  const items = payload.items || [];
  const byStatus = Object.fromEntries(COLUMNS.map((s) => [s, []]));
  for (const item of items) {
    (byStatus[item.status] || byStatus.pending).push(item);
  }

  for (const status of COLUMNS) {
    const section = boardEl.querySelector(`[data-status="${status}"]`);
    const cards = section.querySelector(".cards");
    const count = section.querySelector("[data-count]");
    const list = byStatus[status];
    count.textContent = String(list.length);
    cards.replaceChildren(...list.map(renderCard));
  }

  const empty = items.length === 0;
  emptyEl.hidden = !empty;
  emptyEl.textContent = empty
    ? "没有可展示的任务。请在 Claude Code 里创建 tasks（~/.claude/tasks/{listId}/*.json），或用 fixtures 启动：npm start -- --fixtures / bun start -- --fixtures"
    : "";

  const usingFixtures = payload.meta?.claudeMode === "fixtures";
  bannerEl.hidden = !usingFixtures;
  bannerEl.textContent = usingFixtures
    ? "当前使用 fixtures（未找到真实 ~/.claude/tasks，或显式传入 --fixtures）。找到真实目录后会自动改读本机数据。"
    : "";

  const counts = payload.meta?.counts?.byStatus || {};
  metaEl.textContent = `${payload.meta?.claudeMode || ""} · 待做 ${counts.pending || 0} / 进行中 ${counts.in_progress || 0} / 完成 ${counts.completed || 0} / 阻塞 ${counts.blocked || 0} · ${fmtTime(payload.generatedAt) || ""}`;

  const sessions = payload.sessions || [];
  sessionsEl.hidden = sessions.length === 0;
  sessionList.replaceChildren(
    ...sessions.map((s) => {
      const li = document.createElement("li");
      li.textContent = `${s.title || s.id} — ${s.cwd || "(no cwd)"} — ${s.path}`;
      return li;
    }),
  );
}

function renderCard(item) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "card" + (openIds.has(item.id) ? " open" : "");
  btn.dataset.id = item.id;
  const tool = item.source?.tool || "unknown";
  btn.innerHTML = `
    <h3></h3>
    <div class="row">
      <span class="badge ${tool}"></span>
      <span class="time"></span>
    </div>
    <div class="evidence"></div>
  `;
  btn.querySelector("h3").textContent = item.title;
  btn.querySelector(".badge").textContent = tool;
  btn.querySelector(".time").textContent = fmtTime(item.updatedAt);
  const blocked = item.blockedBy?.length ? `blockedBy: ${item.blockedBy.join(", ")}` : "";
  btn.querySelector(".evidence").textContent = [
    item.source?.path,
    item.source?.listId ? `listId: ${item.source.listId}` : "",
    blocked,
    item.excerpt || "",
  ]
    .filter(Boolean)
    .join("\n");
  btn.addEventListener("click", () => {
    const open = btn.classList.toggle("open");
    if (open) openIds.add(item.id);
    else openIds.delete(item.id);
  });
  return btn;
}

async function tick() {
  try {
    render(await loadBoard());
  } catch (err) {
    bannerEl.hidden = false;
    bannerEl.textContent = `无法读取看板：${err.message}`;
  }
}

tick();
setInterval(tick, 4000);

try {
  const es = new EventSource("/api/stream");
  es.addEventListener("message", () => tick());
} catch {
  /* polling remains */
}
