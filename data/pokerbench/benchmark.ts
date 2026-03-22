/**
 * PokerBench Benchmark — validate HoldemVision engine accuracy
 * against solver-optimal decisions.
 *
 * Reads PokerBench CSV test sets, reconstructs game states,
 * runs our engine, and compares to solver answers.
 *
 * Usage:
 *   npx tsx data/pokerbench/benchmark.ts
 *   npx tsx data/pokerbench/benchmark.ts --preflop
 *   npx tsx data/pokerbench/benchmark.ts --postflop
 *   npx tsx data/pokerbench/benchmark.ts --all
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// Engine imports
import { cardFromString } from "../../convex/lib/primitives/card";
import type { CardIndex } from "../../convex/lib/types/cards";
import { comboToHandClass, cardsToCombo } from "../../convex/lib/opponents/combos";
import {
  lookupPreflopHandClass,
  handClassToActionFrequencies,
} from "../../convex/lib/gto/tables";
import {
  classifyArchetype,
  type ClassificationContext,
  type ActionSummary,
} from "../../convex/lib/gto/archetypeClassifier";
import {
  lookupFrequencies,
  hasTable,
} from "../../convex/lib/gto/tables";
import { categorizeHand, type HandCategory } from "../../convex/lib/gto/handCategorizer";
import type { ActionFrequencies } from "../../convex/lib/gto/tables/types";
import type { Position, Street } from "../../convex/lib/types/cards";

// ═══════════════════════════════════════════════════════
// CSV PARSING
// ═══════════════════════════════════════════════════════

const DATA_DIR = resolve(__dirname, "dataset");

interface PreflopRow {
  prevLine: string;
  heroPos: string;
  heroHolding: string;
  correctDecision: string;
  numBets: number;
  availableMoves: string;
  potSize: number;
}

interface PostflopRow {
  preflopAction: string;
  boardFlop: string;
  boardTurn: string;
  boardRiver: string;
  aggressorPosition: string;
  postflopAction: string;
  evaluationAt: string;
  availableMoves: string;
  potSize: number;
  heroPosition: string;
  holding: string;
  correctDecision: string;
}

function parsePreflopCSV(filename: string): PreflopRow[] {
  const raw = readFileSync(resolve(DATA_DIR, filename), "utf-8");
  const lines = raw.trim().split("\n");
  const rows: PreflopRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = parseCSVLine(lines[i]);
    if (parts.length < 9) continue;
    rows.push({
      prevLine: parts[1],
      heroPos: parts[2],
      heroHolding: parts[3],
      correctDecision: parts[4],
      numBets: parseInt(parts[6]) || 0,
      availableMoves: parts[7],
      potSize: parseFloat(parts[8]) || 0,
    });
  }
  return rows;
}

function parsePostflopCSV(filename: string): PostflopRow[] {
  const raw = readFileSync(resolve(DATA_DIR, filename), "utf-8");
  const lines = raw.trim().split("\n");
  const rows: PostflopRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = parseCSVLine(lines[i]);
    if (parts.length < 13) continue;
    rows.push({
      preflopAction: parts[1],
      boardFlop: parts[2],
      boardTurn: parts[3],
      boardRiver: parts[4],
      aggressorPosition: parts[5],
      postflopAction: parts[6],
      evaluationAt: parts[7],
      availableMoves: parts[8],
      potSize: parseFloat(parts[9]) || 0,
      heroPosition: parts[10],
      holding: parts[11],
      correctDecision: parts[12],
    });
  }
  return rows;
}

/** Simple CSV line parser handling quoted fields */
function parseCSVLine(line: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;

  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current.trim());
  return parts;
}

// ═══════════════════════════════════════════════════════
// DECISION NORMALIZATION
// ═══════════════════════════════════════════════════════

type NormalizedAction = "fold" | "call" | "raise";

function normalizeDecision(decision: string): NormalizedAction {
  const d = decision.trim().toLowerCase();
  if (d === "fold") return "fold";
  if (d === "call" || d === "check") return "call";
  if (d.startsWith("bet") || d.startsWith("raise") || d === "allin") return "raise";
  if (/[\d.]/.test(d)) return "raise"; // numeric bet amount like "3.0bb"
  return "fold";
}

/** Get the probability our engine assigns to a specific normalized action. */
function getActionProb(freq: ActionFrequencies, action: NormalizedAction): number {
  const f = freq as Record<string, number | undefined>;
  switch (action) {
    case "fold": return f.fold ?? 0;
    case "call": return (f.call ?? 0) + (f.check ?? 0);
    case "raise": return (f.bet_small ?? 0) + (f.bet_medium ?? 0) + (f.bet_large ?? 0) + (f.raise ?? 0);
  }
}

