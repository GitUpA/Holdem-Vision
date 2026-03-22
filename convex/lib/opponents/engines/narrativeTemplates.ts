/**
 * Narrative Templates — prose generation from structured interpretations.
 *
 * Maps traits, context factors, and actions to natural-language prose.
 * Templates are composable: any trait combination produces coherent text
 * without per-profile hardcoding.
 *
 * Pure TypeScript, zero Convex imports.
 */
import type { ActionType } from "../../state/game-state";
import type { TraitId } from "./narrativeTypes";

// ═══════════════════════════════════════════════════════
// ACTION DESCRIPTIONS
// ═══════════════════════════════════════════════════════

const ACTION_VERBS: Record<ActionType, { past: string; present: string; gerund: string }> = {
  fold: { past: "folded", present: "folds", gerund: "folding" },
  check: { past: "checked", present: "checks", gerund: "checking" },
  call: { past: "called", present: "calls", gerund: "calling" },
  bet: { past: "bet", present: "bets", gerund: "betting" },
  raise: { past: "raised", present: "raises", gerund: "raising" },
  all_in: { past: "went all-in", present: "goes all-in", gerund: "going all-in" },
};

export function actionVerb(action: ActionType, form: "past" | "present" | "gerund" = "present"): string {
  return ACTION_VERBS[action]?.[form] ?? action;
}

// ═══════════════════════════════════════════════════════
// HAND ASSESSMENT TEMPLATES
// ═══════════════════════════════════════════════════════

export function assessHand(strength: number, description: string, isCautious: boolean): string {
  if (strength >= 0.8) return `${description} — a strong hand`;
  if (strength >= 0.6) return isCautious ? `${description} — decent, but is it enough?` : `${description} — a solid hand to work with`;
  if (strength >= 0.4) return isCautious ? `${description} — too marginal to feel comfortable` : `${description} — marginal but playable`;
  if (strength >= 0.2) return isCautious ? `${description} — not nearly strong enough` : `${description} — weak, but might have potential`;
  return isCautious ? `${description} — nothing worth fighting for` : `${description} — very weak`;
}

// ═══════════════════════════════════════════════════════
// BOARD ASSESSMENT TEMPLATES
// ═══════════════════════════════════════════════════════

export function assessBoard(wetness: number, isAggressive: boolean): string {
  if (wetness >= 0.7) return isAggressive ? "The board is wet and draw-heavy — lots of action potential" : "The board is wet and dangerous — too many possible draws";
  if (wetness >= 0.4) return "The board has some texture — draws are possible but limited";
  return isAggressive ? "The board is dry — a good spot to apply pressure" : "The board is dry and static — hands are unlikely to change";
}

// ═══════════════════════════════════════════════════════
// PRICE ASSESSMENT TEMPLATES
// ═══════════════════════════════════════════════════════

export function assessPrice(potOdds: number, isPriceSensitive: boolean): string {
  if (potOdds <= 0) return "No price to pay";
  const needed = (potOdds * 100).toFixed(0);
  if (potOdds < 0.2) return isPriceSensitive ? `Great price — only need ${needed}% equity` : "Cheap to continue";
  if (potOdds < 0.3) return "Reasonable price to see more cards";
  if (potOdds < 0.4) return isPriceSensitive ? `Expensive — need ${needed}% equity to justify` : "Getting expensive";
  return `Very expensive — need ${needed}% equity`;
}

// ═══════════════════════════════════════════════════════
// POSITION ASSESSMENT TEMPLATES
// ═══════════════════════════════════════════════════════

export function assessPosition(isIP: boolean, isPositional: boolean): string {
  if (isIP) return isPositional ? "In position — a significant advantage to exploit" : "In position";
  return isPositional ? "Out of position — a real disadvantage here" : "Out of position";
}

// ═══════════════════════════════════════════════════════
// OPPONENT ASSESSMENT TEMPLATES
// ═══════════════════════════════════════════════════════

export function assessOpponents(foldEquity: number, isAggroExploiter: boolean): string {
  if (foldEquity >= 0.6) return isAggroExploiter ? "Opponents fold often — an invitation to apply pressure" : "Opponents are likely to fold";
  if (foldEquity >= 0.35) return "Opponents have moderate folding tendencies";
  return isAggroExploiter ? "Opponents are sticky — bluffs will get called" : "Opponents are unlikely to fold";
}

// ═══════════════════════════════════════════════════════
// CONTEXT OVERRIDE TEMPLATES
// ═══════════════════════════════════════════════════════

interface ContextDelta {
  factor: string;
  label: string;
  /** How much the factor changed the modifier (0 = no change, higher = more override) */
  magnitude: number;
  reason: string;
}

