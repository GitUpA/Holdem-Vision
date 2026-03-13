/**
 * Action validation — legal actions computation and action validation.
 * Pure TypeScript, zero Convex imports.
 *
 * Poker betting rules:
 * - canCheck: when currentBet === player.streetCommitted
 * - canCall: when bet exists. callAmount = currentBet - streetCommitted
 *   Short-stack → isCallAllIn
 * - canBet: when currentBet === 0. betMin = BB, betMax = stack
 * - canRaise: when currentBet > 0. raiseMin = currentBet + minRaiseSize
 *   Can't raise if stack < call + minRaise (only call or all-in)
 * - minRaiseSize tracks last raise increment (not total). Resets to BB each street.
 */
import type { GameState, LegalActions, ActionType } from "../state/game-state";

export interface ActionValidation {
  valid: boolean;
  reason: string;
}

/**
 * Compute the legal actions for the current active player.
 * Returns null if no player is active.
 */
export function getLegalActions(state: GameState): LegalActions | null {
  if (state.activePlayerIndex === null) return null;

  const player = state.players[state.activePlayerIndex];
  if (player.status !== "active") return null;

  const stack = player.currentStack;
  const toCall = state.currentBet - player.streetCommitted;
  const bb = state.blinds.big;

  // Can always fold (if there's a bet to face)
  const canFold = toCall > 0;

  // Can check if no bet to call
  const canCheck = toCall <= 0;

  // Can call if there's a bet and we have chips
  const canCall = toCall > 0 && stack > 0;
  const callAmount = Math.min(toCall, stack);
  const isCallAllIn = canCall && stack <= toCall;

  // Can bet if no current bet and we have chips
  const canBet = state.currentBet === 0 && stack > 0;
  const betMin = canBet ? Math.min(bb, stack) : 0;
  const betMax = canBet ? stack : 0;

  // Can raise if there's a current bet
  // Must have enough chips to call + min raise increment
  const raiseMinTotal = state.currentBet + state.minRaiseSize;
  const canRaise = state.currentBet > 0 && stack > toCall && toCall >= 0;
  const raiseMin = canRaise ? Math.min(raiseMinTotal, player.streetCommitted + stack) : 0;
  const raiseMax = canRaise ? player.streetCommitted + stack : 0;

  const parts: string[] = [];
  if (canFold) parts.push("fold");
  if (canCheck) parts.push("check");
  if (canCall) parts.push(`call ${callAmount}${isCallAllIn ? " (all-in)" : ""}`);
  if (canBet) parts.push(`bet ${betMin}-${betMax}`);
  if (canRaise) parts.push(`raise ${raiseMin}-${raiseMax}`);

  return {
    seatIndex: player.seatIndex,
    position: player.position,
    canFold,
    canCheck,
    canCall,
    callAmount,
    canBet,
    betMin,
    betMax,
    canRaise,
    raiseMin,
    raiseMax,
    isCallAllIn,
    explanation: `Legal: ${parts.join(", ")}`,
  };
}

/**
 * Validate whether a specific action is legal for the given player.
 */
export function validateAction(
  state: GameState,
  seatIndex: number,
  actionType: ActionType,
  amount?: number,
): ActionValidation {
  // Must be that player's turn
  if (state.activePlayerIndex === null) {
    return { valid: false, reason: "No active player" };
  }

  const player = state.players[state.activePlayerIndex];
  if (player.seatIndex !== seatIndex) {
    return {
      valid: false,
      reason: `Not seat ${seatIndex}'s turn (active: seat ${player.seatIndex})`,
    };
  }

  const legal = getLegalActions(state);
  if (!legal) {
    return { valid: false, reason: "No legal actions available" };
  }

  switch (actionType) {
    case "fold":
      if (!legal.canFold) {
        return { valid: false, reason: "Cannot fold (no bet to face — check instead)" };
      }
      return { valid: true, reason: "Fold is legal" };

    case "check":
      if (!legal.canCheck) {
        return { valid: false, reason: "Cannot check (must call, raise, or fold)" };
      }
      return { valid: true, reason: "Check is legal" };

    case "call":
      if (!legal.canCall) {
        return { valid: false, reason: "Cannot call (no bet to call)" };
      }
      return { valid: true, reason: `Call ${legal.callAmount} is legal` };

    case "bet": {
      if (!legal.canBet) {
        return { valid: false, reason: "Cannot bet (action already open — raise instead)" };
      }
      const betAmt = amount ?? 0;
      if (betAmt < legal.betMin) {
        return { valid: false, reason: `Bet ${betAmt} below minimum ${legal.betMin}` };
      }
      if (betAmt > legal.betMax) {
        return { valid: false, reason: `Bet ${betAmt} exceeds stack (max ${legal.betMax})` };
      }
      return { valid: true, reason: `Bet ${betAmt} is legal` };
    }

    case "raise": {
      if (!legal.canRaise) {
        return { valid: false, reason: "Cannot raise" };
      }
      const raiseAmt = amount ?? 0;
      if (raiseAmt < legal.raiseMin) {
        return { valid: false, reason: `Raise to ${raiseAmt} below minimum ${legal.raiseMin}` };
      }
      if (raiseAmt > legal.raiseMax) {
        return { valid: false, reason: `Raise to ${raiseAmt} exceeds stack (max ${legal.raiseMax})` };
      }
      return { valid: true, reason: `Raise to ${raiseAmt} is legal` };
    }

    case "all_in":
      // All-in is always legal if player has chips
      if (player.currentStack <= 0) {
        return { valid: false, reason: "Cannot go all-in with no chips" };
      }
      return { valid: true, reason: `All-in for ${player.currentStack} is legal` };

    default:
      return { valid: false, reason: `Unknown action type: ${actionType}` };
  }
}