// Weak hand fold calibration (mirrors modifiedGtoEngine.ts)
const WEAK_CATS = new Set(["air", "weak_draw", "bottom_pair", "overcards", "straight_draw"]);
const CAT_STRENGTH: Record<string, number> = {
  sets_plus: 1.0, two_pair: 0.85, premium_pair: 0.82, overpair: 0.78,
  top_pair_top_kicker: 0.7, top_pair_weak_kicker: 0.6, middle_pair: 0.45,
  bottom_pair: 0.35, combo_draw: 0.5, flush_draw: 0.4, straight_draw: 0.33,
  overcards: 0.25, weak_draw: 0.15, air: 0.05,
};

function calibrateWeakHand(freq: ActionFrequencies, category: string): ActionFrequencies {
  if (!WEAK_CATS.has(category)) return freq;
  const currentFold = freq.fold ?? 0;
  if (currentFold >= 0.6) return freq;
  const catStrength = CAT_STRENGTH[category] ?? 0.3;
  const weakness = Math.max(0, 0.35 - catStrength);
  const boostFactor = weakness * 1.2;
  if (boostFactor < 0.05) return freq;
  const result = { ...freq };
  const foldBoost = boostFactor * (1 - currentFold);
  result.fold = Math.min(0.95, currentFold + foldBoost);
  const totalOther = 1 - currentFold;
  const newTotalOther = 1 - result.fold;
  if (totalOther > 0.01) {
    const scale = newTotalOther / totalOther;
    for (const key of Object.keys(result) as (keyof ActionFrequencies)[]) {
      if (key !== "fold" && result[key]) result[key] = (result[key] ?? 0) * scale;
    }
  }
  return result;
}

function frequenciesToAction(freq: ActionFrequencies): NormalizedAction {
  let bestAction: NormalizedAction = "fold";
  let bestFreq = freq.fold ?? 0;

  const callFreq = (freq.call ?? 0) + (freq.check ?? 0);
  if (callFreq > bestFreq) {
    bestFreq = callFreq;
    bestAction = "call";
  }

  const f = freq as Record<string, number | undefined>;
  const raiseFreq =
    (f.bet_small ?? 0) + (f.bet_medium ?? 0) + (f.bet_large ?? 0) + (f.raise ?? 0);
  if (raiseFreq > bestFreq) {
    bestAction = "raise";
  }

  return bestAction;
}

// ═══════════════════════════════════════════════════════
// CARD PARSING
// ═══════════════════════════════════════════════════════

function parseHolding(holding: string): CardIndex[] {
  if (holding.length < 4) return [];
  try {
    return [cardFromString(holding.slice(0, 2)), cardFromString(holding.slice(2, 4))];
  } catch {
    return [];
  }
}

function parseBoardString(boardStr: string): CardIndex[] {
  if (!boardStr || boardStr.length < 2) return [];
  const cards: CardIndex[] = [];
  for (let i = 0; i < boardStr.length; i += 2) {
    if (i + 1 < boardStr.length) {
      try {
        cards.push(cardFromString(boardStr.slice(i, i + 2)));
      } catch {
        // skip invalid cards
      }
    }
  }
  return cards;
}

// ═══════════════════════════════════════════════════════
// PREFLOP BENCHMARK
// ═══════════════════════════════════════════════════════

interface BenchmarkResult {
  total: number;
  correct: number;
  close: number; // correct direction (continue vs fold)
  withinMix: number; // engine assigns >= 25% to solver's action (mixed strategy)
  miss: number;
  skipped: number;
  avgSolverProb: number; // average probability our engine assigns to solver's chosen action
  solverProbSum: number; // running sum for avg calculation
  byArchetype: Record<string, { total: number; correct: number; close: number; withinMix: number }>;
  byPosition: Record<string, { total: number; correct: number; close: number }>;
  byHandStrength: Record<string, { total: number; correct: number; close: number; withinMix: number }>;
  misses: Array<{ hand: string; pos: string; arch: string; expected: string; got: string }>;
}

const POSITIONS_MAP: Record<string, Position> = {
  UTG: "utg", HJ: "hj", CO: "co", BTN: "btn", SB: "sb", BB: "bb",
  utg: "utg", hj: "hj", co: "co", btn: "btn", sb: "sb", bb: "bb",
};

