/** Format a BB amount — show 1 decimal when fractional, whole number otherwise. */
export function formatBB(bb: number): string {
  return bb % 1 === 0 ? bb.toFixed(0) : bb.toFixed(1);
}

/** Human-readable labels for SituationKey values. */
const SITUATION_LABELS: Record<string, string> = {
  "preflop.open":            "Open Raise",
  "preflop.facing_raise":    "vs Raise",
  "preflop.facing_3bet":     "vs 3-Bet",
  "preflop.facing_4bet":     "vs 4-Bet+",
  "postflop.aggressor.ip":   "C-Bet IP",
  "postflop.aggressor.oop":  "C-Bet OOP",
  "postflop.caller.ip":      "Probe IP",
  "postflop.caller.oop":     "Check / Donk OOP",
  "postflop.facing_bet":     "vs Bet",
  "postflop.facing_raise":   "vs Raise / X-R",
  "postflop.facing_allin":   "vs All-In",
};

/** Format a SituationKey into a poker-friendly label. */
export function formatSituationKey(key: string): string {
  return SITUATION_LABELS[key] ?? key.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
