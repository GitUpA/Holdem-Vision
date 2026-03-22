/**
 * Action Mapping — converts between GtoAction (frequency table actions) and
 * game engine ActionType + amount.
 *
 * Pure TypeScript, zero Convex imports.
 */
import type { ActionType, LegalActions } from "../state/gameState";
import type { GtoAction, ActionFrequencies } from "./tables/types";

export interface GameActionResult {
  actionType: ActionType;
  amount?: number;
}

/** GTO action sizing as fraction of pot */
const GTO_SIZING: Record<string, number> = {
  bet_small: 0.33,
  bet_medium: 0.67,
  bet_large: 1.0,
  raise_small: 2.5,  // multiplier on current bet
  raise_large: 3.0,
};

/**
 * Map a GtoAction to a concrete game action with amount.
 * Clamps amounts to legal ranges.
 */
export function gtoActionToGameAction(
  gtoAction: GtoAction,
  legal: LegalActions,
  potTotal: number,
): GameActionResult {
  switch (gtoAction) {
    case "fold":
      return { actionType: "fold" };

    case "check":
      return legal.canCheck
        ? { actionType: "check" }
        : { actionType: "fold" }; // fallback if can't check

    case "call":
      return legal.canCall
        ? { actionType: "call", amount: legal.callAmount }
        : { actionType: "check" }; // fallback

    case "bet_small":
    case "bet_medium":
    case "bet_large": {
      if (legal.canBet) {
        const sizing = GTO_SIZING[gtoAction];
        const raw = Math.round(potTotal * sizing);
        const amount = clamp(raw, legal.betMin, legal.betMax);
        return { actionType: "bet", amount };
      }
      // If can't bet but can raise (e.g. facing a bet), map to raise
      if (legal.canRaise) {
        const sizing = GTO_SIZING[gtoAction];
        const raw = Math.round(potTotal * sizing);
        const amount = clamp(raw, legal.raiseMin, legal.raiseMax);
        return { actionType: "raise", amount };
      }
      // Fallback: call or check
      if (legal.canCall) return { actionType: "call", amount: legal.callAmount };
      return { actionType: "check" };
    }

    case "raise_small":
    case "raise_large": {
      if (legal.canRaise) {
        const multiplier = GTO_SIZING[gtoAction];
        const currentBet = legal.callAmount; // amount to call = current bet facing us
        const raw = Math.round(currentBet * multiplier);
        const amount = clamp(raw, legal.raiseMin, legal.raiseMax);
        return { actionType: "raise", amount };
      }
      // If can't raise but can bet
      if (legal.canBet) {
        const sizing = gtoAction === "raise_small" ? 0.5 : 0.75;
        const raw = Math.round(potTotal * sizing);
        const amount = clamp(raw, legal.betMin, legal.betMax);
        return { actionType: "bet", amount };
      }
      if (legal.canCall) return { actionType: "call", amount: legal.callAmount };
      return { actionType: "check" };
    }

    default:
      return { actionType: "check" };
  }
}

/**
 * Human-readable label for a GtoAction.
 */
export function gtoActionLabel(action: GtoAction): string {
  switch (action) {
    case "fold": return "Fold";
    case "check": return "Check";
    case "call": return "Call";
    case "bet_small": return "Bet 33%";
    case "bet_medium": return "Bet 67%";
    case "bet_large": return "Bet 100%";
    case "raise_small": return "Raise Small";
    case "raise_large": return "Raise Large";
    default: return action;
  }
}

/**
 * Remap solver frequencies so action labels match what's actually legal.
 * check↔call when one isn't available, bet↔raise similarly.
 * Used by coaching lens and drill mode solution display.
 */
export function remapFrequenciesToLegal(
  freqs: ActionFrequencies,
  legal: LegalActions,
): ActionFrequencies {
  const result: ActionFrequencies = { ...freqs };

  // fold → check: if can't fold but can check, fold means "don't commit chips"
  if (!legal.canFold && legal.canCheck && result.fold) {
    result.check = (result.check ?? 0) + result.fold;
    delete result.fold;
  }

  // check ↔ call: if one isn't legal, merge into the other
  if (!legal.canCheck && result.check) {
    result.call = (result.call ?? 0) + result.check;
    delete result.check;
  } else if (!legal.canCall && result.call) {
    result.check = (result.check ?? 0) + result.call;
    delete result.call;
  }

  // bet → raise when can't bet but can raise
  if (!legal.canBet && legal.canRaise) {
    for (const betKey of ["bet_small", "bet_medium", "bet_large"] as const) {
      if (result[betKey]) {
        const raiseKey = betKey === "bet_small" ? "raise_small" : "raise_large";
        result[raiseKey] = (result[raiseKey] ?? 0) + (result[betKey] ?? 0);
        delete result[betKey];
      }
    }
  }

  // raise → bet when can't raise but can bet
  if (!legal.canRaise && legal.canBet) {
    for (const raiseKey of ["raise_small", "raise_large"] as const) {
      if (result[raiseKey]) {
        const betKey = raiseKey === "raise_small" ? "bet_small" : "bet_large";
        result[betKey] = (result[betKey] ?? 0) + (result[raiseKey] ?? 0);
        delete result[raiseKey];
      }
    }
  }

  return result;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
