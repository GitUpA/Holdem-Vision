/**
 * Narrative Templates — prose generation from structured interpretations.
 *
 * Maps traits, context factors, and actions to natural-language prose.
 * Templates are composable: any trait combination produces coherent text
 * without per-profile hardcoding.
 *
 * Pure TypeScript, zero Convex imports.
 */
import type { ActionType } from "../../state/gameState";
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

/** Action-specific reason text for each trait. */
interface TraitActionReasons {
  folds: string;
  checks: string;
  calls: string;
  bets: string;
  raises: string;
}

/** The dominant trait's influence on action decisions. */
const TRAIT_ACTION_REASONS: Partial<Record<TraitId, TraitActionReasons>> = {
  cautious: {
    folds: "Not confident enough to continue — only plays strong hands",
    checks: "Checks to avoid committing more chips",
    calls: "The hand is strong enough to overcome natural caution",
    bets: "Bets for value — confident enough to commit chips",
    raises: "The hand is strong enough to raise despite cautious nature",
  },
  sticky: {
    folds: "Even a loose player has to give up sometimes",
    checks: "Checks but stays in the hand — not going anywhere",
    calls: "Reluctant to fold — always looking for a reason to stay in",
    bets: "Bets to build the pot — invested in this hand",
    raises: "Raises to protect the investment — too deep to back down",
  },
  aggressive: {
    folds: "Sometimes even aggressive players have to slow down",
    checks: "Checks back — waiting for a better spot to attack",
    calls: "Calls to set up aggression on a later street",
    bets: "Sees an opportunity to apply pressure",
    raises: "Raises to seize control — aggression is the default",
  },
  passive: {
    folds: "Prefers to avoid confrontation",
    checks: "Checks to keep the pot small",
    calls: "Comfortable calling — no need to escalate",
    bets: "Bets when the hand demands it, despite passive nature",
    raises: "Raises reluctantly — the hand is too strong to just call",
  },
  balanced: {
    folds: "GTO says this hand should fold in this spot",
    checks: "Checking at the correct frequency for balance",
    calls: "Balanced strategy includes this hand in the calling range",
    bets: "GTO betting frequency dictates a bet here",
    raises: "Raising for balance — mixing in the right proportion",
  },
  "hand-reader": {
    folds: "The hand doesn't meet the quality threshold for this situation",
    checks: "Hand strength doesn't warrant building the pot",
    calls: "Hand strength justifies continuing in this spot",
    bets: "Hand strength warrants betting for value",
    raises: "Hand strength demands a raise — too strong to slow-play",
  },
  "price-sensitive": {
    folds: "The price isn't right — too expensive relative to the hand",
    checks: "No price to pay — happy to see a free card",
    calls: "Getting a good enough price to see more cards",
    bets: "Betting to deny opponents a cheap draw",
    raises: "Raising to charge opponents the maximum price",
  },
  "raise-happy": {
    folds: "Even raise-happy players fold when the math says to",
    checks: "Checks to disguise strength — setting up a raise",
    calls: "Calls this time — but prefers raising in most spots",
    bets: "Opens with a bet — always looking for initiative",
    raises: "Raises as the default play — wants to control the pot size",
  },
  "call-heavy": {
    folds: "Rare fold — this hand truly has no future",
    checks: "Checks and plans to call if there's action",
    calls: "Calls are the comfort zone — sees no reason to raise",
    bets: "Unusual bet — the hand is too strong to just call",
    raises: "An unusual raise from a call-heavy profile — a real hand",
  },
  positional: {
    folds: "Out of position with a marginal hand — discretion wins",
    checks: "Checks to control the pot from position",
    calls: "Calls to see how the action develops in position",
    bets: "Uses positional advantage to apply pressure",
    raises: "Raises to exploit the positional edge",
  },
  "fold-equity-exploiter": {
    folds: "No fold equity available — can't profitably bluff",
    checks: "Checks — opponents aren't folding enough to bluff",
    calls: "Calls while waiting for a better spot to apply pressure",
    bets: "Bets because opponents fold often enough to make it profitable",
    raises: "Raises to exploit opponents' high fold frequency",
  },
  "draw-chaser": {
    folds: "No draws available — nothing to chase",
    checks: "Checks to see the next card cheaply",
    calls: "Calls to chase the draw — needs more cards",
    bets: "Semi-bluffs with draw equity behind the bet",
    raises: "Raises with a strong draw — combining fold equity with draw equity",
  },
  "texture-reader": {
    folds: "The board texture doesn't favor continuing",
    checks: "Reads the board as dangerous — keeps the pot small",
    calls: "Board texture supports continuing with this hand",
    bets: "The board texture creates a good spot to bet",
    raises: "Board texture favors aggression here",
  },
  "big-bettor": {
    folds: "Folds rather than make a small, ineffective bet",
    checks: "Checks rather than bet small",
    calls: "Calls to set up a bigger bet later",
    bets: "Goes big — small bets don't accomplish anything",
    raises: "Raises large to maximize pressure",
  },
  "small-bettor": {
    folds: "Folds when even a small bet wouldn't help",
    checks: "Checks to keep options open",
    calls: "Calls the small price",
    bets: "Bets small to control the pot",
    raises: "Raises the minimum — just enough to stay aggressive",
  },
  "spr-aware": {
    folds: "Stack depth says this isn't the spot to commit",
    checks: "Checks with awareness of remaining stack-to-pot ratio",
    calls: "SPR justifies continuing — not yet committed",
    bets: "Stack depth makes this a good commitment point",
    raises: "Shallow stacks demand commitment — raises for value",
  },
  extreme: {
    folds: "Even extreme players fold with nothing",
    checks: "Checks as part of a polarized strategy",
    calls: "Calls — keeping the opponent guessing",
    bets: "Bets aggressively — maximum deviation from GTO",
    raises: "Raises big — unpredictable and hard to play against",
  },
};

