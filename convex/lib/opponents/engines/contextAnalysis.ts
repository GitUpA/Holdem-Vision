/**
 * Shared context analysis — hand strength, board texture, draws, fold equity.
 *
 * Shared context analysis used by modifiedGtoEngine.
 *
 * Pure TypeScript, zero Convex imports.
 */
import type { DecisionContext } from "./types";
import type { ContextFactors } from "./modifiedGtoTypes";
export type { ContextFactors } from "./modifiedGtoTypes";
import type { CardIndex, Position } from "../../types/cards";
import type { SituationKey } from "../../types/opponents";
import { analyzeBoard } from "./boardTexture";
import { detectDraws, type DrawInfo } from "./drawDetector";
import { evaluateHand } from "../../primitives/handEvaluator";
import { preflopHandScore } from "../autoPlay";
import { resolveProfile } from "../profileResolver";

// ═══════════════════════════════════════════════════════
// PREFLOP POSITION MULTIPLIERS (shared across engines)
// ═══════════════════════════════════════════════════════

/**
 * Position multipliers for preflop opening ranges.
 * < 1.0 = tighter than average, > 1.0 = wider than average.
 */
export const PREFLOP_POSITION_MULTIPLIERS: Partial<Record<Position, number>> = {
  utg:  0.6,
  utg1: 0.65,
  utg2: 0.7,
  mp:   0.75,
  mp1:  0.8,
  hj:   0.85,
  co:   1.15,
  btn:  1.5,
  sb:   1.2,
  bb:   1.0,
};

// ═══════════════════════════════════════════════════════
// COMPUTE CONTEXT FACTORS
// ═══════════════════════════════════════════════════════

/**
 * Compute all context factors from a DecisionContext.
 * Returns a flat ContextFactors object used by the modifier system.
 */
export function computeContextFactors(ctx: DecisionContext): ContextFactors {
  const isPreflop = ctx.state.currentStreet === "preflop";

  // ── Hand strength ──
  let handStrength: number;
  let handDescription: string;
  let drawInfo: DrawInfo | undefined;

  if (!isPreflop && ctx.holeCards && ctx.state.communityCards.length >= 3) {
    drawInfo = detectDraws(ctx.holeCards, ctx.state.communityCards);
  }

  if (isPreflop) {
    handStrength = ctx.holeCards ? preflopHandScore(ctx.holeCards) : 0.5;
    handDescription = describePreflopStrength(handStrength);
  } else {
    const postflop = assessPostflopStrength(
      ctx.holeCards,
      ctx.state.communityCards,
      drawInfo,
    );
    handStrength = postflop.strength;
    handDescription = postflop.description;
  }

  // ── Board texture ──
  // Default 0 preflop (no board), 0.5 postflop fallback
  let boardWetness = isPreflop ? 0 : 0.5;
  if (!isPreflop && ctx.state.communityCards.length >= 3) {
    const texture = analyzeBoard(ctx.state.communityCards);
    boardWetness = texture.wetness;
  }

  // ── Pot odds ──
  let potOdds = 0;
  if (ctx.legal.canCall && ctx.legal.callAmount > 0) {
    potOdds = ctx.legal.callAmount / (ctx.potSize + ctx.legal.callAmount);
  }

  // ── Fold equity ──
  const foldEquity = estimateFoldLikelihood(ctx);

  // ── SPR ──
  const player = ctx.state.players[ctx.seatIndex];
  const spr = ctx.potSize > 0 ? player.currentStack / ctx.potSize : 20;

  // ── Position ──
  // Postflop: derived from situationKey suffix (.ip / .oop)
  // Preflop: BTN and CO are "in position", others are "out of position"
  let isInPosition = ctx.situationKey.endsWith(".ip");
  if (isPreflop) {
    const pos = ctx.state.players[ctx.seatIndex].position;
    isInPosition = pos === "btn" || pos === "co";
  }

  return {
    handStrength,
    handDescription,
    boardWetness,
    // Draw outs are irrelevant on the river — no more cards to come
    drawOuts: ctx.state.currentStreet === "river" ? 0 : (drawInfo?.totalOuts ?? 0),
    bestDrawType: ctx.state.currentStreet === "river" ? "none" : (drawInfo?.bestDrawType ?? "none"),
    potOdds,
    foldEquity,
    spr,
    isInPosition,
    isPreflop,
  };
}

// ═══════════════════════════════════════════════════════
// BOARD TEXTURE ANALYSIS (re-export for convenience)
// ═══════════════════════════════════════════════════════

export { analyzeBoard, type BoardTexture } from "./boardTexture";
export { detectDraws, type DrawInfo } from "./drawDetector";

