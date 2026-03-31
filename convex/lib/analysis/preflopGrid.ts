/**
 * Preflop Grid Pipeline — pure functions for preflop hand grid computation.
 *
 * Each stage accepts explicit inputs and returns a typed output.
 * No React, no browser APIs, no mutation. Testable headless.
 *
 * Pipeline:
 *   Params → [B] classifyPreflopSituation
 *          → [C] getOpponentRange
 *          → [D] getHeroContinueRange
 *          → [E] computeEquityGrid (MC)
 *          → [G] computePotAtAction
 *          → [F] classifyFacingGrid
 *          → [H] computePreflopHandGrid (orchestrator)
 *
 * Pure TypeScript, zero Convex/React imports.
 */

import type { CardIndex } from "../types/cards";
import type { Position } from "../types/cards";
import { evaluateHand, compareHandRanks } from "../primitives/handEvaluator";
import { getPreflopEquity } from "../gto/preflopEquityTable";
import {
  GTO_RFI_RANGES,
  GTO_3BET_RANGES,
  GTO_COLD_CALL_RANGES,
  GTO_3BET_MIXED,
  GTO_BB_DEFENSE,
  GTO_BVB,
  GTO_4BET,
} from "../gto/tables/preflopRanges";
import { HAND_STRENGTH_ORDER } from "../gto/preflopClassification";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

/** All variables that affect preflop grid computation. */
export interface PreflopGridParams {
  heroCards: CardIndex[];
  heroPosition: Position;
  tableSize?: number;               // default 6
  stackDepthBB?: number;            // default 100
  openerPosition?: Position | null;
  openerSizingBB?: number;          // default 0 (no open yet)
  numCallers?: number;              // default 0
  facing3Bet?: boolean;             // default false
  threeBetSizeBB?: number | null;
  threeBettorPosition?: Position | null;
  blindsBB?: { sb: number; bb: number };
}

/** The preflop situation classification. */
export type PreflopSituation =
  | { type: "rfi" }
  | { type: "facing_open"; opener: Position }
  | { type: "facing_open_multiway"; opener: Position; callers: number }
  | { type: "facing_3bet"; threeBettor: Position }
  | { type: "blind_vs_blind" }
  | { type: "facing_4bet" };

export type SizingRole = "V" | "M" | "B" | "F";

export interface PreflopGridCell {
  handClass: string;
  row: number;
  col: number;
  type: "pair" | "suited" | "offsuit";
  isHero: boolean;
  equity: number;
  facing: SizingRole | null;
  inHeroRange: boolean;
  inOpponentRange: boolean;
}

export interface PreflopGridResult {
  cells: PreflopGridCell[];
  heroHandClass: string;
  heroEquity: number;
  situation: PreflopSituation;
  opponentRange: Set<string> | null;
  heroContinueRange: Set<string>;
  potSizeBB: number;
}

const RL = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
const GRID_TO_RANK = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];

// ═══════════════════════════════════════════════════════
// STAGE B: Classify the preflop situation
// ═══════════════════════════════════════════════════════

export function classifyPreflopSituation(
  heroPosition: Position,
  openerPosition: Position | null | undefined,
  numCallers: number,
  facing3Bet: boolean,
  threeBettorPosition?: Position | null,
): PreflopSituation {
  // Facing a 3-bet (hero opened, got re-raised)
  if (facing3Bet && threeBettorPosition) {
    return { type: "facing_3bet", threeBettor: threeBettorPosition };
  }

  // No opener — hero is first to act (RFI)
  if (!openerPosition) {
    return { type: "rfi" };
  }

  // Blind vs blind: SB opened, hero is BB (or vice versa)
  const blinds = new Set(["sb", "bb"]);
  if (blinds.has(heroPosition) && blinds.has(openerPosition) && numCallers === 0) {
    return { type: "blind_vs_blind" };
  }

  // Facing a single open with callers behind
  if (numCallers > 0) {
    return { type: "facing_open_multiway", opener: openerPosition, callers: numCallers };
  }

  // Facing a single open, heads up decision
  return { type: "facing_open", opener: openerPosition };
}

// ═══════════════════════════════════════════════════════
// STAGE G: Compute pot size at hero's action point
// ═══════════════════════════════════════════════════════

