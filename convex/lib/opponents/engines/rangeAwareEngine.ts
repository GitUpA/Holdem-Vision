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
import type { DecisionEngine, DecisionContext, EngineDecision } from "./types";
import type { ExplanationNode } from "../../types/analysis";
import type { BehavioralParams } from "../../types/opponents";
import type { CardIndex } from "../../types/cards";
import { sampleActionFromParams, preflopHandScore } from "../autoPlay";
import { analyzeBoard, type BoardTexture } from "./boardTexture";
import { evaluateHand } from "../../primitives/handEvaluator";
import { registerEngine } from "./engineRegistry";

// ═══════════════════════════════════════════════════════
// ENGINE IMPLEMENTATION
// ═══════════════════════════════════════════════════════

export const rangeAwareEngine: DecisionEngine = {
  id: "range-aware",
  name: "Range-Aware Engine",
  description:
    "Modulates decisions based on board texture, pot odds, and hand " +
    "strength. Used by TAG and LAG profiles for situationally aware play.",

  decide(ctx: DecisionContext): EngineDecision {
    const isPreflop = ctx.state.currentStreet === "preflop";
    const reasoningChildren: ExplanationNode[] = [];

    // ── 1. Assess hand strength ──
    let handStrength: number;
    let handDescription: string;

    if (isPreflop) {
      handStrength = ctx.holeCards ? preflopHandScore(ctx.holeCards) : 0.5;
      handDescription = describePreflop(handStrength);
    } else {
      const postflopResult = assessPostflopStrength(
        ctx.holeCards,
        ctx.state.communityCards,
      );
      handStrength = postflopResult.strength;
      handDescription = postflopResult.description;
    }

    reasoningChildren.push({
      summary: `Hand strength: ${handDescription} (${(handStrength * 100).toFixed(0)}%)`,
      sentiment: handStrength >= 0.7 ? "positive" : handStrength <= 0.3 ? "negative" : "neutral",
      tags: ["hand-strength"],
    });

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

    // ── 6. Compute adjusted behavioral params ──
    const adjusted = adjustParams(ctx.params, {
      handStrength,
      texture,
      potOdds,
      foldLikelihood,
      spr,
      isPreflop,
      isAggressor: ctx.situationKey.includes("aggressor"),
      isInPosition: ctx.situationKey.endsWith(".ip"),
    });

    reasoningChildren.push({
      summary: `Adjusted: continue ${adjusted.continuePct.toFixed(0)}% (base ${ctx.params.continuePct}%), raise ${adjusted.raisePct.toFixed(0)}% (base ${ctx.params.raisePct}%)`,
      sentiment: "neutral",
      tags: ["adjusted-params"],
    });

    // ── 7. Sample action with adjusted params ──
    const { actionType, amount } = sampleActionFromParams(
      adjusted,
      ctx.legal,
      ctx.potSize,
      ctx.random,
      ctx.holeCards,
    );

    // Build the final decision explanation
    const actionSentiment = actionType === "fold"
      ? "negative"
      : (actionType === "raise" || actionType === "bet")
        ? "positive"
        : "neutral" as const;

    reasoningChildren.unshift({
      summary: `Decision: ${actionType}${amount !== undefined ? ` ${amount}` : ""}`,
      sentiment: actionSentiment,
      tags: ["decision"],
    });

    const explanation: ExplanationNode = {
      summary: `${ctx.profile.name} in ${ctx.situationKey}: ${buildActionSummary(actionType, amount, handDescription, texture)}`,
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
        adjustedContinuePct: adjusted.continuePct,
        adjustedRaisePct: adjusted.raisePct,
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
  potOdds: number;
  foldLikelihood: number;
  spr: number;
  isPreflop: boolean;
  isAggressor: boolean;
  isInPosition: boolean;
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

  // ── Hand strength modulation ──
  // Strong hands continue and raise more; weak hands fold more.
  // Scale: 0.5 = neutral, 1.0 = strong boost, 0.0 = strong penalty
  const strengthDelta = (factors.handStrength - 0.5) * 2; // -1 to +1

  if (!factors.isPreflop) {
    // Postflop: hand strength has a big effect
    continuePct *= 1 + strengthDelta * 0.4;
    raisePct *= 1 + strengthDelta * 0.3;
  }
  // Preflop hand strength modulation is already handled by adjustedContinuePct
  // in sampleActionFromParams, so we don't double-adjust here.

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

  // ── Position bonus ──
  if (factors.isInPosition) {
    continuePct *= 1 + base.positionAwareness * 0.08;
    raisePct *= 1 + base.positionAwareness * 0.05;
  }

  // Clamp to legal bounds
  return {
    ...base,
    continuePct: clamp(continuePct, 0, 100),
    raisePct: clamp(raisePct, 0, 100),
  };
}

/**
 * Estimate how likely opponents are to fold to aggression.
 * Based on their profiles' fold frequencies and current street.
 */
function estimateFoldLikelihood(ctx: DecisionContext): number {
  // Use the inverse of the opponent's continuePct for the facing_bet situation.
  // We approximate by looking at the average fold rate across active opponents.
  const activePlayers = ctx.state.players.filter(
    (p) => p.seatIndex !== ctx.seatIndex &&
           (p.status === "active" || p.status === "all_in"),
  );

  if (activePlayers.length === 0) return 0;

  // Simple estimate: use the profile's own aggression tendency.
  // TAG/LAG opponents tend to face opponents who fold (100 - facingBet.continuePct).
  // Since we don't know the opponent profiles here, use the current profile's
  // bluff frequency as a proxy for how profitable bluffing is.
  const baseFoldEstimate = 1 - (ctx.params.continuePct / 100);

  // More opponents = less fold equity (need ALL to fold)
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
): { strength: number; description: string } {
  if (!holeCards || holeCards.length < 2 || communityCards.length < 3) {
    return { strength: 0.5, description: "unknown" };
  }

  try {
    const allCards = [...holeCards, ...communityCards];
    const evaluated = evaluateHand(allCards);
    const tier = evaluated.rank.tier;

    // Map hand tier (0=high card, 1=pair, ..., 8=straight flush) to strength
    // tier 0 = high card → 0.1
    // tier 1 = pair → 0.35
    // tier 2 = two pair → 0.55
    // tier 3 = trips → 0.7
    // tier 4 = straight → 0.78
    // tier 5 = flush → 0.85
    // tier 6 = full house → 0.92
    // tier 7 = quads → 0.97
    // tier 8 = straight flush → 0.99
    const tierStrengths = [0.1, 0.35, 0.55, 0.7, 0.78, 0.85, 0.92, 0.97, 0.99];
    const baseStrength = tierStrengths[Math.min(tier, tierStrengths.length - 1)];

    // Adjust within tier based on kickers
    const kickerBonus = evaluated.rank.tiebreakers.length > 0
      ? (evaluated.rank.tiebreakers[0] / 12) * 0.08
      : 0;

    const strength = Math.min(1, baseStrength + kickerBonus);

    const tierNames = [
      "high card", "pair", "two pair", "trips",
      "straight", "flush", "full house", "quads", "straight flush",
    ];
    const description = tierNames[Math.min(tier, tierNames.length - 1)] ?? "unknown";

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
