import { hashString, mulberry32 } from "./seed.js";
import { applyEffects } from "./effects.js";

export async function loadEventCatalog(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load events: ${path}`);
  return await res.json();
}

export function pickEventsDeterministic(seed, catalog, count) {
  const rng = mulberry32(hashString(seed + "|events"));
  const pool = [...catalog];
  const picks = [];

  for (let i = 0; i < count && pool.length; i++) {
    const totalW = pool.reduce((s, e) => s + (e.weight ?? 1), 0);
    let r = rng() * totalW;
    let idx = 0;
    for (; idx < pool.length; idx++) {
      r -= (pool[idx].weight ?? 1);
      if (r <= 0) break;
    }
    picks.push(pool.splice(Math.min(idx, pool.length - 1), 1)[0]);
  }
  return picks;
}

export function applyPickedEvents(state, picked, notesOut) {
  for (const ev of picked) {
    notesOut?.push(`Event: ${ev.title}`);
    applyEffects(state, ev.effects, notesOut);
  }
}