function findOpenerFromPrevLine(prevLine: string): string | undefined {
  if (!prevLine) return undefined;
  const parts = prevLine.split("/");
  let currentPos: string | null = null;
  for (const part of parts) {
    const pl = part.toLowerCase();
    if (POSITIONS_MAP[pl]) {
      currentPos = POSITIONS_MAP[pl];
    } else if (currentPos && (/[\d.]/.test(pl) || pl === "allin")) {
      return currentPos;
    }
  }
  return undefined;
}

function classifyPreflopArchetype(prevLine: string, heroPos: string, numBets: number): string {
  const hero = heroPos.toLowerCase();

  if (numBets === 0) return "rfi_opening";

  // Check BvB
  if (prevLine) {
    const parts = prevLine.split("/");
    const positions = parts.filter((p) => POSITIONS_MAP[p.toLowerCase()]);
    const allBlinds = positions.every((p) => {
      const pp = p.toLowerCase();
      return pp === "sb" || pp === "bb";
    });
    if (allBlinds && (hero === "sb" || hero === "bb")) return "blind_vs_blind";
  }

  // Facing single raise
  if (numBets === 1) return "bb_defense_vs_rfi";

  // 3-bet
  if (numBets === 2 || numBets === 3) return "three_bet_pots";

  // 4-bet+
  if (numBets >= 4) return "four_bet_five_bet";

  return "rfi_opening";
}

function benchmarkPreflop(filename: string): BenchmarkResult {
  const rows = parsePreflopCSV(filename);
  const result: BenchmarkResult = {
    total: 0,
    correct: 0,
    close: 0,
    withinMix: 0,
    miss: 0,
    skipped: 0,
    avgSolverProb: 0,
    solverProbSum: 0,
    byArchetype: {},
    byPosition: {},
    byHandStrength: {},
    misses: [],
  };

  for (const row of rows) {
    const cards = parseHolding(row.heroHolding);
    if (cards.length < 2) {
      result.skipped++;
      continue;
    }

    const position = POSITIONS_MAP[row.heroPos];
    if (!position) {
      result.skipped++;
      continue;
    }

    const combo = cardsToCombo(cards[0], cards[1]);
    const handClass = comboToHandClass(combo);
    const archetype = classifyPreflopArchetype(row.prevLine, row.heroPos, row.numBets);

    // Extract opener position from prev_line
    const openerPos = findOpenerFromPrevLine(row.prevLine);

    // Look up our engine's recommendation (with opener context)
    const hcLookup = lookupPreflopHandClass(archetype, position, handClass, openerPos);
    if (!hcLookup) {
      result.skipped++;
      continue;
    }

    const freq = handClassToActionFrequencies(hcLookup, archetype);
    const ourAction = frequenciesToAction(freq);
    const solverAction = normalizeDecision(row.correctDecision);

    // Distributional: what probability does our engine assign to the solver's action?
    const solverProb = getActionProb(freq, solverAction);

    result.total++;
    result.solverProbSum += solverProb;

    // Score
    const exact = ourAction === solverAction;
    const bothContinue =
      (ourAction !== "fold" && solverAction !== "fold") ||
      (ourAction === "fold" && solverAction === "fold");
    const inMix = solverProb >= 0.25;

    if (exact) {
      result.correct++;
    } else if (bothContinue) {
      result.close++;
    } else {
      result.miss++;
      if (result.misses.length < 50) {
        result.misses.push({
          hand: handClass,
          pos: position,
          arch: archetype,
          expected: solverAction,
          got: ourAction,
        });
      }
    }
    if (inMix) result.withinMix++;

    // By archetype
    if (!result.byArchetype[archetype]) result.byArchetype[archetype] = { total: 0, correct: 0, close: 0, withinMix: 0 };
    result.byArchetype[archetype].total++;
    if (exact) result.byArchetype[archetype].correct++;
    else if (bothContinue) result.byArchetype[archetype].close++;
    if (inMix) result.byArchetype[archetype].withinMix++;

    // By position
    if (!result.byPosition[position]) result.byPosition[position] = { total: 0, correct: 0, close: 0 };
    result.byPosition[position].total++;
    if (exact) result.byPosition[position].correct++;
    else if (bothContinue) result.byPosition[position].close++;
  }

  result.avgSolverProb = result.total > 0 ? result.solverProbSum / result.total : 0;
  return result;
}

// ═══════════════════════════════════════════════════════
// POSTFLOP BENCHMARK
// ═══════════════════════════════════════════════════════