/**
 * Full context for narrative generation.
 * When available, produces context-aware narratives instead of trait-only templates.
 */
export interface NarrativeContext {
  handStrength: number;
  handDescription: string;
  boardWetness: number;
  drawOuts: number;
  bestDrawType: string;
  potOdds: number;
  foldEquity: number;
  spr: number;
  isInPosition: boolean;
  isPreflop: boolean;
}

/**
 * Generate context-aware primary reason for an action.
 * Uses trait as character flavor but composes with board, hand, and street context.
 */
export function getPrimaryReason(
  dominantTraitId: TraitId,
  action: ActionType,
  factors?: { handStrength: number },
  fullContext?: NarrativeContext,
): string {
  // If full context available, generate context-aware narrative
  if (fullContext) {
    return getContextAwareReason(dominantTraitId, action, fullContext);
  }

  // Fallback to trait-only templates
  const reasons = TRAIT_ACTION_REASONS[dominantTraitId];
  if (!reasons) {
    if (action === "fold") return "Decides to fold";
    if (action === "check") return "Decides to check";
    if (action === "call") return "Decides to call";
    if (action === "bet" || action === "raise" || action === "all_in") return "Decides to bet";
    return "Decides to continue";
  }

  if (action === "fold") return reasons.folds;
  if (action === "check") return reasons.checks;
  if (action === "call") {
    if (dominantTraitId === "hand-reader" && factors) {
      if (factors.handStrength > 0.6) return "Hand strength justifies continuing in this spot";
      if (factors.handStrength >= 0.3) return "Marginal hand — proceeding with caution";
      return "Weak hand — this profile sees something others might miss";
    }
    return reasons.calls;
  }
  if (action === "bet") return reasons.bets;
  if (action === "raise" || action === "all_in") return reasons.raises;
  return reasons.calls;
}

// ═══════════════════════════════════════════════════════
// CONTEXT-AWARE NARRATIVE GENERATION
// ═══════════════════════════════════════════════════════

