// engine/events.js
// Supports BOTH catalog shapes:
// 1) Array: [ {...}, {...} ]
// 2) Object: { "events": [ {...}, {...} ] }

import { hashString, mulberry32 } from "./seed.js";
import { applyEffects } from "./effects.js";

/**
 * Load and normalize event catalog into an ARRAY of events.
 * Each event becomes:
 * { id, label, notes: string[], effects: Effect[] }
 */
export async function loadEventCatalog(catalogPath) {
  if (!catalogPath) return [];

  const res = await fetch(catalogPath, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to load event catalog (${res.status}) at ${catalogPath}`);
  }

  const data = await res.json();

  // Normalize shapes
  let rawEvents;
  if (Array.isArray(data)) rawEvents = data;
  else if (data && Array.isArray(data.events)) rawEvents = data.events;
  else if (data && Array.isArray(data.items)) rawEvents = data.items; // extra tolerance
  else {
    const shape =
      data && typeof data === "object"
        ? `object keys: ${Object.keys(data).join(", ")}`
        : typeof data;
    throw new Error(
      `Invalid event catalog shape at ${catalogPath}. Expected array or {events:[...]}, got ${shape}.`
    );
  }

  // Normalize per-event fields
  const norm = rawEvents
    .filter(Boolean)
    .map((ev, idx) => {
      const id = (ev.id ?? "").toString().trim() || `ev_${idx + 1}`;
      const label = (ev.label ?? ev.title ?? ev.name ?? id).toString();

      let notes = [];
      if (Array.isArray(ev.notes)) notes = ev.notes.map(String);
      else if (typeof ev.notes === "string") notes = [ev.notes];
      else if (typeof ev.note === "string") notes = [ev.note];

      const effects = Array.isArray(ev.effects) ? ev.effects : [];

      return { ...ev, id, label, notes, effects };
    });

  return norm;
}

/**
 * Deterministically pick N events from a catalog using a seed.
 * Signature matches your app.js usage:
 *   pickEventsDeterministic(seed, catalogArray, count)
 */
export function pickEventsDeterministic(seed, catalogArray, count = 1) {
  const events = Array.isArray(catalogArray) ? catalogArray : [];
  const n = Math.max(0, Math.min(Number(count) || 0, events.length));
  if (n === 0) return [];

  const rng = mulberry32(hashString(String(seed) + "|events"));

  // Deterministic shuffle (Fisher–Yates)
  const copy = events.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy.slice(0, n);
}

/**
 * Apply picked events to state and write human-readable notes into runNotes.
 * Signature matches your app.js usage:
 *   applyPickedEvents(state, picks, runNotes)
 */
export function applyPickedEvents(state, pickedEvents, runNotes) {
  const picks = Array.isArray(pickedEvents) ? pickedEvents : [];
  if (!picks.length) return;

  for (const ev of picks) {
    if (!ev) continue;

    if (runNotes) runNotes.push(`Event: ${ev.label ?? ev.id ?? "Event"}`);

    // Optional: add descriptive notes for players
    if (runNotes && Array.isArray(ev.notes)) {
      for (const line of ev.notes) {
        if (String(line).trim()) runNotes.push(String(line));
      }
    }

    // Apply effects using the same effect engine as options
    applyEffects(state, ev.effects, runNotes);
  }
}