function benchmarkPostflop(filename: string): BenchmarkResult {
  const rows = parsePostflopCSV(filename);
  const result: BenchmarkResult = {
    total: 0,
    correct: 0,
    close: 0,
    withinMix: 0,
    miss: 0,
    skipped: 0,
    avgSolverProb: 0,
    solverProbSum: 0,
    byArchetype: {},
    byPosition: {},
    byHandStrength: {},
    misses: [],
  };

  for (const row of rows) {
    const cards = parseHolding(row.holding);
    if (cards.length < 2) {
      result.skipped++;
      continue;
    }

    // Build community cards based on evaluation street
    const flopCards = parseBoardString(row.boardFlop);
    const communityCards = [...flopCards];

    const street = row.evaluationAt.toLowerCase() as Street;
    if ((street === "turn" || street === "river") && row.boardTurn) {
      communityCards.push(...parseBoardString(row.boardTurn));
    }
    if (street === "river" && row.boardRiver) {
      communityCards.push(...parseBoardString(row.boardRiver));
    }

    if (communityCards.length < 3) {
      result.skipped++;
      continue;
    }

    // Classify archetype via board texture
    const isIP = row.heroPosition === "IP";
    const isAggressor = row.aggressorPosition === (isIP ? "IP" : "OOP");

    // Build minimal classification context
    const actionSummaries: ActionSummary[] = [];
    // Parse preflop action to determine pot type
    const preflopParts = row.preflopAction.split("/");
    let raiseCount = 0;
    for (const part of preflopParts) {
      if (/\d/.test(part) && !part.includes("call")) raiseCount++;
    }
    const potType = raiseCount >= 2 ? "3bet" as const : "srp" as const;

    const classCtx: ClassificationContext = {
      street,
      communityCards,
      heroPosition: isIP ? "btn" : "bb", // Approximate — PokerBench uses IP/OOP
      villainPositions: [isIP ? "bb" : "btn"],
      potType,
      actionHistory: actionSummaries,
      isAggressor,
      isInPosition: isIP,
      actingStreet: street,
    };

    const archetype = classifyArchetype(classCtx);
    const lookupArchetypeId = archetype.textureArchetypeId ?? archetype.archetypeId;

    if (!hasTable(lookupArchetypeId, street)) {
      result.skipped++;
      continue;
    }

    // Categorize hero's hand
    const handCat = categorizeHand(cards, communityCards);

    // Look up GTO frequencies (with per-hand-class granularity)
    const handClass = comboToHandClass(cardsToCombo(cards[0], cards[1]));
    const lookup = lookupFrequencies(lookupArchetypeId, handCat.category, isIP, street, handClass);
    if (!lookup) {
      result.skipped++;
      continue;
    }

    const calibratedFreqs = calibrateWeakHand(lookup.frequencies, handCat.category);
    const ourAction = frequenciesToAction(calibratedFreqs);
    const solverAction = normalizeDecision(row.correctDecision);
    const solverProb = getActionProb(calibratedFreqs, solverAction);

    result.total++;
    result.solverProbSum += solverProb;

    const exact = ourAction === solverAction;
    const bothContinue =
      (ourAction !== "fold" && solverAction !== "fold") ||
      (ourAction === "fold" && solverAction === "fold");
    const inMix = solverProb >= 0.25;

    if (exact) {
      result.correct++;
    } else if (bothContinue) {
      result.close++;
    } else {
      result.miss++;
      if (result.misses.length < 50) {
        result.misses.push({
          hand: comboToHandClass(cardsToCombo(cards[0], cards[1])),
          pos: isIP ? "IP" : "OOP",
          arch: lookupArchetypeId,
          expected: solverAction,
          got: ourAction,
        });
      }
    }
    if (inMix) result.withinMix++;

    // By archetype
    const archKey = lookupArchetypeId;
    if (!result.byArchetype[archKey]) result.byArchetype[archKey] = { total: 0, correct: 0, close: 0, withinMix: 0 };
    result.byArchetype[archKey].total++;
    if (exact) result.byArchetype[archKey].correct++;
    else if (bothContinue) result.byArchetype[archKey].close++;
    if (inMix) result.byArchetype[archKey].withinMix++;

    // By hand category
    const catKey = handCat.category;
    if (!result.byHandStrength[catKey]) result.byHandStrength[catKey] = { total: 0, correct: 0, close: 0, withinMix: 0 };
    result.byHandStrength[catKey].total++;
    if (exact) result.byHandStrength[catKey].correct++;
    else if (bothContinue) result.byHandStrength[catKey].close++;
    if (inMix) result.byHandStrength[catKey].withinMix++;
  }

  result.avgSolverProb = result.total > 0 ? result.solverProbSum / result.total : 0;

  return result;
}

// ═══════════════════════════════════════════════════════
// REPORTING
// ═══════════════════════════════════════════════════════

