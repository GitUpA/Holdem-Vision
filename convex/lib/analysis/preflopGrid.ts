/**
 * Preflop Grid Pipeline — pure functions for preflop hand grid computation.
 *
 * Each stage accepts explicit inputs and returns a typed output.
 * No React, no browser APIs, no mutation. Testable headless.
 *
 * Pipeline (via situation registry):
 *   Params → classifySituation (registry)
 *          → resolveOpponentRange / resolveHeroRange (registry)
 *          → computeEquityGrid (MC)
 *          → computePotAtAction
 *          → classifyAction (R/C/F per cell)
 *          → computePreflopHandGrid (orchestrator)
 *
 * Pure TypeScript, zero Convex/React imports.
 */

import type { CardIndex } from "../types/cards";
import type { Position } from "../types/cards";
import { evaluateHand, compareHandRanks } from "../primitives/handEvaluator";
import { getPreflopEquity } from "../gto/preflopEquityTable";
// Range table imports removed — range resolution now in convex/lib/preflop/situationRanges.ts
// Re-export from canonical location for backward compatibility
export { normalize6Max, compressRangeByStack, getHeroHandClass } from "../preflop/rangeUtils";
import { RANK_LABELS, GRID_TO_RANK, getHeroHandClass } from "../preflop/rangeUtils";
import {
  classifySituation,
  PREFLOP_SITUATIONS,
  resolveOpponentCount,
  type PreflopSituationContext,
  type PreflopSituationId,
} from "../preflop/situationRegistry";
import { resolveOpponentRange, resolveHeroRange } from "../preflop/situationRanges";
import { classifyPreflopHand, type PreflopRangeClass } from "../gto/preflopClassification";

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
  numLimpers?: number;              // default 0
  facing3Bet?: boolean;             // default false
  facing4Bet?: boolean;             // default false
  threeBetSizeBB?: number | null;
  threeBettorPosition?: Position | null;
  isSBComplete?: boolean;           // default false
  blindsBB?: { sb: number; bb: number };
}

// PreflopSituation type — REMOVED (Phase 3 cleanup)
// Use PreflopSituationContext from convex/lib/preflop/situationRegistry instead.
// Re-export for any remaining external consumers:
export type { PreflopSituationContext as PreflopSituation } from "../preflop/situationRegistry";

/** The three fundamental poker actions */
export type ActionLetter = "R" | "C" | "F";

/** How confident the action is based on range boundary distance */
export type ActionConfidence = "clear" | "standard" | "edge";

export interface PreflopGridCell {
  handClass: string;
  row: number;
  col: number;
  type: "pair" | "suited" | "offsuit";
  isHero: boolean;
  equity: number;
  action: ActionLetter | null;
  actionConfidence: ActionConfidence;
  inHeroRange: boolean;
  inOpponentRange: boolean;
}

export interface PreflopGridResult {
  cells: PreflopGridCell[];
  heroHandClass: string;
  heroEquity: number;
  situation: PreflopSituationContext;
  opponentRange: Set<string> | null;
  heroContinueRange: Set<string>;
  potSizeBB: number;
  spr: number;
  isPotCommitted: boolean;
}

// RL and GRID_TO_RANK moved to ../preflop/rangeUtils.ts as RANK_LABELS and GRID_TO_RANK
const RL = RANK_LABELS; // local alias for brevity in grid loops

// ═══════════════════════════════════════════════════════
// POT ARITHMETIC
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
// EQUITY COMPUTATION
// ═══════════════════════════════════════════════════════