export function buildContextOverrides(
  baseFoldScale: number,
  effectiveFoldScale: number,
  baseAggrScale: number,
  effectiveAggrScale: number,
  factors: { handStrength: number; drawOuts: number; potOdds: number; foldEquity: number; isInPosition: boolean; boardWetness: number; spr: number },
  sensitivities: { hand: number; draw: number; odds: number; foldEq: number; position: number; texture: number; spr: number },
): ContextDelta[] {
  const deltas: ContextDelta[] = [];

  // Fold attenuation analysis
  const foldDelta = Math.abs(baseFoldScale - effectiveFoldScale);
  if (foldDelta > 0.15) {
    // Which factor contributed most?
    if (factors.handStrength > 0.5 && sensitivities.hand > 0.2) {
      deltas.push({
        factor: "handStrength",
        label: "Hand strength",
        magnitude: factors.handStrength * sensitivities.hand,
        reason: baseFoldScale > 1 ?
          "Strong enough to override the urge to fold" :
          "Not strong enough to justify staying in",
      });
    }
    if (factors.drawOuts > 4 && sensitivities.draw > 0.1) {
      deltas.push({
        factor: "draws",
        label: "Draw potential",
        magnitude: Math.min(factors.drawOuts / 15, 1) * sensitivities.draw,
        reason: `${factors.drawOuts} outs make it worth continuing`,
      });
    }
    if (factors.potOdds > 0 && factors.potOdds < 0.25 && sensitivities.odds > 0.1) {
      deltas.push({
        factor: "potOdds",
        label: "Pot odds",
        magnitude: (1 - factors.potOdds) * sensitivities.odds,
        reason: "The price is too good to pass up",
      });
    }
  }

  // Aggression modulation analysis
  const aggrDelta = Math.abs(baseAggrScale - effectiveAggrScale);
  if (aggrDelta > 0.1) {
    if (factors.foldEquity > 0.4 && sensitivities.foldEq > 0.2) {
      deltas.push({
        factor: "foldEquity",
        label: "Fold equity",
        magnitude: factors.foldEquity * sensitivities.foldEq,
        reason: "Opponents fold often enough to make aggression profitable",
      });
    }
    if (factors.isInPosition && sensitivities.position > 0.3) {
      deltas.push({
        factor: "position",
        label: "Position",
        magnitude: sensitivities.position,
        reason: "Being in position makes aggression safer",
      });
    }
    if (factors.boardWetness > 0.5 && sensitivities.texture > 0.2) {
      deltas.push({
        factor: "texture",
        label: "Board texture",
        magnitude: factors.boardWetness * sensitivities.texture,
        reason: "The wet board creates more bluffing opportunities",
      });
    }
    if (factors.spr < 4 && sensitivities.spr > 0.2) {
      deltas.push({
        factor: "spr",
        label: "Stack depth",
        magnitude: (4 - factors.spr) / 4 * sensitivities.spr,
        reason: "Short stacks mean more commitment to the pot",
      });
    }
  }

  return deltas.sort((a, b) => b.magnitude - a.magnitude);
}

// ═══════════════════════════════════════════════════════
// PRIMARY REASON TEMPLATES
// ═══════════════════════════════════════════════════════

/** The dominant trait's influence on fold/continue decisions. */
const TRAIT_FOLD_REASONS: Partial<Record<TraitId, { folds: string; continues: string }>> = {
  cautious: {
    folds: "Not confident enough to continue — only plays strong hands",
    continues: "The hand is strong enough to overcome natural caution",
  },
  sticky: {
    folds: "Even a loose player has to give up sometimes",
    continues: "Reluctant to fold — always looking for a reason to stay in",
  },
  aggressive: {
    folds: "Sometimes even aggressive players have to slow down",
    continues: "Sees an opportunity to apply pressure",
  },
  passive: {
    folds: "Prefers to avoid confrontation",
    continues: "Comfortable calling — no need to escalate",
  },
  balanced: {
    folds: "GTO says this hand should fold in this spot",
    continues: "Balanced strategy includes this hand in the continuing range",
  },
  "hand-reader": {
    folds: "The hand doesn't meet the quality threshold for this situation",
    continues: "Hand strength justifies continuing in this spot",
  },
  "price-sensitive": {
    folds: "The price isn't right — too expensive relative to the hand",
    continues: "Getting a good enough price to see more cards",
  },
};

export function getPrimaryReason(
  dominantTraitId: TraitId,
  action: ActionType,
): string {
  const reasons = TRAIT_FOLD_REASONS[dominantTraitId];
  if (!reasons) {
    return action === "fold" ? "Decides to fold" : "Decides to continue";
  }

  if (action === "fold") return reasons.folds;
  if (action === "check") return reasons.continues;
  return reasons.continues;
}

// ═══════════════════════════════════════════════════════
// CONTINUITY TEMPLATES
// ═══════════════════════════════════════════════════════

export function getContinuityNarrative(
  previousAction: ActionType,
  previousIntent: "value" | "bluff" | "defensive" | "unknown",
  currentAction: ActionType,
): string {
  if (previousAction === "bet" || previousAction === "raise") {
    if (currentAction === "bet" || currentAction === "raise") {
      return previousIntent === "value"
        ? "Continuing to build the pot after showing strength"
        : "Maintaining the pressure — the story stays aggressive";
    }
    if (currentAction === "check") {
      return previousIntent === "bluff"
        ? "Giving up on the bluff — the story wasn't believable enough"
        : "Slowing down — the board changed or a trap is being set";
    }
    if (currentAction === "fold") {
      return "Faced resistance and decided the hand isn't worth fighting for";
    }
  }

  if (previousAction === "check" || previousAction === "call") {
    if (currentAction === "bet" || currentAction === "raise") {
      return "Was passive before, now taking the initiative — the story shifts";
    }
    if (currentAction === "check" || currentAction === "call") {
      return "Staying on the passive path — content to see more cards without escalating";
    }
    if (currentAction === "fold") {
      return "Was hoping to improve but didn't — time to give up the hand";
    }
  }

  return "";
}