export function computePotAtAction(
  blindsBB: { sb: number; bb: number },
  openerSizingBB: number,
  numCallers: number,
  facing3Bet: boolean,
  threeBetSizeBB: number | null,
): number {
  const blindsTotal = blindsBB.sb + blindsBB.bb;

  if (openerSizingBB <= 0) {
    // No raise yet — pot is just blinds (RFI or limped)
    return blindsTotal;
  }

  if (facing3Bet && threeBetSizeBB) {
    // Pot = blinds + opener's raise + 3-bettor's raise + any callers of the open
    return blindsTotal + openerSizingBB + threeBetSizeBB + (numCallers * openerSizingBB);
  }

  // Single raise: pot = blinds + opener's raise + callers who called the raise
  return blindsTotal + openerSizingBB + (numCallers * openerSizingBB);
}

// ═══════════════════════════════════════════════════════
// POSITION NORMALIZATION (map non-6max to 6max equivalents)
// ═══════════════════════════════════════════════════════

/** Map any table-size position to the nearest 6-max equivalent for range lookup. */
export function normalize6Max(pos: string): string {
  switch (pos) {
    case "utg1": case "utg2": return "utg";
    case "mp": case "mp1": return "hj";
    default: return pos;
  }
}

// ═══════════════════════════════════════════════════════
// STACK DEPTH ADJUSTMENT
// ═══════════════════════════════════════════════════════

/**
 * Compress a range based on stack depth.
 *
 * At 100BB: full range (no compression).
 * At 40BB: remove bottom ~20% of range (speculative hands lose implied odds).
 * At 20BB: remove bottom ~40% (shove/fold territory — only premiums + high cards).
 * Below 15BB: keep only top ~40% of the range.
 *
 * Uses HAND_STRENGTH_ORDER to identify which hands to drop from the bottom.
 */
export function compressRangeByStack(range: Set<string>, stackDepthBB: number): Set<string> {
  if (stackDepthBB >= 80) return range; // deep stack — no compression

  // Compression factor: 0 at 80BB, 1 at 10BB
  const compression = Math.min(1, Math.max(0, (80 - stackDepthBB) / 70));
  // Remove bottom X% of the range by hand strength
  const dropPct = compression * 0.5; // at 10BB, drop bottom 50%

  // Rank each hand in the range by strength order
  const rankedHands = [...range].sort((a, b) => {
    const idxA = HAND_STRENGTH_ORDER.indexOf(a);
    const idxB = HAND_STRENGTH_ORDER.indexOf(b);
    return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
  });

  const keepCount = Math.max(1, Math.ceil(rankedHands.length * (1 - dropPct)));
  return new Set(rankedHands.slice(0, keepCount));
}

// ═══════════════════════════════════════════════════════
// STAGE C: Get opponent's range
// ═══════════════════════════════════════════════════════

export function getOpponentRange(
  situation: PreflopSituation,
  stackDepthBB: number = 100,
  openerSizingBB: number = 0,
): Set<string> | null {
  let range: Set<string> | null = null;

  switch (situation.type) {
    case "rfi":
      return null;
    case "facing_open":
    case "facing_open_multiway":
      range = GTO_RFI_RANGES[normalize6Max(situation.opener)] ?? null; break;
    case "facing_3bet":
      range = GTO_3BET_RANGES[normalize6Max(situation.threeBettor)] ?? null; break;
    case "blind_vs_blind":
      range = GTO_RFI_RANGES["sb"] ?? null; break;
    case "facing_4bet":
      range = GTO_4BET.value ? new Set([...GTO_4BET.value, ...GTO_4BET.bluffs]) : null; break;
  }

  if (!range) return null;

  // Stack compression
  let compressed = compressRangeByStack(range, stackDepthBB);

  // Sizing adjustment: larger opens imply tighter ranges.
  // Standard open is ~2.5-3BB. Above 4BB, drop bottom X% of range.
  if (openerSizingBB > 4 && compressed.size > 3) {
    const excessSizing = openerSizingBB - 4;
    const dropPct = Math.min(0.4, excessSizing * 0.08); // 5BB→8%, 8BB→32%, 9BB→40%
    const ranked = [...compressed].sort((a, b) => {
      const idxA = HAND_STRENGTH_ORDER.indexOf(a);
      const idxB = HAND_STRENGTH_ORDER.indexOf(b);
      return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
    });
    const keepCount = Math.max(3, Math.ceil(ranked.length * (1 - dropPct)));
    compressed = new Set(ranked.slice(0, keepCount));
  }

  return compressed;
}