function printReport(label: string, result: BenchmarkResult) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${label}`);
  console.log(`${"═".repeat(60)}`);

  const accuracy = result.total > 0 ? ((result.correct / result.total) * 100).toFixed(1) : "N/A";
  const closeRate = result.total > 0 ? (((result.correct + result.close) / result.total) * 100).toFixed(1) : "N/A";
  const mixRate = result.total > 0 ? ((result.withinMix / result.total) * 100).toFixed(1) : "N/A";
  const avgProb = result.total > 0 ? (result.avgSolverProb * 100).toFixed(1) : "N/A";

  console.log(`  Total: ${result.total}  |  Skipped: ${result.skipped}`);
  console.log(`  Exact match: ${result.correct} (${accuracy}%)`);
  console.log(`  Close (same direction): ${result.correct + result.close} (${closeRate}%)`);
  console.log(`  Within mix (solver action >= 25%): ${result.withinMix} (${mixRate}%)`);
  console.log(`  Avg probability assigned to solver's action: ${avgProb}%`);
  console.log(`  Misses (fold↔continue): ${result.miss}`);

  // By archetype
  console.log(`\n  By Archetype:`);
  for (const [arch, data] of Object.entries(result.byArchetype).sort((a, b) => b[1].total - a[1].total)) {
    const acc = ((data.correct / data.total) * 100).toFixed(1);
    const close = (((data.correct + data.close) / data.total) * 100).toFixed(1);
    const mix = data.withinMix !== undefined ? ((data.withinMix / data.total) * 100).toFixed(1) : "";
    console.log(`    ${arch.padEnd(28)} ${String(data.total).padStart(5)} scenarios  exact: ${acc.padStart(5)}%  close: ${close.padStart(5)}%${mix ? `  in-mix: ${mix.padStart(5)}%` : ""}`);
  }

  // By position
  if (Object.keys(result.byPosition).length > 0) {
    console.log(`\n  By Position:`);
    for (const [pos, data] of Object.entries(result.byPosition).sort((a, b) => b[1].total - a[1].total)) {
      const acc = ((data.correct / data.total) * 100).toFixed(1);
      console.log(`    ${pos.padEnd(6)} ${String(data.total).padStart(5)} scenarios  exact: ${acc.padStart(5)}%`);
    }
  }

  // By hand strength
  if (Object.keys(result.byHandStrength).length > 0) {
    console.log(`\n  By Hand Category:`);
    for (const [cat, data] of Object.entries(result.byHandStrength).sort((a, b) => b[1].total - a[1].total)) {
      const acc = ((data.correct / data.total) * 100).toFixed(1);
      const close = (((data.correct + data.close) / data.total) * 100).toFixed(1);
      const mix = data.withinMix !== undefined ? ((data.withinMix / data.total) * 100).toFixed(1) : "";
      console.log(`    ${cat.padEnd(24)} ${String(data.total).padStart(5)} scenarios  exact: ${acc.padStart(5)}%  close: ${close.padStart(5)}%${mix ? `  in-mix: ${mix.padStart(5)}%` : ""}`);
    }
  }

  // Sample misses
  if (result.misses.length > 0) {
    console.log(`\n  Sample Misses (fold↔continue):`);
    for (const m of result.misses.slice(0, 20)) {
      console.log(`    ${m.hand.padEnd(5)} ${m.pos.padEnd(4)} ${m.arch.padEnd(24)} solver: ${m.expected.padEnd(5)} engine: ${m.got}`);
    }
  }
}

// ═══════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════

const args = process.argv.slice(2);
const runPreflop = args.length === 0 || args.includes("--preflop") || args.includes("--all");
const runPostflop = args.length === 0 || args.includes("--postflop") || args.includes("--all");

console.log("HoldemVision Engine Benchmark vs PokerBench Solver Data");
console.log("=" .repeat(60));

if (runPreflop) {
  console.log("\nRunning preflop benchmark (1k test set)...");
  const preflopResult = benchmarkPreflop("preflop_1k_test_set_game_scenario_information.csv");
  printReport("PREFLOP (1k test set)", preflopResult);

  console.log("\nRunning preflop benchmark (60k train set)...");
  const preflopFullResult = benchmarkPreflop("preflop_60k_train_set_game_scenario_information.csv");
  printReport("PREFLOP (60k full set)", preflopFullResult);
}

if (runPostflop) {
  console.log("\nRunning postflop benchmark (10k test set)...");
  const postflopResult = benchmarkPostflop("postflop_10k_test_set_game_scenario_information.csv");
  printReport("POSTFLOP (10k test set)", postflopResult);
}

console.log("\n" + "=".repeat(60));
console.log("Benchmark complete.");
