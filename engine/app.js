import { seedForToday, hashString, mulberry32 } from "./seed.js";
import { applyEffects, deepCopy, clampPercent01 } from "./effects.js";
import { loadEventCatalog, pickEventsDeterministic, applyPickedEvents } from "./events.js";

const app = document.getElementById("app");

function esc(s) {
  return (s ?? "")
    .toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load: ${path} (${res.status})`);
  return await res.json();
}

function getParams() {
  const qs = new URLSearchParams(location.search);
  return {
    topic: qs.get("topic") || "pm_soc",
    season: qs.get("season") || "s1",
    mode: qs.get("mode") || "normal", // normal | daily
  };
}

function applyDailyModifiers(state, seed, dailyMode) {
  const rng = mulberry32(hashString(seed + "|mods"));
  for (const m of dailyMode.modifiers ?? []) {
    const r = m.min + rng() * (m.max - m.min);

    const parts = m.path.split(".");
    let cur = state;
    for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
    const last = parts[parts.length - 1];

    const currentVal = Number(cur[last] ?? 0);

    let nextVal = currentVal;
    if (m.kind === "mult") nextVal = currentVal * r;
    if (m.kind === "add") nextVal = currentVal + r;

    if (typeof m.round === "number") {
      const p = Math.pow(10, m.round);
      nextVal = Math.round(nextVal * p) / p;
    }

    cur[last] = nextVal;
  }
}

function clampState(state) {
  // Clamp common fields so daily modifiers/events never show negative nonsense
  if (typeof state.scrapRate === "number") state.scrapRate = clampPercent01(state.scrapRate);
  if (typeof state.qualityRisk === "number") state.qualityRisk = Math.max(0, Math.round(state.qualityRisk));
  if (typeof state.totalCOP === "number") state.totalCOP = Math.max(0, Math.round(state.totalCOP));
}

function renderError(e) {
  app.innerHTML = `
    <div class="card">
      <h1>Play (Engine Scaffold)</h1>
      <p class="danger"><b>Error:</b> ${esc(e.message || String(e))}</p>
      <p class="small muted mono">Tip: check file paths + JSON validity.</p>
    </div>
  `;
}

function renderLoading(msg) {
  app.innerHTML = `
    <div class="card">
      <h1>Play (Engine Scaffold)</h1>
      <p class="muted">${esc(msg)}</p>
    </div>
  `;
}

function renderMiniGame({ topic, season, state, runNotes }) {
  const epObj = season.episodes.find((e) => e.ep === state.ep);

  const kpiHtml = (topic.ui?.kpis ?? [])
    .map((k) => {
      const val = state[k.id];
      let shown = val;

      if (k.format === "percent") shown = `${(Number(val ?? 0) * 100).toFixed(2)}%`;
      if (k.format === "int") shown = `${parseInt(val ?? 0, 10)}`;
      if (k.format === "number") shown = `${Number(val ?? 0).toLocaleString()}`;

      return `<span class="mono"><b>${esc(k.label)}:</b> ${esc(shown)}</span>`;
    })
    .join(" &nbsp; • &nbsp; ");

  app.innerHTML = `
    <div class="card">
      <h1>${esc(topic.title)} — ${esc(season.seasonLabel || season.id)}</h1>
      <p class="muted">${esc(topic.subtitle || "")}</p>
      <div class="small mono">${kpiHtml}</div>
      <div class="hr"></div>

      <p class="small muted mono">
        Topic: ${esc(topic.id)} | Season: ${esc(season.id)} | Episode: ${esc(state.ep)}
      </p>

      <h2 style="margin-top:6px;">${esc(epObj?.title || "No episode found")}</h2>
      <p>${esc(epObj?.story || "")}</p>

      <div class="btns" id="choices"></div>

      <div class="reveal" id="reveal">
        <h3 style="margin-bottom:6px;">Reveal</h3>
        <div class="small mono" id="revealText">
          ${
            runNotes.length
              ? runNotes.map((n) => `• ${esc(n)}`).join("<br/>")
              : "<span class='muted'>Choose an option to see effects.</span>"
          }
        </div>
        <div class="hr"></div>
        <div class="btns">
          <button class="primary" id="nextBtn">Next Episode</button>
          <button id="restartBtn">Restart Run</button>
        </div>
      </div>
    </div>
  `;

  const choices = document.getElementById("choices");
  (epObj?.options ?? []).forEach((opt) => {
    const b = document.createElement("button");
    b.textContent = `Option ${opt.key}: ${opt.text}`;
    b.onclick = () => {
      runNotes.length = 0;

      applyEffects(state, opt.effects, runNotes);

      if (typeof opt.oneOffFOH === "number") {
        state.totalCOP = Number(state.totalCOP ?? 0) + opt.oneOffFOH;
        runNotes.push(`One-off FOH applied: +${opt.oneOffFOH}`);
      }

      clampState(state);
      renderMiniGame({ topic, season, state, runNotes });
    };
    choices.appendChild(b);
  });

  document.getElementById("nextBtn").onclick = () => {
    const maxEp = Math.max(...season.episodes.map((e) => e.ep));
    state.ep = Math.min(maxEp, state.ep + 1);
    runNotes.length = 0;
    renderMiniGame({ topic, season, state, runNotes });
  };

  document.getElementById("restartBtn").onclick = () => {
    const fresh = deepCopy(topic.baseState);
    Object.keys(state).forEach((k) => delete state[k]);
    Object.assign(state, fresh);
    clampState(state);
    runNotes.length = 0;
    renderMiniGame({ topic, season, state, runNotes });
  };
}

(async function main() {
  try {
    const { topic: topicId, season: seasonId, mode } = getParams();

    const topicPath = `/content/topics/${topicId}/topic.json`;
    const seasonPath = `/content/topics/${topicId}/seasons/${seasonId}.json`;

    renderLoading(`Loading ${topicId}/${seasonId}…`);

    const [topic, season] = await Promise.all([loadJson(topicPath), loadJson(seasonPath)]);

    const state = deepCopy(topic.baseState);
    const runNotes = [];

    if (mode === "daily" && topic.dailyMode?.enabled) {
      const seed = seedForToday({
        timezone: topic.dailyMode.timezone || "UTC",
        seedKey: topic.dailyMode.seedKey || topicId,
        topicId,
        seasonId,
      });

      runNotes.push(`Daily seed: ${seed}`);

      applyDailyModifiers(state, seed, topic.dailyMode);

      if (topic.dailyMode.events?.catalogPath) {
        const catalog = await loadEventCatalog(topic.dailyMode.events.catalogPath);
        const picks = pickEventsDeterministic(seed, catalog, topic.dailyMode.events.count ?? 1);
        applyPickedEvents(state, picks, runNotes);
      }
    }

    clampState(state);
    renderMiniGame({ topic, season, state, runNotes });
  } catch (e) {
    renderError(e);
  }
})();
