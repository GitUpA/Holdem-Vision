/**
 * GTO Decision Engine — game-theory optimal approximation.
 *
 * Builds on the range-aware approach but adds GTO-specific logic:
 *
 * 1. **Minimum Defense Frequency (MDF)** — defends enough vs bets
 *    to make opponent bluffs unprofitable
 * 2. **Equity-based decisions** — continues when hand equity ≥ pot odds
 * 3. **Texture-based bet sizing** — small bets on dry boards for
 *    range advantage, large bets on wet boards for polarization
 * 4. **Balanced bluff ratio** — bluff frequency scales with bet size
 *    (GTO bluff ratio ≈ bet / (bet + pot) at equilibrium)
 * 5. **Full position awareness** (positionAwareness = 1.0)
 *
 * Pure TypeScript, zero Convex imports.
 */
import { formatSituation } from "./types";
import type { DecisionEngine, DecisionContext, EngineDecision } from "./types";
import type { ExplanationNode } from "../../types/analysis";
import type { BehavioralParams, SituationKey } from "../../types/opponents";
import type { CardIndex, Position } from "../../types/cards";
import { sampleActionFromParams, preflopHandScore } from "../autoPlay";
import { resolveProfile } from "../profileResolver";
import { analyzeBoard, type BoardTexture } from "./boardTexture";
import { detectDraws, type DrawInfo } from "./drawDetector";
import { evaluateHand } from "../../primitives/handEvaluator";
import { registerEngine } from "./engineRegistry";

// ═══════════════════════════════════════════════════════
// PREFLOP POSITION MULTIPLIERS (same as range-aware)
// ═══════════════════════════════════════════════════════