export function computeEquityGrid(
  heroCards: CardIndex[],
  opponentRange: Set<string> | null,
  trials: number = 300,
  numOpponents: number = 1,
): Map<string, number> {
  // No opponent range — use static equity vs N random opponents
  if (!opponentRange || opponentRange.size === 0) {
    const result = new Map<string, number>();
    for (let row = 0; row < 13; row++) {
      for (let col = 0; col < 13; col++) {
        const hc = row === col ? RL[row] + RL[col]
          : row < col ? RL[row] + RL[col] + "s"
          : RL[col] + RL[row] + "o";
        result.set(hc, getPreflopEquity(hc, numOpponents));
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
      result.set(hc, getPreflopEquity(hc, numOpponents));
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
// ACTION CLASSIFICATION (R/C/F)
// ═══════════════════════════════════════════════════════

const OPENING_SITUATIONS = new Set(["rfi", "facing_limpers", "bb_vs_limpers", "bb_vs_sb_complete", "bb_uncontested"]);

export function classifyAction(
  equity: number,
  inHeroRange: boolean,
  rangeClass: PreflopRangeClass,
  callCostBB: number,
  potSizeBB: number,
  situationId: string,
): ActionLetter {
  if (!inHeroRange) return "F";

  if (rangeClass === "clear_raise" || rangeClass === "raise") return "R";
  if (rangeClass === "mixed_raise") return "C"; // majority action is call; coaching notes raise is valid
  if (rangeClass === "call") return "C";

  if (rangeClass === "borderline") {
    if (OPENING_SITUATIONS.has(situationId)) return "F"; // not strong enough to open
    const potOdds = callCostBB / (potSizeBB + callCostBB);
    return equity > potOdds + 0.05 ? "C" : "F";
  }

  return "F";
}

export function actionConfidence(boundaryDistance: number): ActionConfidence {
  if (boundaryDistance >= 8) return "clear";
  if (boundaryDistance >= 3) return "standard";
  return "edge";
}

// ═══════════════════════════════════════════════════════
// STAGE H: Orchestrator
// ═══════════════════════════════════════════════════════

// getHeroHandClass in ../preflop/rangeUtils.ts — re-exported above

function emptyResult(heroPosition: Position, tableSize: number = 6, blindsBB: { sb: number; bb: number } = { sb: 0.5, bb: 1 }): PreflopGridResult {
  const defaultOpp = Math.max(1, Math.min(9, tableSize - 1));
  const cells: PreflopGridCell[] = [];
  for (let row = 0; row < 13; row++) for (let col = 0; col < 13; col++) {
    const hc = row === col ? RL[row] + RL[col] : row < col ? RL[row] + RL[col] + "s" : RL[col] + RL[row] + "o";
    cells.push({ handClass: hc, row, col, type: row === col ? "pair" : row < col ? "suited" : "offsuit", isHero: false, equity: getPreflopEquity(hc, defaultOpp), action: null, actionConfidence: "standard" as ActionConfidence, inHeroRange: false, inOpponentRange: false });
  }
  const emptySituation = classifySituation({ heroPosition, tableSize, openerPosition: null, numCallers: 0, numLimpers: 0, facing3Bet: false });
  const emptyPot = blindsBB.sb + blindsBB.bb;
  return { cells, heroHandClass: "", heroEquity: 0, situation: emptySituation, opponentRange: null, heroContinueRange: new Set(), potSizeBB: emptyPot, spr: Infinity, isPotCommitted: false };
}

export function computePreflopHandGrid(params: PreflopGridParams, mcTrials: number = 300): PreflopGridResult {
  const {
    heroCards,
    heroPosition,
    tableSize = 6,
    stackDepthBB = 100,
    openerPosition = null,
    openerSizingBB = 0,
    numCallers = 0,
    numLimpers = 0,
    facing3Bet = false,
    facing4Bet = false,
    threeBetSizeBB = null,
    isSBComplete = false,
    blindsBB = { sb: 0.5, bb: 1 },
  } = params;

  if (!heroCards || heroCards.length < 2) {
    return emptyResult(heroPosition, tableSize, { sb: blindsBB.sb, bb: blindsBB.bb });
  }

  const heroHandClass = getHeroHandClass(heroCards);
  const threeBettorPos = params.threeBettorPosition ?? null;

  // ── Classify via registry ──
  const ctx = classifySituation({
    heroPosition,
    tableSize,
    openerPosition,
    numCallers,
    numLimpers,
    facing3Bet,
    threeBettorPosition: threeBettorPos,
    facing4Bet,
    isSBComplete,
  });

  // ── Resolve ranges via registry ──
  const entry = PREFLOP_SITUATIONS[ctx.id];
  const numOpponents = resolveOpponentCount(entry, ctx);
  const opponentRange = resolveOpponentRange(ctx, stackDepthBB, openerSizingBB);
  const heroContinueRange = resolveHeroRange(ctx, stackDepthBB);
  const equityMap = computeEquityGrid(heroCards, opponentRange, mcTrials, numOpponents);
  const potSizeBB = computePotAtAction(blindsBB, openerSizingBB, numCallers, facing3Bet, threeBetSizeBB);

  // Call cost subtracts what hero already posted as a blind
  const heroPosted = heroPosition === "bb" ? blindsBB.bb
    : heroPosition === "sb" ? blindsBB.sb : 0;
  const rawCallCost = facing3Bet && threeBetSizeBB ? threeBetSizeBB : openerSizingBB;
  const callCost = Math.max(0, rawCallCost - heroPosted);

  // Build cells with R/C/F action classification
  const cells: PreflopGridCell[] = [];
  for (let row = 0; row < 13; row++) {
    for (let col = 0; col < 13; col++) {
      const type: "pair" | "suited" | "offsuit" = row === col ? "pair" : row < col ? "suited" : "offsuit";
      const hc = row === col ? RL[row] + RL[col]
        : row < col ? RL[row] + RL[col] + "s"
        : RL[col] + RL[row] + "o";
      const cellEquity = equityMap.get(hc) ?? getPreflopEquity(hc, numOpponents);
      const inRange = heroContinueRange.has(hc);

      // Classify each cell's action via range class
      const classification = classifyPreflopHand(hc, ctx.id, heroPosition, openerPosition ?? undefined);
      const cellAction = classifyAction(cellEquity, inRange, classification.rangeClass, callCost, potSizeBB, ctx.id);
      const cellConfidence = actionConfidence(classification.boundaryDistance);

      cells.push({
        handClass: hc,
        row,
        col,
        type,
        isHero: hc === heroHandClass,
        equity: cellEquity,
        action: cellAction,
        actionConfidence: cellConfidence,
        inHeroRange: inRange,
        inOpponentRange: opponentRange?.has(hc) ?? false,
      });
    }
  }

  return {
    cells,
    heroHandClass,
    heroEquity: equityMap.get(heroHandClass) ?? getPreflopEquity(heroHandClass, numOpponents),
    situation: ctx,
    opponentRange,
    heroContinueRange,
    potSizeBB,
    spr: potSizeBB > 0 ? stackDepthBB / potSizeBB : Infinity,
    isPotCommitted: potSizeBB > 0 && (stackDepthBB / potSizeBB) < 0.5,
  };
}
