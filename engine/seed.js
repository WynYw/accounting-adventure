// Deterministic seeding + RNG (no dependencies)

export function hashString(s) {
  // FNV-1a 32-bit
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seedUint32) {
  let a = seedUint32 >>> 0;
  return function () {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedForToday({ timezone, seedKey, topicId, seasonId }) {
  // YYYY-MM-DD in a chosen timezone (Malaysia recommended)
  const ymd = new Date().toLocaleDateString("en-CA", { timeZone: timezone });
  return `${ymd}|${seedKey}|${topicId}|${seasonId}`;
}