// ═══════════════════════════════════════════════════════
// HAND STRENGTH ASSESSMENT
// ═══════════════════════════════════════════════════════

/**
 * Assess hand strength postflop using the hand evaluator.
 * Returns a 0-1 score and description.
 */
export function assessPostflopStrength(
  holeCards: CardIndex[] | undefined,
  communityCards: CardIndex[],
  drawInfo?: DrawInfo,
): { strength: number; description: string } {
  if (!holeCards || holeCards.length < 2 || communityCards.length < 3) {
    return { strength: 0.5, description: "unknown" };
  }

  try {
    const allCards = [...holeCards, ...communityCards];
    const evaluated = evaluateHand(allCards);
    const tier = evaluated.rank.tier;

    // Map hand tier (0=high card, 1=pair, ..., 8=straight flush) to strength
    const tierStrengths = [0.1, 0.35, 0.55, 0.7, 0.78, 0.85, 0.92, 0.97, 0.99];
    const baseStrength = tierStrengths[Math.min(tier, tierStrengths.length - 1)];

    // Adjust within tier based on kickers
    const kickerBonus = evaluated.rank.tiebreakers.length > 0
      ? (evaluated.rank.tiebreakers[0] / 12) * 0.08
      : 0;

    let strength = Math.min(1, baseStrength + kickerBonus);

    // Blend draw equity into strength — ~2% equity per out per street remaining
    if (drawInfo && drawInfo.totalOuts > 0) {
      const streetsLeft =
        communityCards.length === 3 ? 2 : communityCards.length === 4 ? 1 : 0;
      const drawEquity = Math.min(drawInfo.totalOuts * 0.02 * streetsLeft, 0.45);
      strength = Math.min(0.85, strength + drawEquity);
    }

    const tierNames = [
      "high card", "pair", "two pair", "trips",
      "straight", "flush", "full house", "quads", "straight flush",
    ];
    let description = tierNames[Math.min(tier, tierNames.length - 1)] ?? "unknown";
    if (drawInfo && drawInfo.totalOuts > 0) {
      description += ` + ${drawInfo.bestDrawType.replace("_", " ")}`;
    }

    return { strength, description };
  } catch {
    return { strength: 0.5, description: "evaluation error" };
  }
}

/**
 * Describe preflop hand strength in human terms.
 */
export function describePreflopStrength(strength: number): string {
  if (strength >= 0.85) return "premium";
  if (strength >= 0.7) return "strong";
  if (strength >= 0.5) return "playable";
  if (strength >= 0.3) return "marginal";
  return "weak";
}

// ═══════════════════════════════════════════════════════
// FOLD EQUITY ESTIMATION
// ═══════════════════════════════════════════════════════

/**
 * Estimate how likely opponents are to fold to aggression.
 *
 * When opponent profiles are available (via ctx.opponentProfiles), uses
 * their actual facing_bet / facing_raise continuePct. Otherwise falls
 * back to a heuristic based on the current profile's own continuePct.
 */
export function estimateFoldLikelihood(ctx: DecisionContext): number {
  const activePlayers = ctx.state.players.filter(
    (p) => p.seatIndex !== ctx.seatIndex &&
           (p.status === "active" || p.status === "all_in"),
  );

  if (activePlayers.length === 0) return 0;

  // ── Profile-based fold equity (when opponent profiles available) ──
  if (ctx.opponentProfiles && ctx.opponentProfiles.size > 0) {
    const foldRates: number[] = [];

    for (const p of activePlayers) {
      const oppProfile = ctx.opponentProfiles.get(p.seatIndex);
      if (oppProfile) {
        const resolved = resolveProfile(oppProfile, ctx.getBase);
        let facingKey: SituationKey;
        if (ctx.state.currentStreet === "preflop") {
          facingKey = "preflop.facing_raise";
        } else if (ctx.legal.canRaise) {
          facingKey = "postflop.facing_raise";
        } else {
          facingKey = "postflop.facing_bet";
        }
        const oppParams = resolved[facingKey];
        foldRates.push(1 - oppParams.continuePct / 100);
      } else {
        foldRates.push(0.4);
      }
    }

    if (foldRates.length === 1) return foldRates[0];

    // Multi-way: need ALL opponents to fold — multiply fold rates
    return foldRates.reduce((acc, rate) => acc * rate, 1);
  }

  // ── Fallback: heuristic when no opponent profiles available ──
  const baseFoldEstimate = 1 - (ctx.params.continuePct / 100);
  const multiWayPenalty = Math.pow(baseFoldEstimate, activePlayers.length - 1);
  return baseFoldEstimate * (activePlayers.length === 1 ? 1 : multiWayPenalty * 0.7);
}

// ═══════════════════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════════════════

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