// ═══════════════════════════════════════════════════════
// STAGE D: Get hero's continue range
// ═══════════════════════════════════════════════════════

export function getHeroContinueRange(
  situation: PreflopSituation,
  heroPosition: Position,
  stackDepthBB: number = 100,
): Set<string> {
  const combined = new Set<string>();
  const normPos = normalize6Max(heroPosition);

  switch (situation.type) {
    case "rfi": {
      const rfi = GTO_RFI_RANGES[normPos];
      if (rfi) for (const h of rfi) combined.add(h);
      break;
    }

    case "facing_open":
    case "facing_open_multiway": {
      if (heroPosition === "bb") {
        const opener = normalize6Max(situation.opener);
        if (opener === "sb") {
          const bvb3bet = (GTO_BVB as Record<string, Set<string>>)["bb_3bet_vs_sb"];
          const bvbCall = (GTO_BVB as Record<string, Set<string>>)["bb_call_vs_sb"];
          if (bvb3bet) for (const h of bvb3bet) combined.add(h);
          if (bvbCall) for (const h of bvbCall) combined.add(h);
        } else {
          const key = opener === "co" ? "vs_co"
            : opener === "btn" ? "vs_btn"
            : opener === "hj" ? "vs_hj"
            : "vs_utg";
          const defense = GTO_BB_DEFENSE[key];
          if (defense) {
            for (const h of defense.threebet) combined.add(h);
            for (const h of defense.call) combined.add(h);
          }
        }
      } else {
        const coldCall = GTO_COLD_CALL_RANGES[normPos];
        const threeBet = GTO_3BET_RANGES[normPos];
        const mixed = GTO_3BET_MIXED[normPos];
        if (coldCall) for (const h of coldCall) combined.add(h);
        if (threeBet) for (const h of threeBet) combined.add(h);
        if (mixed) for (const h of mixed) combined.add(h);
      }
      break;
    }

    case "facing_3bet":
    case "facing_4bet": {
      if (GTO_4BET.value) for (const h of GTO_4BET.value) combined.add(h);
      if (GTO_4BET.call) for (const h of GTO_4BET.call) combined.add(h);
      break;
    }

    case "blind_vs_blind": {
      if (heroPosition === "bb") {
        const bvb3bet = (GTO_BVB as Record<string, Set<string>>)["bb_3bet_vs_sb"];
        const bvbCall = (GTO_BVB as Record<string, Set<string>>)["bb_call_vs_sb"];
        if (bvb3bet) for (const h of bvb3bet) combined.add(h);
        if (bvbCall) for (const h of bvbCall) combined.add(h);
      } else {
        const rfi = GTO_RFI_RANGES["sb"];
        if (rfi) for (const h of rfi) combined.add(h);
      }
      break;
    }
  }

  // Multiway adjustment: each additional caller tightens the continue range
  // because equity drops multiway and speculative hands lose value.
  // Model: treat each caller as reducing effective stack by 15BB (less implied odds).
  const numCallers = (situation.type === "facing_open_multiway") ? situation.callers : 0;
  const effectiveStack = stackDepthBB - (numCallers * 15);

  return compressRangeByStack(combined, effectiveStack);
}

// ═══════════════════════════════════════════════════════
// STAGE E: Compute equity for all 169 hand classes vs a range
// ═══════════════════════════════════════════════════════