const PREFLOP_POSITION_MULTIPLIERS: Partial<Record<Position, number>> = {
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
// ENGINE IMPLEMENTATION
// ═══════════════════════════════════════════════════════

export const gtoEngine: DecisionEngine = {
  id: "gto",
  name: "GTO Engine",
  description:
    "Game-theory optimal decisions: MDF-based defense, equity-based " +
    "calling, texture-based bet sizing, and balanced bluff ratios.",

  decide(ctx: DecisionContext): EngineDecision {
    const isPreflop = ctx.state.currentStreet === "preflop";
    const reasoningChildren: ExplanationNode[] = [];

    // ── 1. Assess hand strength ──
    let handStrength: number;
    let handDescription: string;

    let drawInfo: DrawInfo | undefined;
    if (!isPreflop && ctx.holeCards && ctx.state.communityCards.length >= 3) {
      drawInfo = detectDraws(ctx.holeCards, ctx.state.communityCards);
    }

    if (isPreflop) {
      handStrength = ctx.holeCards ? preflopHandScore(ctx.holeCards) : 0.5;
      handDescription = describePreflop(handStrength);
    } else {
      const postflopResult = assessPostflopStrength(
        ctx.holeCards,
        ctx.state.communityCards,
        drawInfo,
      );
      handStrength = postflopResult.strength;
      handDescription = postflopResult.description;
    }

    reasoningChildren.push({
      summary: `Hand strength: ${handDescription} (${(handStrength * 100).toFixed(0)}%)`,
      sentiment: handStrength >= 0.7 ? "positive" : handStrength <= 0.3 ? "negative" : "neutral",
      tags: ["hand-strength"],
    });

    if (drawInfo && drawInfo.totalOuts > 0) {
      reasoningChildren.push({
        summary: `Draws: ${drawInfo.bestDrawType} (${drawInfo.totalOuts} outs)`,
        sentiment: drawInfo.totalOuts >= 8 ? "positive" : "neutral",
        tags: ["draw-aware"],
      });
    }

    // ── 2. Board texture ──
    let texture: BoardTexture | undefined;
    if (!isPreflop && ctx.state.communityCards.length >= 3) {
      texture = analyzeBoard(ctx.state.communityCards);
      reasoningChildren.push({
        summary: `Board: ${texture.description} (wetness ${(texture.wetness * 100).toFixed(0)}%)`,
        sentiment: "neutral",
        tags: ["board-texture"],
      });
    }

    // ── 3. Pot odds ──
    let potOdds = 0;
    if (ctx.legal.canCall && ctx.legal.callAmount > 0) {
      potOdds = ctx.legal.callAmount / (ctx.potSize + ctx.legal.callAmount);
      reasoningChildren.push({
        summary: `Pot odds: ${(potOdds * 100).toFixed(0)}% (need ${(potOdds * 100).toFixed(0)}% equity to call)`,
        detail: `Call ${ctx.legal.callAmount} into ${ctx.potSize} pot`,
        sentiment: handStrength > potOdds ? "positive" : "negative",
        tags: ["pot-odds"],
      });
    }

    // ── 4. Fold equity ──
    const foldLikelihood = estimateFoldLikelihood(ctx);
    if (ctx.legal.canRaise || ctx.legal.canBet) {
      reasoningChildren.push({
        summary: `Fold equity: opponents fold ~${(foldLikelihood * 100).toFixed(0)}% to aggression`,
        sentiment: foldLikelihood >= 0.4 ? "positive" : "neutral",
        tags: ["fold-equity"],
      });
    }

    // ── 5. SPR ──
    const player = ctx.state.players[ctx.seatIndex];
    const spr = ctx.potSize > 0 ? player.currentStack / ctx.potSize : 20;
    if (!isPreflop) {
      reasoningChildren.push({
        summary: `SPR: ${spr.toFixed(1)} — ${spr > 10 ? "deep" : spr > 4 ? "medium" : "shallow"}`,
        sentiment: "neutral",
        tags: ["spr"],
      });
    }

    // ── 5b. Preflop position ──
    const playerPosition = ctx.state.players[ctx.seatIndex]?.position;
    if (isPreflop && playerPosition) {
      const rawMultiplier = PREFLOP_POSITION_MULTIPLIERS[playerPosition] ?? 1.0;
      // GTO has positionAwareness=1.0 so full effect always applies
      const posAwareness = ctx.params.positionAwareness ?? 1.0;
      const scaledMultiplier = 1 + (rawMultiplier - 1) * posAwareness;
      const tighterOrWider = scaledMultiplier < 1 ? "tighter" : scaledMultiplier > 1 ? "wider" : "neutral";
      reasoningChildren.push({
        summary: `Position: ${playerPosition.toUpperCase()} — ${tighterOrWider} range (x${scaledMultiplier.toFixed(2)})`,
        detail: `Full position adjustment (positionAwareness ${posAwareness.toFixed(1)})`,
        sentiment: scaledMultiplier >= 1.1 ? "positive" : scaledMultiplier <= 0.9 ? "negative" : "neutral",
        tags: ["position", "preflop"],
      });
    }

    // ── 6. GTO-specific adjustments ──
    // Detect "facing a bet" from both situation key AND actual legal actions.
    // The legal actions are ground truth: if there's a call to make, we're facing a bet.
    const facingBet = ctx.situationKey.includes("facing_bet") ||
                      ctx.situationKey.includes("facing_raise") ||
                      ctx.situationKey.includes("facing_allin") ||
                      (ctx.legal.canCall && ctx.legal.callAmount > 0);

    const adjusted = adjustGtoParams(ctx.params, {
      handStrength,
      texture,
      drawInfo,
      potOdds,
      foldLikelihood,
      spr,
      isPreflop,
      isAggressor: ctx.situationKey.includes("aggressor"),
      isInPosition: ctx.situationKey.endsWith(".ip"),
      position: playerPosition,
      facingBet,
    });

    // MDF explanation (when facing a bet)
    if (facingBet && potOdds > 0 && !isPreflop) {
      const mdf = (1 - potOdds) * 100;
      reasoningChildren.push({
        summary: `MDF: must defend ${mdf.toFixed(0)}% to prevent exploitation`,
        detail: `Minimum Defense Frequency prevents opponent from profiting with any two cards`,
        sentiment: handStrength >= potOdds ? "positive" : "negative",
        tags: ["mdf", "gto"],
      });
    }

    // Texture-based sizing explanation (when betting/raising)
    if (texture && !isPreflop && (ctx.legal.canBet || ctx.legal.canRaise)) {
      const sizingAdvice = texture.wetness > 0.6
        ? "larger sizes preferred (polarize on wet board)"
        : texture.wetness < 0.35
          ? "smaller sizes preferred (range advantage on dry board)"
          : "mixed sizes (moderate texture)";
      reasoningChildren.push({
        summary: `Sizing: ${sizingAdvice}`,
        sentiment: "neutral",
        tags: ["sizing", "gto"],
      });
    }

    reasoningChildren.push({
      summary: `Adjusted: continue ${adjusted.continuePct.toFixed(0)}% (base ${ctx.params.continuePct}%), raise ${adjusted.raisePct.toFixed(0)}% (base ${ctx.params.raisePct}%), bluff ${(adjusted.bluffFrequency * 100).toFixed(0)}% (base ${(ctx.params.bluffFrequency * 100).toFixed(0)}%)`,
      sentiment: "neutral",
      tags: ["adjusted-params"],
    });

    // ── 7. Sample action with GTO-adjusted params ──
    // For GTO, override sizings based on board texture before sampling
    const adjustedWithSizing = applyTextureSizing(adjusted, texture, isPreflop);

    // Note: pass undefined for holeCards — adjustParams() already applied
    // hand-strength scaling, so we don't double-apply via adjustedContinuePct().
    const { actionType, amount, isBluff } = sampleActionFromParams(
      adjustedWithSizing,
      ctx.legal,
      ctx.potSize,
      ctx.random,
      undefined,
    );

    if (isBluff) {
      reasoningChildren.push({
        summary: `Bluff! Balanced bluff frequency: ${(adjusted.bluffFrequency * 100).toFixed(0)}%`,
        detail: `GTO includes bluffs at theoretically correct ratio`,
        sentiment: "positive",
        tags: ["bluff", "gto"],
      });
    }

    // Build final explanation
    const actionSentiment = actionType === "fold"
      ? "negative"
      : (actionType === "raise" || actionType === "bet")
        ? "positive"
        : "neutral" as const;

    reasoningChildren.unshift({
      summary: `Decision: ${actionType}${amount !== undefined ? ` ${amount}` : ""}${isBluff ? " (BLUFF)" : ""}`,
      sentiment: actionSentiment,
      tags: ["decision"],
    });

    const explanation: ExplanationNode = {
      summary: `${ctx.profile.name} — ${formatSituation(ctx.situationKey)}: ${buildActionSummary(actionType, amount, handDescription, texture)}`,
      sentiment: actionSentiment,
      children: reasoningChildren,
      tags: ["gto-engine"],
    };

    return {
      actionType,
      amount,
      situationKey: ctx.situationKey,
      engineId: "gto",
      explanation,
      reasoning: {
        handStrength,
        boardWetness: texture?.wetness,
        potOdds,
        foldLikelihood,
        spr,
        position: playerPosition,
        mdf: facingBet && potOdds > 0 ? (1 - potOdds) * 100 : undefined,
        adjustedContinuePct: adjusted.continuePct,
        adjustedRaisePct: adjusted.raisePct,
        adjustedBluffFrequency: adjusted.bluffFrequency,
        isBluff: isBluff ?? false,
        drawInfo: drawInfo
          ? {
              bestDrawType: drawInfo.bestDrawType,
              totalOuts: drawInfo.totalOuts,
              hasFlushDraw: drawInfo.hasFlushDraw,
              hasStraightDraw: drawInfo.hasStraightDraw,
              isCombo: drawInfo.isCombo,
            }
          : undefined,
      },
    };
  },
};

// ═══════════════════════════════════════════════════════
// GTO-SPECIFIC ADJUSTMENT LOGIC
// ═══════════════════════════════════════════════════════

interface GtoAdjustmentFactors {
  handStrength: number;
  texture?: BoardTexture;
  drawInfo?: DrawInfo;
  potOdds: number;
  foldLikelihood: number;
  spr: number;
  isPreflop: boolean;
  isAggressor: boolean;
  isInPosition: boolean;
  position?: Position;
  facingBet: boolean;
}

/**
 * GTO-specific parameter adjustment.
 *
 * Unlike range-aware (which modulates behavioral percentages), GTO
 * uses game-theoretic principles:
 * - MDF for defense decisions
 * - Equity vs pot odds for calling
 * - Balanced bluff-to-value ratios
 */
function adjustGtoParams(
  base: BehavioralParams,
  factors: GtoAdjustmentFactors,
): BehavioralParams {
  let continuePct = base.continuePct;
  let raisePct = base.raisePct;
  let bluffFrequency = base.bluffFrequency;

  // ── Postflop hand strength modulation ──
  const strengthDelta = (factors.handStrength - 0.5) * 2;
  if (!factors.isPreflop) {
    continuePct *= 1 + strengthDelta * 0.35;
    raisePct *= 1 + strengthDelta * 0.25;
  }

  // ── Preflop position modulation ──
  if (factors.isPreflop && factors.position) {
    const posMultiplier = PREFLOP_POSITION_MULTIPLIERS[factors.position] ?? 1.0;
    const scaledMultiplier = 1 + (posMultiplier - 1) * base.positionAwareness;
    continuePct *= scaledMultiplier;
    raisePct *= scaledMultiplier;
  }

  // ── MDF-based defense (facing bets) ──
  // When facing a bet, GTO defends at minimum defense frequency
  // to prevent opponents from profiting with pure bluffs.
  // MDF = 1 - (bet / (pot + bet)) = 1 - potOdds
  if (factors.facingBet && factors.potOdds > 0 && !factors.isPreflop) {
    const mdf = (1 - factors.potOdds) * 100; // e.g., pot-sized bet → MDF ≈ 50%

    if (factors.handStrength >= factors.potOdds) {
      // Hand has enough equity to profitably continue
      // Ensure we defend at least at MDF to prevent exploitation
      continuePct = Math.max(continuePct, mdf);
    } else if (factors.handStrength >= factors.potOdds * 0.6) {
      // Marginal hand — defend somewhat but not full MDF
      // Bleed slowly rather than overfold
      continuePct = Math.max(continuePct, mdf * 0.6);
    }
    // Very weak hands: let base continuePct (possibly with bluff) handle it
  }

  // ── Equity vs pot odds for calling ──
  // When equity significantly exceeds pot odds, boost continuation
  if (factors.potOdds > 0 && factors.handStrength > factors.potOdds) {
    const equityMargin = factors.handStrength - factors.potOdds;
    if (equityMargin > 0.15) {
      // Strong equity advantage — continue at high rate
      continuePct *= 1 + equityMargin * 0.4;
    }
  }

  // ── Draw awareness ──
  if (factors.drawInfo && !factors.isPreflop && factors.drawInfo.totalOuts > 0) {
    const outsBoost = Math.min(factors.drawInfo.totalOuts / 15, 1) * 0.2;
    continuePct *= 1 + outsBoost;

    // Strong draws warrant semi-bluff aggression
    if (factors.drawInfo.isCombo) {
      raisePct *= 1.4;
    } else if (factors.drawInfo.totalOuts >= 8) {
      raisePct *= 1.2;
    }
  }

  // ── Board texture modulation ──
  if (factors.texture && !factors.isPreflop) {
    const wet = factors.texture.wetness;
    if (factors.isAggressor) {
      // Wet boards: bet more for protection
      continuePct *= 1 + (wet - 0.5) * 0.25;
      raisePct *= 1 + (wet - 0.5) * 0.2;
    }
    if (factors.texture.isMonotone) {
      raisePct *= 0.75;
    }
    if (factors.texture.isPaired) {
      continuePct *= 0.9;
    }
  }

  // ── Fold equity modulation ──
  if (factors.foldLikelihood > 0.35 && !factors.isPreflop) {
    raisePct *= 1 + (factors.foldLikelihood - 0.35) * 0.4;
  }

  // ── SPR modulation ──
  if (!factors.isPreflop) {
    if (factors.spr < 3) {
      raisePct *= 1.4;
      continuePct *= 1.15;
    } else if (factors.spr > 12) {
      raisePct *= 0.85;
    }
  }

  // ── Balanced bluff frequency ──
  // GTO bluff ratio at equilibrium ≈ bet_size / (bet_size + pot).
  // We approximate by adjusting bluffFrequency based on context.
  if (!factors.isPreflop) {
    // High fold equity makes bluffs more profitable
    if (factors.foldLikelihood > 0.25) {
      bluffFrequency *= 1 + (factors.foldLikelihood - 0.25) * 0.6;
    }

    // Draws provide backup equity for semi-bluffs
    if (factors.drawInfo && factors.drawInfo.totalOuts > 0) {
      const drawBoost = Math.min(factors.drawInfo.totalOuts / 12, 1) * 0.4;
      bluffFrequency *= 1 + drawBoost;
    }

    // Aggressor on wet board → more credible bluffs
    if (factors.texture && factors.isAggressor) {
      bluffFrequency *= 1 + (factors.texture.wetness - 0.5) * 0.25;
    }
  }

  // ── Position bonus ──
  if (factors.isInPosition) {
    continuePct *= 1 + base.positionAwareness * 0.08;
    raisePct *= 1 + base.positionAwareness * 0.05;
    bluffFrequency *= 1 + base.positionAwareness * 0.12;
  }

  return {
    ...base,
    continuePct: clamp(continuePct, 0, 100),
    raisePct: clamp(raisePct, 0, 100),
    bluffFrequency: clamp(bluffFrequency, 0, 1),
  };
}

/**
 * Override bet sizings based on board texture for GTO-optimal sizing.
 *
 * Dry boards → small bets (range advantage, bet wide/small)
 * Wet boards → large bets (polarize, bet for protection)
 * Medium → mixed sizes
 */
function applyTextureSizing(
  params: BehavioralParams,
  texture: BoardTexture | undefined,
  isPreflop: boolean,
): BehavioralParams {
  if (isPreflop || !texture || params.sizings.length === 0) return params;

  // Sort existing sizings by size
  const sorted = [...params.sizings].sort((a, b) => a.sizingPct - b.sizingPct);
  if (sorted.length < 2) return params;

  // Identify small and large sizing options
  const smallSizing = sorted[0];
  const largeSizing = sorted[sorted.length - 1];

  if (texture.wetness > 0.6) {
    // Wet board: polarize with large bets
    const adjustedSizings = sorted.map((s) => ({
      ...s,
      weight: s === largeSizing ? s.weight * 1.8
            : s === smallSizing ? s.weight * 0.4
            : s.weight,
    }));
    // Normalize weights
    const totalWeight = adjustedSizings.reduce((sum, s) => sum + s.weight, 0);
    return {
      ...params,
      sizings: adjustedSizings.map((s) => ({
        ...s,
        weight: totalWeight > 0 ? s.weight / totalWeight : s.weight,
      })),
    };
  } else if (texture.wetness < 0.35) {
    // Dry board: small bets for range advantage
    const adjustedSizings = sorted.map((s) => ({
      ...s,
      weight: s === smallSizing ? s.weight * 2.0
            : s === largeSizing ? s.weight * 0.3
            : s.weight,
    }));
    const totalWeight = adjustedSizings.reduce((sum, s) => sum + s.weight, 0);
    return {
      ...params,
      sizings: adjustedSizings.map((s) => ({
        ...s,
        weight: totalWeight > 0 ? s.weight / totalWeight : s.weight,
      })),
    };
  }

  return params;
}

// ═══════════════════════════════════════════════════════
// FOLD EQUITY (same logic as range-aware engine)
// ═══════════════════════════════════════════════════════

function estimateFoldLikelihood(ctx: DecisionContext): number {
  const activePlayers = ctx.state.players.filter(
    (p) => p.seatIndex !== ctx.seatIndex &&
           (p.status === "active" || p.status === "all_in"),
  );

  if (activePlayers.length === 0) return 0;

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
        foldRates.push(1 - resolved[facingKey].continuePct / 100);
      } else {
        foldRates.push(0.4);
      }
    }
    if (foldRates.length === 1) return foldRates[0];
    return foldRates.reduce((acc, rate) => acc * rate, 1);
  }

  const baseFoldEstimate = 1 - (ctx.params.continuePct / 100);
  const multiWayPenalty = Math.pow(baseFoldEstimate, activePlayers.length - 1);
  return baseFoldEstimate * (activePlayers.length === 1 ? 1 : multiWayPenalty * 0.7);
}

