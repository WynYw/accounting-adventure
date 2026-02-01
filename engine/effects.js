function get(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function set(obj, path, value) {
  const parts = path.split(".");
  const last = parts.pop();
  let cur = obj;
  for (const p of parts) {
    if (cur[p] == null) cur[p] = {};
    cur = cur[p];
  }
  cur[last] = value;
}

function add(obj, path, value) {
  const cur = Number(get(obj, path) ?? 0);
  set(obj, path, cur + value);
}

function evalCond(state, cond) {
  const left = get(state, cond.path);
  const right = cond.value;
  switch (cond.op) {
    case "==": return left === right;
    case "!=": return left !== right;
    case ">=": return left >= right;
    case "<=": return left <= right;
    case ">": return left > right;
    case "<": return left < right;
    default: return false;
  }
}

export function applyEffects(state, effects, notesOut) {
  for (const e of (effects ?? [])) {
    if (e.if) {
      const ok = evalCond(state, e.if);
      applyEffects(state, ok ? e.then : e.else, notesOut);
      continue;
    }
    if (e.op === "note") {
      if (notesOut) notesOut.push(e.text);
      continue;
    }
    if (e.op === "set") set(state, e.path, e.value);
    if (e.op === "add") add(state, e.path, e.value);
  }
}

export function clampPercent01(x) {
  return Math.max(0, Math.min(0.30, x)); // your current game uses 0–30% guardrails
}

export function deepCopy(x) {
  // structuredClone is best, but fallback safe for JSON data
  if (typeof structuredClone === "function") return structuredClone(x);
  return JSON.parse(JSON.stringify(x));
}