function getContextAwareReason(
  traitId: TraitId,
  action: ActionType,
  ctx: NarrativeContext,
): string {
  const hand = ctx.handDescription;
  const boardNote = ctx.isPreflop ? "" : getBoardNote(ctx);
  const streetNote = ctx.isPreflop ? "preflop" : "";

  // FOLD — why are we giving up?
  if (action === "fold") {
    if (ctx.handStrength < 0.15) {
      return `${hand} can't compete here — folding is the clear play`;
    }
    if (ctx.potOdds > 0.3) {
      return `The price is too high for ${hand}${boardNote}`;
    }
    if (traitId === "cautious") {
      return `${hand} isn't strong enough for a cautious player to continue`;
    }
    return `${hand} doesn't warrant continuing${boardNote}`;
  }

  // CHECK — what are we accomplishing?
  if (action === "check") {
    if (ctx.handStrength > 0.7) {
      return `Checks ${hand} to trap — the hand is strong enough to slowplay${boardNote}`;
    }
    if (ctx.handStrength > 0.4) {
      return `Checks for pot control with ${hand}${boardNote}`;
    }
    if (ctx.drawOuts > 6) {
      return `Checks to see a free card with ${ctx.bestDrawType}`;
    }
    if (traitId === "passive") {
      return `Checks — prefers to keep the pot small with ${hand}`;
    }
    return `Checks with ${hand} — not strong enough to bet for value`;
  }

  // CALL — why continue without raising?
  if (action === "call") {
    if (ctx.drawOuts > 8) {
      return `Calls with ${ctx.bestDrawType} (${ctx.drawOuts} outs) — the price is right to draw`;
    }
    if (ctx.potOdds > 0 && ctx.potOdds < 0.25) {
      return `Getting good odds to call with ${hand}`;
    }
    if (ctx.handStrength > 0.6) {
      return `Calls with ${hand} — strong but not raising to keep opponents in`;
    }
    if (traitId === "sticky" || traitId === "call-heavy") {
      return `Calls with ${hand} — prefers calling over folding in most spots`;
    }
    return `Calls with ${hand}${boardNote}`;
  }

  // BET — what story are we telling?
  if (action === "bet") {
    if (ctx.handStrength > 0.75) {
      return `Bets ${hand} for value${boardNote}`;
    }
    if (ctx.drawOuts > 6) {
      return `Semi-bluffs with ${ctx.bestDrawType}${boardNote} — fold equity plus draw equity`;
    }
    if (ctx.handStrength < 0.2 && ctx.foldEquity > 0.4) {
      return `Bluffs with ${hand} — opponents likely to fold${boardNote}`;
    }
    if (ctx.handStrength > 0.4) {
      return `Bets ${hand} for thin value${boardNote}`;
    }
    if (traitId === "aggressive") {
      return `Applies pressure with ${hand}${boardNote}`;
    }
    return `Bets with ${hand}${boardNote}`;
  }

  // RAISE / ALL-IN — escalation
  if (action === "raise" || action === "all_in") {
    if (ctx.handStrength > 0.8) {
      return `Raises for value with ${hand} — building the pot with a strong hand`;
    }
    if (ctx.drawOuts > 8) {
      return `Raises as a semi-bluff with ${ctx.bestDrawType} — combining fold equity and draw equity`;
    }
    if (ctx.handStrength < 0.2 && ctx.foldEquity > 0.5) {
      return `Raises as a bluff — representing a strong hand${boardNote}`;
    }
    if (ctx.spr < 3) {
      return `Raises with ${hand} — short stacks demand commitment`;
    }
    if (ctx.isPreflop) {
      return `Raises ${hand} ${ctx.isInPosition ? "in position" : "from early position"}`;
    }
    return `Raises with ${hand}${boardNote}`;
  }

  return `Continues with ${hand}`;
}

function getBoardNote(ctx: NarrativeContext): string {
  if (ctx.isPreflop) return "";
  if (ctx.boardWetness > 0.6) return " on this wet board";
  if (ctx.boardWetness < 0.2) return " on this dry board";
  return "";
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
