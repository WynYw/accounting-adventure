// engine/events.js
// Loads an event catalog and returns a normalized array of events.
// Supports BOTH formats:
//   1) Array: [ {...}, {...} ]
//   2) Object: { "events": [ {...}, {...} ] }

export async function loadEventCatalog(catalogPath) {
  if (!catalogPath) return [];

  const res = await fetch(catalogPath, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to load event catalog (${res.status}) at ${catalogPath}`);
  }

  const data = await res.json();

  // Normalize:
  // - If it's already an array, use it.
  // - If it's an object with .events array, use that.
  // - Otherwise, treat as empty + throw a helpful error.
  let events = null;

  if (Array.isArray(data)) {
    events = data;
  } else if (data && Array.isArray(data.events)) {
    events = data.events;
  } else {
    const shape = data && typeof data === "object"
      ? `object keys: ${Object.keys(data).join(", ")}`
      : typeof data;

    throw new Error(
      `Invalid event catalog shape at ${catalogPath}. Expected array or {events:[...]}, got ${shape}.`
    );
  }

  // Basic cleanup / defaults
  return events
    .filter(Boolean)
    .map(ev => ({
      id: ev.id ?? "",
      label: ev.label ?? ev.id ?? "Event",
      notes: Array.isArray(ev.notes) ? ev.notes : [],
      effects: Array.isArray(ev.effects) ? ev.effects : []
    }))
    .filter(ev => ev.id);
}

// Deterministic pick using rng() that returns [0,1)
export function pickEvents(events, count, rng) {
  const arr = Array.isArray(events) ? events : [];
  const n = Math.max(0, Math.min(count ?? 0, arr.length));
  if (n === 0) return [];

  // Shuffle copy deterministically
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy.slice(0, n);
}