export function computeEquityGrid(
  heroCards: CardIndex[],
  opponentRange: Set<string> | null,
  trials: number = 300,
): Map<string, number> {
  // No opponent range — use static equity vs random
  if (!opponentRange || opponentRange.size === 0) {
    const result = new Map<string, number>();
    for (let row = 0; row < 13; row++) {
      for (let col = 0; col < 13; col++) {
        const hc = row === col ? RL[row] + RL[col]
          : row < col ? RL[row] + RL[col] + "s"
          : RL[col] + RL[row] + "o";
        result.set(hc, getPreflopEquity(hc));
      }
    }
    return result;
  }

  // Build opponent combos from range
  const oppCombos: [number, number][] = [];
  for (const hc of opponentRange) {
    const isP = hc.length === 2;
    const isS = hc.endsWith("s");
    const r1 = 12 - RL.indexOf(hc[0]);
    const r2 = 12 - RL.indexOf(hc[1]);
    if (isP) {
      for (let s1 = 0; s1 < 4; s1++) for (let s2 = s1 + 1; s2 < 4; s2++)
        oppCombos.push([r1 * 4 + s1, r1 * 4 + s2]);
    } else {
      for (let s1 = 0; s1 < 4; s1++) for (let s2 = 0; s2 < 4; s2++) {
        if (isS && s1 !== s2) continue;
        if (!isS && s1 === s2) continue;
        oppCombos.push([r1 * 4 + s1, r2 * 4 + s2]);
      }
    }
  }
  if (oppCombos.length === 0) {
    const result = new Map<string, number>();
    for (let row = 0; row < 13; row++) for (let col = 0; col < 13; col++) {
      const hc = row === col ? RL[row] + RL[col] : row < col ? RL[row] + RL[col] + "s" : RL[col] + RL[row] + "o";
      result.set(hc, getPreflopEquity(hc));
    }
    return result;
  }

  const result = new Map<string, number>();

  for (let row = 0; row < 13; row++) {
    for (let col = 0; col < 13; col++) {
      const type = row === col ? "pair" : row < col ? "suited" : "offsuit";
      const hc = row === col ? RL[row] + RL[col] : row < col ? RL[row] + RL[col] + "s" : RL[col] + RL[row] + "o";
      const rank1 = GRID_TO_RANK[row];
      const rank2 = GRID_TO_RANK[col];

      // Pick representative combo
      let heroC1: number, heroC2: number;
      if (type === "pair") { heroC1 = rank1 * 4; heroC2 = rank1 * 4 + 1; }
      else if (type === "suited") { heroC1 = rank1 * 4; heroC2 = rank2 * 4; }
      else { heroC1 = rank1 * 4; heroC2 = rank2 * 4 + 1; }

      const heroDead = new Set([heroC1, heroC2]);
      const validOpp = oppCombos.filter(([a, b]) => !heroDead.has(a) && !heroDead.has(b));
      if (validOpp.length === 0) { result.set(hc, 0.5); continue; }

      const deck: number[] = [];
      for (let i = 0; i < 52; i++) if (!heroDead.has(i)) deck.push(i);

      let wins = 0, total = 0;
      for (let t = 0; t < trials; t++) {
        const opp = validOpp[Math.floor(Math.random() * validOpp.length)];
        const available = deck.filter(c => c !== opp[0] && c !== opp[1]);
        if (available.length < 5) continue;
        for (let i = available.length - 1; i > available.length - 6; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [available[i], available[j]] = [available[j], available[i]];
        }
        const board = available.slice(available.length - 5);
        const heroEval = evaluateHand([heroC1, heroC2, ...board] as CardIndex[]);
        const oppEval = evaluateHand([opp[0], opp[1], ...board] as CardIndex[]);
        const cmp = compareHandRanks(heroEval.rank, oppEval.rank);
        if (cmp > 0) wins++; else if (cmp === 0) wins += 0.5;
        total++;
      }
      result.set(hc, total > 0 ? wins / total : 0.5);
    }
  }
  return result;
}

// ═══════════════════════════════════════════════════════
// STAGE F: Classify facing decision for each hand class
// ═══════════════════════════════════════════════════════

export function classifyFacing(
  equity: number,
  callCostBB: number,
  potSizeBB: number,
  inHeroRange: boolean,
): SizingRole {
  if (!inHeroRange) return "F";
  if (callCostBB <= 0) return "M";

  const potOdds = callCostBB / (potSizeBB + callCostBB);
  const surplus = equity - potOdds;
  const polarization = Math.min(1, Math.max(0, (callCostBB - 2) / 10));

  if (equity >= 0.70) return "V";
  if (surplus > 0.15) return "V";
  if (surplus > 0.05) return "M";
  if (surplus > -0.05 && polarization > 0.3) return "B";
  if (surplus > -0.03) return "M";
  return "F";
}

export function classifyFacingGrid(
  equityMap: Map<string, number>,
  heroContinueRange: Set<string>,
  callCostBB: number,
  potSizeBB: number,
): Map<string, SizingRole> {
  const result = new Map<string, SizingRole>();
  for (const [hc, equity] of equityMap) {
    result.set(hc, classifyFacing(equity, callCostBB, potSizeBB, heroContinueRange.has(hc)));
  }
  return result;
}

