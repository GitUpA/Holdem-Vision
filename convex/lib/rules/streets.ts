/**
 * Street progression — acting order, round completion, hand termination.
 * Pure TypeScript, zero Convex imports.
 *
 * Key rules:
 * - Preflop: first to act is left of BB (UTG). Heads-up: BTN/SB acts first.
 * - Postflop: first to act is left of dealer (SB or next active).
 * - Round complete when: back to last aggressor, or all checked, or one active player.
 * - Short all-in does NOT reopen action (lastAggressorIndex unchanged).
 */
import type { Street } from "../types/cards";
import type { GameState, PlayerState } from "../state/gameState";

/**
 * Get the next street in sequence. Returns null after river.
 */
export function nextStreet(current: Street): Street | null {
  switch (current) {
    case "preflop":
      return "flop";
    case "flop":
      return "turn";
    case "turn":
      return "river";
    case "river":
      return null;
  }
}

/**
 * Check if a player can still act (active, not folded, not all-in).
 */
function canAct(player: PlayerState): boolean {
  return player.status === "active";
}

/**
 * Check if player is still in the hand (not folded, not sitting out).
 */
function isInHand(player: PlayerState): boolean {
  return player.status === "active" || player.status === "all_in";
}

/**
 * Count players who can still act.
 */
export function activePlayerCount(state: GameState): number {
  return state.players.filter(canAct).length;
}

/**
 * Count players still in the hand (active or all-in).
 */
export function playersInHand(state: GameState): number {
  return state.players.filter(isInHand).length;
}

/**
 * Find seat index for a specific position (e.g., "bb", "sb").
 */
function seatForPosition(state: GameState, pos: string): number | null {
  const player = state.players.find((p) => p.position === pos);
  return player ? player.seatIndex : null;
}

/**
 * Get the next player index (wrapping around) after the given index.
 */
function nextPlayerIndex(state: GameState, fromIndex: number): number {
  return (fromIndex + 1) % state.numPlayers;
}

/**
 * Find the first active player at or after the given player index (searching clockwise).
 * Returns null if no active player found.
 */
function findNextActive(state: GameState, startIndex: number): number | null {
  for (let i = 0; i < state.numPlayers; i++) {
    const idx = (startIndex + i) % state.numPlayers;
    if (canAct(state.players[idx])) {
      return idx;
    }
  }
  return null;
}

/**
 * Determine first player to act on a given street.
 *
 * Preflop:
 *   - Heads-up (2 players): BTN/SB acts first
 *   - 3+ players: UTG (first active left of BB)
 *
 * Postflop:
 *   - First active player left of dealer (SB or next)
 */
export function firstToAct(state: GameState, street: Street): number | null {
  if (activePlayerCount(state) <= 1) return null;

  if (street === "preflop") {
    if (state.numPlayers === 2) {
      // Heads-up: BTN/SB acts first preflop
      // Dealer is seat dealerSeatIndex, which is BTN (also SB in heads-up)
      const btnIdx = state.players.findIndex(
        (p) => p.seatIndex === state.dealerSeatIndex,
      );
      return findNextActive(state, btnIdx);
    }

    // 3+ players: first active player left of BB
    const bbSeat = seatForPosition(state, "bb");
    if (bbSeat === null) return null;
    const bbIdx = state.players.findIndex((p) => p.seatIndex === bbSeat);
    return findNextActive(state, nextPlayerIndex(state, bbIdx));
  }

  // Postflop: first active left of dealer
  const dealerIdx = state.players.findIndex(
    (p) => p.seatIndex === state.dealerSeatIndex,
  );
  return findNextActive(state, nextPlayerIndex(state, dealerIdx));
}

/**
 * Determine the next player to act after the current active player.
 * Returns null if no next player (round is complete or hand is over).
 */
export function nextToAct(state: GameState): number | null {
  if (state.activePlayerIndex === null) return null;
  if (isHandOver(state)) return null;
  if (isBettingRoundComplete(state)) return null;

  const startIdx = nextPlayerIndex(state, state.activePlayerIndex);
  return findNextActive(state, startIdx);
}

/**
 * Check if the current betting round is complete.
 *
 * Complete when:
 * 1. Only one player remains in hand → hand over
 * 2. All active players have acted and matched the current bet
 * 3. Action has returned to the last aggressor
 * 4. No active players (all folded or all-in)
 */
export function isBettingRoundComplete(state: GameState): boolean {
  const activePlayers = state.players.filter(canAct);

  // No active players — everyone folded or is all-in
  if (activePlayers.length === 0) return true;

  // Only one player in hand total
  if (playersInHand(state) <= 1) return true;

  // Only one active player (rest are folded/all-in) and they've matched the bet
  if (activePlayers.length === 1) {
    const p = activePlayers[0];
    // If there was no aggressor, they need to have acted
    if (state.lastAggressorIndex === null) {
      return p.hasActedThisStreet;
    }
    // If they ARE the aggressor, round complete
    if (state.players.indexOf(p) === state.lastAggressorIndex) return true;
    // Otherwise they need to have matched the bet
    return p.hasActedThisStreet && p.streetCommitted >= state.currentBet;
  }

  // All active players must have acted
  if (!activePlayers.every((p) => p.hasActedThisStreet)) return false;

  // All active players must have committed the same as current bet
  if (!activePlayers.every((p) => p.streetCommitted >= state.currentBet)) {
    return false;
  }

  return true;
}

/**
 * Check if the hand is over.
 *
 * Over when:
 * 1. Only one player remains (rest folded)
 * 2. Phase is "showdown" or "complete"
 */
export function isHandOver(state: GameState): boolean {
  if (state.phase === "showdown" || state.phase === "complete") return true;
  if (playersInHand(state) <= 1) return true;
  return false;
}

/**
 * Check if all remaining players are all-in (no more action possible).
 */
export function allPlayersAllIn(state: GameState): boolean {
  const inHand = state.players.filter(isInHand);
  if (inHand.length <= 1) return false;
  return inHand.every((p) => p.status === "all_in");
}

/**
 * Get players eligible for showdown (still in hand).
 */
export function showdownPlayers(state: GameState): PlayerState[] {
  return state.players.filter(isInHand);
}

/**
 * Get acting order for a street.
 * Returns seat indices in the order players would act.
 */
export function actionOrder(state: GameState, street: Street): number[] {
  const first = firstToAct(state, street);
  if (first === null) return [];

  const order: number[] = [];
  let idx = first;
  for (let i = 0; i < state.numPlayers; i++) {
    if (canAct(state.players[idx])) {
      order.push(state.players[idx].seatIndex);
    }
    idx = nextPlayerIndex(state, idx);
  }
  return order;
}
