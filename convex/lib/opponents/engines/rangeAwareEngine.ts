/**
 * Range-Aware Decision Engine — smarter decisions for TAG/LAG profiles.
 *
 * Unlike the basic engine (pure behavioral sampling), this engine
 * considers game context to modulate its decisions:
 *
 * 1. Hand strength relative to the board (postflop evaluation)
 * 2. Board texture (wet/dry affects c-bet and bluff frequency)
 * 3. Pot odds (should we call based on the price offered?)
 * 4. Fold equity (is betting profitable even without the best hand?)
 * 5. Stack-to-pot ratio (deep stacks → more speculative play)
 *
 * The engine still uses the profile's BehavioralParams as a base —
 * it modulates continuePct and raisePct rather than overriding them.
 * This keeps the profile's character while adding situational awareness.
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
// PREFLOP POSITION MULTIPLIERS
// ═══════════════════════════════════════════════════════

/**
 * Position multipliers for preflop opening ranges.
 * < 1.0 = tighter than average, > 1.0 = wider than average.
 * Scaled by positionAwareness: Fish (0.1) barely adjusts, TAG (0.8) adjusts a lot.
 */
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

export const rangeAwareEngine: DecisionEngine = {
  id: "range-aware",
  name: "Range-Aware Engine",
  description:
    "Modulates decisions based on hand strength, draw potential, board " +
    "texture, pot odds, and SPR. Used by TAG and LAG profiles.",

  decide(ctx: DecisionContext): EngineDecision {
    const isPreflop = ctx.state.currentStreet === "preflop";
    const reasoningChildren: ExplanationNode[] = [];

    // ── 1. Assess hand strength ──
    let handStrength: number;
    let handDescription: string;

    // ── 1.5. Draw awareness (postflop only) ──
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

    // ── 2. Board texture (postflop only) ──
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

    // ── 4. Estimate fold equity ──
    const foldLikelihood = estimateFoldLikelihood(ctx);
    if (ctx.legal.canRaise || ctx.legal.canBet) {
      reasoningChildren.push({
        summary: `Fold equity: opponents fold ~${(foldLikelihood * 100).toFixed(0)}% to aggression`,
        sentiment: foldLikelihood >= 0.4 ? "positive" : "neutral",
        tags: ["fold-equity"],
      });
    }

    // ── 5. Stack-to-pot ratio ──
    const player = ctx.state.players[ctx.seatIndex];
    const spr = ctx.potSize > 0 ? player.currentStack / ctx.potSize : 20;
    if (!isPreflop) {
      reasoningChildren.push({
        summary: `SPR: ${spr.toFixed(1)} — ${spr > 10 ? "deep" : spr > 4 ? "medium" : "shallow"}`,
        sentiment: "neutral",
        tags: ["spr"],
      });
    }

    // ── 5b. Preflop position context ──
    const playerPosition = ctx.state.players[ctx.seatIndex]?.position;
    if (isPreflop && playerPosition) {
      const rawMultiplier = PREFLOP_POSITION_MULTIPLIERS[playerPosition] ?? 1.0;
      const posAwareness = ctx.params.positionAwareness ?? 0;
      const scaledMultiplier = 1 + (rawMultiplier - 1) * posAwareness;
      const tighterOrWider = scaledMultiplier < 1 ? "tighter" : scaledMultiplier > 1 ? "wider" : "neutral";
      reasoningChildren.push({
        summary: `Position: ${playerPosition.toUpperCase()} — ${tighterOrWider} range (×${scaledMultiplier.toFixed(2)})`,
        detail: `Base position multiplier: ${rawMultiplier.toFixed(2)}, scaled by positionAwareness ${posAwareness.toFixed(1)}`,
        sentiment: scaledMultiplier >= 1.1 ? "positive" : scaledMultiplier <= 0.9 ? "negative" : "neutral",
        tags: ["position", "preflop"],
      });
    }

    // ── 6. Compute adjusted behavioral params ──
    const adjusted = adjustParams(ctx.params, {
      handStrength,
      texture,
      drawInfo,
      potOdds,
      foldLikelihood,
      spr,
      isPreflop,
      isAggressor: ctx.situationKey.includes("aggressor"),
      isInPosition: ctx.situationKey.endsWith(".ip"),
      position: ctx.state.players[ctx.seatIndex]?.position,
    });

    reasoningChildren.push({
      summary: `Adjusted: continue ${adjusted.continuePct.toFixed(0)}% (base ${ctx.params.continuePct}%), raise ${adjusted.raisePct.toFixed(0)}% (base ${ctx.params.raisePct}%), bluff ${(adjusted.bluffFrequency * 100).toFixed(0)}% (base ${(ctx.params.bluffFrequency * 100).toFixed(0)}%)`,
      sentiment: "neutral",
      tags: ["adjusted-params"],
    });

    // ── 7. Sample action with adjusted params ──
    // Note: pass undefined for holeCards — adjustParams() already applied
    // hand-strength scaling, so we don't double-apply via adjustedContinuePct().
    const { actionType, amount, isBluff } = sampleActionFromParams(
      adjusted,
      ctx.legal,
      ctx.potSize,
      ctx.random,
      undefined,
    );

    if (isBluff) {
      reasoningChildren.push({
        summary: `Bluff! Adjusted bluff frequency: ${(adjusted.bluffFrequency * 100).toFixed(0)}% (base ${(ctx.params.bluffFrequency * 100).toFixed(0)}%)`,
        sentiment: "positive",
        tags: ["bluff"],
      });
    }

    // Build the final decision explanation
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
      tags: ["range-aware-engine"],
    };

    return {
      actionType,
      amount,
      situationKey: ctx.situationKey,
      engineId: "range-aware",
      explanation,
      reasoning: {
        handStrength,
        boardWetness: texture?.wetness,
        potOdds,
        foldLikelihood,
        spr,
        position: playerPosition,
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
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════

interface AdjustmentFactors {
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
}

/**
 * Adjust the profile's base behavioral params based on game context.
 * Returns a new BehavioralParams with modulated continuePct and raisePct.
 */
function adjustParams(
  base: BehavioralParams,
  factors: AdjustmentFactors,
): BehavioralParams {
  let continuePct = base.continuePct;
  let raisePct = base.raisePct;
  let bluffFrequency = base.bluffFrequency;

  // ── Hand strength modulation ──
  // Strong hands continue and raise more; weak hands fold more.
  // Scale: 0.5 = neutral, 1.0 = strong boost, 0.0 = strong penalty
  const strengthDelta = (factors.handStrength - 0.5) * 2; // -1 to +1

  if (!factors.isPreflop) {
    // Postflop: hand strength has a big effect
    continuePct *= 1 + strengthDelta * 0.4;
    raisePct *= 1 + strengthDelta * 0.3;
  } else {
    // Preflop: hand strength still matters significantly.
    // Without this, AQo and 72o get the same flat continuePct.
    // Premium hands (str > 0.7) get a big boost; trash (str < 0.3) gets penalized.
    // Slightly less weight than postflop since we also apply position multipliers.
    continuePct *= 1 + strengthDelta * 0.35;
    raisePct *= 1 + strengthDelta * 0.25;
  }
  // ── Preflop position modulation ──
  // Position is the biggest preflop differentiator: UTG opens ~12-15%,
  // BTN opens ~40-50%. Scaled by positionAwareness so Fish barely adjusts
  // while TAG/LAG adjust significantly.
  if (factors.isPreflop && factors.position) {
    const posMultiplier = PREFLOP_POSITION_MULTIPLIERS[factors.position] ?? 1.0;
    // Scale the multiplier by positionAwareness:
    // posAware=0.8 (TAG) → full effect, posAware=0.1 (Fish) → nearly no effect
    const scaledMultiplier = 1 + (posMultiplier - 1) * base.positionAwareness;
    continuePct *= scaledMultiplier;
    raisePct *= scaledMultiplier;
  }

  // ── Board texture modulation (postflop only) ──
  if (factors.texture && !factors.isPreflop) {
    const wet = factors.texture.wetness;

    if (factors.isAggressor) {
      // Aggressor on wet board: bet more often (protection + equity denial)
      // Aggressor on dry board: can check back more (less urgency)
      continuePct *= 1 + (wet - 0.5) * 0.3;
      // On wet boards, raise bigger (more to protect against)
      raisePct *= 1 + (wet - 0.5) * 0.2;
    } else {
      // Caller on wet board: more draws = more calls (good pot odds for draws)
      continuePct *= 1 + (wet - 0.5) * 0.15;
    }

    // Monotone boards: reduce aggression unless we have flush draw or made flush
    // (simplified: we reduce slightly since usually we won't have the flush)
    if (factors.texture.isMonotone) {
      raisePct *= 0.8;
    }

    // Paired boards: reduce aggression slightly (trips are scary)
    if (factors.texture.isPaired) {
      continuePct *= 0.92;
    }
  }

  // ── Draw awareness modulation ──
  // Draws increase willingness to continue (need to see more cards).
  // Strong draws (combo, OESD) also boost aggression for semi-bluff value.
  if (factors.drawInfo && !factors.isPreflop && factors.drawInfo.totalOuts > 0) {
    const outsBoost = Math.min(factors.drawInfo.totalOuts / 15, 1) * 0.25;
    continuePct *= 1 + outsBoost;

    if (factors.drawInfo.isCombo) {
      // Combo draws are great semi-bluff candidates
      raisePct *= 1.3;
    } else if (factors.drawInfo.totalOuts >= 8) {
      // Flush draw / OESD — moderate semi-bluff
      raisePct *= 1.15;
    }
    // Gutshots: continue more but don't raise more (speculative, not aggressive)
  }

  // ── Pot odds modulation ──
  // If pot odds are very good (small call relative to pot), increase continue
  if (factors.potOdds > 0 && factors.potOdds < 0.25) {
    // Getting better than 3:1 — should continue more
    continuePct *= 1.15;
  } else if (factors.potOdds > 0.4) {
    // Facing a large bet — need stronger hand
    continuePct *= 0.9;
  }

  // ── Fold equity modulation ──
  // High fold equity encourages aggression (bluffing becomes profitable)
  if (factors.foldLikelihood > 0.4 && !factors.isPreflop) {
    raisePct *= 1 + (factors.foldLikelihood - 0.4) * 0.5;
  }

  // ── SPR modulation ──
  if (!factors.isPreflop) {
    if (factors.spr < 3) {
      // Shallow stacks: commit or fold, less flat-calling
      raisePct *= 1.3;
      // Also more willing to continue (pot committed)
      continuePct *= 1.1;
    } else if (factors.spr > 12) {
      // Deep stacks: be more cautious, speculative play
      raisePct *= 0.9;
    }
  }

  // ── Bluff frequency modulation ──
  // Modulate how often the engine bluffs weak hands based on context.
  if (!factors.isPreflop) {
    // High fold equity → bluffs are more profitable
    if (factors.foldLikelihood > 0.3) {
      bluffFrequency *= 1 + (factors.foldLikelihood - 0.3) * 0.8;
    }

    // Strong draws → semi-bluff opportunities
    if (factors.drawInfo && factors.drawInfo.totalOuts > 0) {
      const drawBoost = Math.min(factors.drawInfo.totalOuts / 12, 1) * 0.5;
      bluffFrequency *= 1 + drawBoost;
    }

    // Wet boards → aggressor has more bluffable textures
    if (factors.texture && factors.isAggressor) {
      bluffFrequency *= 1 + (factors.texture.wetness - 0.5) * 0.3;
    }
  }

  // ── Position bonus ──
  if (factors.isInPosition) {
    continuePct *= 1 + base.positionAwareness * 0.08;
    raisePct *= 1 + base.positionAwareness * 0.05;
    // IP bluffs are more credible
    bluffFrequency *= 1 + base.positionAwareness * 0.15;
  }

  // Clamp to legal bounds
  return {
    ...base,
    continuePct: clamp(continuePct, 0, 100),
    raisePct: clamp(raisePct, 0, 100),
    bluffFrequency: clamp(bluffFrequency, 0, 1),
  };
}

/**
 * Estimate how likely opponents are to fold to aggression.
 *
 * When opponent profiles are available (via ctx.opponentProfiles), uses
 * their actual facing_bet / facing_raise continuePct. Otherwise falls
 * back to a heuristic based on the current profile's own continuePct.
 */
function estimateFoldLikelihood(ctx: DecisionContext): number {
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
        // Choose the facing situation based on street and action type
        let facingKey: SituationKey;
        if (ctx.state.currentStreet === "preflop") {
          facingKey = "preflop.facing_raise";
        } else if (ctx.legal.canRaise) {
          // We're raising (opponent already bet) → they face a raise
          facingKey = "postflop.facing_raise";
        } else {
          // We're betting first → opponent faces a bet
          facingKey = "postflop.facing_bet";
        }
        const oppParams = resolved[facingKey];
        foldRates.push(1 - oppParams.continuePct / 100);
      } else {
        // No profile for this opponent — moderate default
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

/**
 * Assess hand strength postflop using the hand evaluator.
 * Returns a 0-1 score and description.
 */
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

    // Map hand tier (0=high card, 1=pair, ..., 8=straight flush) to strength
    const tierStrengths = [0.1, 0.35, 0.55, 0.7, 0.78, 0.85, 0.92, 0.97, 0.99];
    const baseStrength = tierStrengths[Math.min(tier, tierStrengths.length - 1)];

    // Adjust within tier based on kickers
    const kickerBonus = evaluated.rank.tiebreakers.length > 0
      ? (evaluated.rank.tiebreakers[0] / 12) * 0.08
      : 0;

    let strength = Math.min(1, baseStrength + kickerBonus);

    // Blend draw equity into strength — a hand with a strong draw is
    // worth more than its made-hand tier alone. ~2% equity per out per
    // street remaining (rule of 2 and 4).
    if (drawInfo && drawInfo.totalOuts > 0) {
      const streetsLeft =
        communityCards.length === 3 ? 2 : communityCards.length === 4 ? 1 : 0;
      const drawEquity = Math.min(drawInfo.totalOuts * 0.02 * streetsLeft, 0.45);
      // Don't exceed flush-level strength from draws alone
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
function describePreflop(strength: number): string {
  if (strength >= 0.85) return "premium";
  if (strength >= 0.7) return "strong";
  if (strength >= 0.5) return "playable";
  if (strength >= 0.3) return "marginal";
  return "weak";
}

/**
 * Build a concise action summary for the explanation.
 */
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
registerEngine(rangeAwareEngine);