// ═══════════════════════════════════════════════════════
// SHARED HELPERS
// ═══════════════════════════════════════════════════════

function assessPostflopStrength(
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

    const tierStrengths = [0.1, 0.35, 0.55, 0.7, 0.78, 0.85, 0.92, 0.97, 0.99];
    const baseStrength = tierStrengths[Math.min(tier, tierStrengths.length - 1)];

    const kickerBonus = evaluated.rank.tiebreakers.length > 0
      ? (evaluated.rank.tiebreakers[0] / 12) * 0.08
      : 0;

    let strength = Math.min(1, baseStrength + kickerBonus);

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

function describePreflop(strength: number): string {
  if (strength >= 0.85) return "premium";
  if (strength >= 0.7) return "strong";
  if (strength >= 0.5) return "playable";
  if (strength >= 0.3) return "marginal";
  return "weak";
}

function buildActionSummary(
  actionType: string,
  amount: number | undefined,
  handDescription: string,
  texture?: BoardTexture,
): string {
  const amountStr = amount !== undefined ? ` ${amount}` : "";
  const boardStr = texture ? ` on ${texture.description.split(",")[0]} board` : "";
  return `${actionType}${amountStr} — ${handDescription}${boardStr}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ─── Self-register ───
registerEngine(gtoEngine);
