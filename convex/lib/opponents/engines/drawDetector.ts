/**
 * Draw Detector — lightweight draw detection for decision engines.
 *
 * Detects flush draws, straight draws (OESD/gutshot), backdoor flushes,
 * and combo draws from hole cards + community cards. Returns structured
 * DrawInfo that engines use to modulate decisions.
 *
 * Simplified from the analysis-layer DrawLens — no AnalysisContext,
 * no visual directives, no explanation trees. Uses approximate out counts
 * (9 flush, 8 OESD, 4 gutshot) which is sufficient for behavioral adjustment.
 *
 * Pure TypeScript, zero Convex imports.
 */
import type { CardIndex } from "../../types/cards";
import { rankValue, suitValue } from "../../primitives/card";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export type DrawType =
  | "combo"
  | "flush_draw"
  | "oesd"
  | "gutshot"
  | "backdoor_flush"
  | "none";

export interface DrawInfo {
  /** 4 cards of one suit with hero contributing ≥1 */
  hasFlushDraw: boolean;
  /** OESD or gutshot with hero contributing */
  hasStraightDraw: boolean;
  /** 3 of suit on flop with hero contributing ≥1 */
  hasBackdoorFlush: boolean;
  /** Both flush and straight draw */
  isCombo: boolean;
  /** Approximate flush draw outs (0 or 9) */
  flushOuts: number;
  /** Approximate straight draw outs (0, 4 for gutshot, 8 for OESD) */
  straightOuts: number;
  /** Deduplicated total outs across all draws */
  totalOuts: number;
  /** Best draw classification */
  bestDrawType: DrawType;
}

const EMPTY_DRAW: DrawInfo = {
  hasFlushDraw: false,
  hasStraightDraw: false,
  hasBackdoorFlush: false,
  isCombo: false,
  flushOuts: 0,
  straightOuts: 0,
  totalOuts: 0,
  bestDrawType: "none",
};

// ═══════════════════════════════════════════════════════
// MAIN FUNCTION
// ═══════════════════════════════════════════════════════

/**
 * Detect draws from hole cards + community cards.
 * Returns DrawInfo with draw types and approximate out counts.
 *
 * Only meaningful postflop (community.length >= 3).
 * Returns empty result for preflop or insufficient cards.
 */
export function detectDraws(
  holeCards: CardIndex[],
  communityCards: CardIndex[],
): DrawInfo {
  if (holeCards.length < 2 || communityCards.length < 3) {
    return EMPTY_DRAW;
  }

  const allCards = [...holeCards, ...communityCards];
  const heroRankSet = new Set(holeCards.map(rankValue));

  // ── Flush draw detection ──
  const flushResult = detectFlush(holeCards, allCards);

  // ── Backdoor flush (flop only) ──
  const hasBackdoorFlush =
    communityCards.length === 3 && !flushResult.hasFlushDraw
      ? detectBackdoorFlush(holeCards, allCards)
      : false;

  // ── Straight draw detection ──
  const straightResult = detectStraight(allCards, heroRankSet);

  // ── Combine results ──
  const isCombo = flushResult.hasFlushDraw && straightResult.hasStraightDraw;

  // Deduplicate outs: flush and straight can share cards.
  // Approximate: if combo, overlap is roughly (straightOuts that share the flush suit).
  // For simplicity: flush_outs + straight_outs - estimated_overlap
  let totalOuts: number;
  if (isCombo) {
    // On average ~2 straight outs share the flush suit (out of 4-8 straight outs)
    const overlap = Math.min(
      Math.round(straightResult.straightOuts / 4),
      flushResult.flushOuts,
    );
    totalOuts = flushResult.flushOuts + straightResult.straightOuts - overlap;
  } else {
    totalOuts = flushResult.flushOuts + straightResult.straightOuts;
  }

  // Add ~1 effective out for backdoor flush (very rough approximation)
  if (hasBackdoorFlush && totalOuts === 0) {
    totalOuts = 1;
  }

  // Classify best draw
  let bestDrawType: DrawType = "none";
  if (isCombo) bestDrawType = "combo";
  else if (flushResult.hasFlushDraw) bestDrawType = "flush_draw";
  else if (straightResult.isOESD) bestDrawType = "oesd";
  else if (straightResult.hasStraightDraw) bestDrawType = "gutshot";
  else if (hasBackdoorFlush) bestDrawType = "backdoor_flush";

  return {
    hasFlushDraw: flushResult.hasFlushDraw,
    hasStraightDraw: straightResult.hasStraightDraw,
    hasBackdoorFlush,
    isCombo,
    flushOuts: flushResult.flushOuts,
    straightOuts: straightResult.straightOuts,
    totalOuts,
    bestDrawType,
  };
}

// ═══════════════════════════════════════════════════════
// FLUSH DETECTION
// ═══════════════════════════════════════════════════════

function detectFlush(
  holeCards: CardIndex[],
  allCards: CardIndex[],
): { hasFlushDraw: boolean; flushOuts: number } {
  for (let suit = 0; suit < 4; suit++) {
    const suitCount = allCards.filter((c) => suitValue(c) === suit).length;
    const heroHasSuit = holeCards.some((c) => suitValue(c) === suit);

    // 4 of the suit with hero contributing = flush draw (9 outs remaining)
    if (suitCount === 4 && heroHasSuit) {
      return { hasFlushDraw: true, flushOuts: 9 };
    }
  }
  return { hasFlushDraw: false, flushOuts: 0 };
}

function detectBackdoorFlush(
  holeCards: CardIndex[],
  allCards: CardIndex[],
): boolean {
  for (let suit = 0; suit < 4; suit++) {
    const suitCount = allCards.filter((c) => suitValue(c) === suit).length;
    const heroHasSuit = holeCards.some((c) => suitValue(c) === suit);

    // 3 of the suit with hero contributing = backdoor flush draw
    if (suitCount === 3 && heroHasSuit) {
      return true;
    }
  }
  return false;
}

// ═══════════════════════════════════════════════════════
// STRAIGHT DETECTION
// ═══════════════════════════════════════════════════════

function detectStraight(
  allCards: CardIndex[],
  heroRanks: Set<number>,
): { hasStraightDraw: boolean; isOESD: boolean; straightOuts: number } {
  const allRanks = [...new Set(allCards.map(rankValue))].sort((a, b) => a - b);
  const allRankSet = new Set(allRanks);

  let bestOuts = 0;
  let bestIsOESD = false;

  // Check all 5-rank windows (0-4, 1-5, ..., 8-12) + wheel (A-2-3-4-5)
  const windows: number[][] = [];
  for (let low = 0; low <= 8; low++) {
    windows.push([low, low + 1, low + 2, low + 3, low + 4]);
  }
  // Wheel: A(12)-2(0)-3(1)-4(2)-5(3)
  windows.push([0, 1, 2, 3, 12]);

  for (const window of windows) {
    const haveCount = window.filter((r) => allRankSet.has(r)).length;
    const heroContributes = window.some((r) => heroRanks.has(r));

    if (haveCount === 4 && heroContributes) {
      const missing = window.filter((r) => !allRankSet.has(r));

      if (missing.length === 1) {
        const isWheel = window.includes(12) && window.includes(0);
        const isOpenEnded =
          !isWheel &&
          (missing[0] === window[0] || missing[0] === window[4]);

        const outs = isOpenEnded ? 8 : 4;
        if (outs > bestOuts) {
          bestOuts = outs;
          bestIsOESD = isOpenEnded;
        }
      }
    }
  }

  return {
    hasStraightDraw: bestOuts > 0,
    isOESD: bestIsOESD,
    straightOuts: bestOuts,
  };
}
