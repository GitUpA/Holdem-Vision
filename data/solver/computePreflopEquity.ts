/**
 * Compute preflop equity tables via high-trial MC.
 *
 * Step 1: Validate against existing preflopEquityTable.ts (1 opponent).
 * Step 2: If validated, compute for 2, 5, 9 opponents.
 *
 * Run: npx tsx data/solver/computePreflopEquity.ts
 */
import { evaluateHand, compareHandRanks } from "../../convex/lib/primitives/handEvaluator";
import { PREFLOP_EQUITY } from "../../convex/lib/gto/preflopEquityTable";

const RL = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];

// Representative combo for each hand class
function getRepCombo(handClass: string): [number, number] {
  const isP = handClass.length === 2;
  const isS = handClass.endsWith("s");
  const r1 = 12 - RL.indexOf(handClass[0]);
  const r2 = 12 - RL.indexOf(handClass[1]);

  if (isP) return [r1 * 4, r1 * 4 + 1]; // suit 0 and 1
  if (isS) return [r1 * 4, r2 * 4];      // both suit 0
  return [r1 * 4, r2 * 4 + 1];           // suit 0 and suit 1
}

// All 169 hand classes
function allHandClasses(): string[] {
  const classes: string[] = [];
  for (let row = 0; row < 13; row++) {
    for (let col = 0; col < 13; col++) {
      if (row === col) classes.push(RL[row] + RL[col]);
      else if (row < col) classes.push(RL[row] + RL[col] + "s");
      else classes.push(RL[col] + RL[row] + "o");
    }
  }
  return classes;
}

// Fisher-Yates partial shuffle: pick N random cards from the array
function sampleCards(deck: number[], count: number): number[] {
  const arr = [...deck];
  for (let i = arr.length - 1; i > arr.length - 1 - count; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(arr.length - count);
}

/**
 * Compute equity of a hand class vs N random opponents.
 * Returns win rate (0-1) including ties split.
 */
function computeEquity(heroCards: [number, number], numOpponents: number, trials: number): number {
  const heroDead = new Set(heroCards);
  const baseDeck: number[] = [];
  for (let i = 0; i < 52; i++) if (!heroDead.has(i)) baseDeck.push(i);

  let wins = 0;
  let total = 0;

  for (let t = 0; t < trials; t++) {
    // Deal: N opponents × 2 cards + 5 board cards = 2N + 5 cards needed
    const needed = numOpponents * 2 + 5;
    const dealt = sampleCards(baseDeck, needed);

    // Split into opponent hands and board
    const opponents: [number, number][] = [];
    for (let i = 0; i < numOpponents; i++) {
      opponents.push([dealt[i * 2], dealt[i * 2 + 1]]);
    }
    const board = dealt.slice(numOpponents * 2, numOpponents * 2 + 5);

    // Evaluate hero
    const heroEval = evaluateHand([heroCards[0], heroCards[1], ...board]);

    // Evaluate all opponents, find the best
    let heroBeat = true;
    let heroTied = false;
    for (const opp of opponents) {
      const oppEval = evaluateHand([opp[0], opp[1], ...board]);
      const cmp = compareHandRanks(heroEval.rank, oppEval.rank);
      if (cmp < 0) { heroBeat = false; break; }
      if (cmp === 0) heroTied = true;
    }

    if (heroBeat) {
      wins += heroTied ? 0.5 : 1;
    }
    total++;
  }

  return wins / total;
}

// ═══════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════

const TRIALS = parseInt(process.argv[3] ?? "500000", 10);
const NUM_OPPONENTS = parseInt(process.argv[2] ?? "1", 10);

console.log(`Computing preflop equity for ${NUM_OPPONENTS} opponent(s), ${TRIALS.toLocaleString()} trials per hand class...\n`);

const handClasses = allHandClasses();
const results: { hc: string; computed: number; existing: number; diff: number }[] = [];
let maxDiff = 0;
let totalDiff = 0;

for (let i = 0; i < handClasses.length; i++) {
  const hc = handClasses[i];
  const combo = getRepCombo(hc);
  const computed = computeEquity(combo, NUM_OPPONENTS, TRIALS);
  const existing = PREFLOP_EQUITY[hc] ?? -1;
  const diff = NUM_OPPONENTS === 1 ? Math.abs(computed - existing) : 0;

  results.push({ hc, computed, existing, diff });
  maxDiff = Math.max(maxDiff, diff);
  totalDiff += diff;

  // Progress
  if ((i + 1) % 13 === 0) {
    process.stdout.write(`  ${i + 1}/${handClasses.length} hands computed\r`);
  }
}

console.log(`\n`);

// Output comparison for 1-opponent validation
if (NUM_OPPONENTS === 1) {
  console.log("VALIDATION: Computed vs Existing (1 opponent)");
  console.log("═".repeat(60));

  // Show hands with largest differences
  const sorted = [...results].sort((a, b) => b.diff - a.diff);
  console.log("\nTop 20 differences:");
  for (const r of sorted.slice(0, 20)) {
    const flag = r.diff > 0.02 ? " ← DIVERGENCE" : r.diff > 0.01 ? " ← check" : "";
    console.log(`  ${r.hc.padEnd(5)} computed=${(r.computed * 100).toFixed(1)}%  existing=${(r.existing * 100).toFixed(1)}%  diff=${(r.diff * 100).toFixed(2)}%${flag}`);
  }

  console.log(`\nAvg diff: ${((totalDiff / results.length) * 100).toFixed(3)}%`);
  console.log(`Max diff: ${(maxDiff * 100).toFixed(3)}%`);
  console.log(`Threshold: ${maxDiff <= 0.02 ? "PASS (≤2%)" : "FAIL (>2%)"}`);
}

// Output the full table
console.log(`\n${"═".repeat(60)}`);
console.log(`EQUITY TABLE: ${NUM_OPPONENTS} opponent(s)`);
console.log(`${"═".repeat(60)}`);

// Group by type for readability
const pairs = results.filter(r => r.hc.length === 2);
const suited = results.filter(r => r.hc.endsWith("s"));
const offsuit = results.filter(r => r.hc.endsWith("o"));

console.log("\nPairs:");
for (const r of pairs) {
  console.log(`  ${r.hc.padEnd(5)} ${(r.computed * 100).toFixed(1)}%`);
}
console.log("\nSample suited:");
for (const r of suited.slice(0, 15)) {
  console.log(`  ${r.hc.padEnd(5)} ${(r.computed * 100).toFixed(1)}%`);
}
console.log("\nSample offsuit:");
for (const r of offsuit.slice(0, 15)) {
  console.log(`  ${r.hc.padEnd(5)} ${(r.computed * 100).toFixed(1)}%`);
}

// Full JSON output for table replacement
console.log(`\n${"═".repeat(60)}`);
console.log("FULL JSON (for preflopEquityTable.ts):");
console.log(`${"═".repeat(60)}`);
const json: Record<string, number> = {};
for (const r of results) {
  json[r.hc] = Math.round(r.computed * 1000) / 1000; // 3 decimal places
}
console.log(JSON.stringify(json, null, 2));