// ═══════════════════════════════════════════════════════
// STAGE H: Orchestrator
// ═══════════════════════════════════════════════════════

export function getHeroHandClass(heroCards: CardIndex[]): string {
  const r0 = Math.floor(heroCards[0] / 4);
  const r1 = Math.floor(heroCards[1] / 4);
  const suited = (heroCards[0] % 4) === (heroCards[1] % 4);
  const hi = Math.max(r0, r1);
  const lo = Math.min(r0, r1);
  return RL[12 - hi] + (hi === lo ? RL[12 - lo] : RL[12 - lo] + (suited ? "s" : "o"));
}

function emptyResult(heroPosition: Position, blindsBB: { sb: number; bb: number } = { sb: 0.5, bb: 1 }): PreflopGridResult {
  const cells: PreflopGridCell[] = [];
  for (let row = 0; row < 13; row++) for (let col = 0; col < 13; col++) {
    const hc = row === col ? RL[row] + RL[col] : row < col ? RL[row] + RL[col] + "s" : RL[col] + RL[row] + "o";
    cells.push({ handClass: hc, row, col, type: row === col ? "pair" : row < col ? "suited" : "offsuit", isHero: false, equity: getPreflopEquity(hc), facing: null, inHeroRange: false, inOpponentRange: false });
  }
  return { cells, heroHandClass: "", heroEquity: 0, situation: { type: "rfi" }, opponentRange: null, heroContinueRange: new Set(), potSizeBB: blindsBB.sb + blindsBB.bb };
}

export function computePreflopHandGrid(params: PreflopGridParams, mcTrials: number = 300): PreflopGridResult {
  const {
    heroCards,
    heroPosition,
    stackDepthBB = 100,
    openerPosition = null,
    openerSizingBB = 0,
    numCallers = 0,
    facing3Bet = false,
    threeBetSizeBB = null,
    blindsBB = { sb: 0.5, bb: 1 },
  } = params;

  if (!heroCards || heroCards.length < 2) {
    // Not enough cards — return empty grid
    return emptyResult(heroPosition, { sb: blindsBB.sb, bb: blindsBB.bb });
  }

  const heroHandClass = getHeroHandClass(heroCards);
  const threeBettorPos = params.threeBettorPosition ?? null;
  const situation = classifyPreflopSituation(heroPosition, openerPosition, numCallers, facing3Bet, threeBettorPos);
  const opponentRange = getOpponentRange(situation, stackDepthBB, openerSizingBB);
  const heroContinueRange = getHeroContinueRange(situation, heroPosition, stackDepthBB);
  const equityMap = computeEquityGrid(heroCards, opponentRange, mcTrials);
  const potSizeBB = computePotAtAction(blindsBB, openerSizingBB, numCallers, facing3Bet, threeBetSizeBB);

  // Call cost subtracts what hero already posted as a blind
  const heroPosted = heroPosition === "bb" ? blindsBB.bb
    : heroPosition === "sb" ? blindsBB.sb : 0;
  const rawCallCost = facing3Bet && threeBetSizeBB ? threeBetSizeBB : openerSizingBB;
  const callCost = Math.max(0, rawCallCost - heroPosted);
  const facingGrid = callCost > 0
    ? classifyFacingGrid(equityMap, heroContinueRange, callCost, potSizeBB)
    : null;

  // Build cells
  const cells: PreflopGridCell[] = [];
  for (let row = 0; row < 13; row++) {
    for (let col = 0; col < 13; col++) {
      const type: "pair" | "suited" | "offsuit" = row === col ? "pair" : row < col ? "suited" : "offsuit";
      const hc = row === col ? RL[row] + RL[col]
        : row < col ? RL[row] + RL[col] + "s"
        : RL[col] + RL[row] + "o";
      cells.push({
        handClass: hc,
        row,
        col,
        type,
        isHero: hc === heroHandClass,
        equity: equityMap.get(hc) ?? getPreflopEquity(hc),
        facing: facingGrid?.get(hc) ?? null,
        inHeroRange: heroContinueRange.has(hc),
        inOpponentRange: opponentRange?.has(hc) ?? false,
      });
    }
  }

  return {
    cells,
    heroHandClass,
    heroEquity: equityMap.get(heroHandClass) ?? getPreflopEquity(heroHandClass),
    situation,
    opponentRange,
    heroContinueRange,
    potSizeBB,
  };
}
