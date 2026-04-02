/**
 * Position utilities — seat-to-position mapping and position-based range adjustments.
 *
 * Standard Hold'em positions (clockwise from dealer):
 * BTN → SB → BB → UTG → UTG+1 → UTG+2 → MP → MP+1 → HJ → CO
 *
 * For fewer players, compress from early positions inward.
 * Heads-up: BTN (is also SB) → BB.
 *
 * Pure TypeScript, zero Convex imports.
 */
import type { Position } from "../types/cards";

/**
 * Full 10-seat position order, clockwise from dealer.
 */
/**
 * Position subsets for each table size.
 * Seats are removed from the middle (early positions compressed first).
 */
const POSITIONS_BY_TABLE_SIZE: Record<number, Position[]> = {
  2: ["btn", "bb"],                                                     // Heads-up: BTN is also SB
  3: ["btn", "sb", "bb"],
  4: ["btn", "sb", "bb", "co"],
  5: ["btn", "sb", "bb", "utg", "co"],
  6: ["btn", "sb", "bb", "utg", "hj", "co"],
  7: ["btn", "sb", "bb", "utg", "mp", "hj", "co"],
  8: ["btn", "sb", "bb", "utg", "utg1", "mp", "hj", "co"],
  9: ["btn", "sb", "bb", "utg", "utg1", "utg2", "mp", "hj", "co"],
  10: ["btn", "sb", "bb", "utg", "utg1", "utg2", "mp", "mp1", "hj", "co"],
};

/**
 * Return the position labels used for an N-player table (2-10).
 */
export function positionsForTableSize(numPlayers: number): Position[] {
  if (numPlayers < 2 || numPlayers > 10) {
    throw new Error(`Invalid table size: ${numPlayers} (must be 2-10)`);
  }
  return [...POSITIONS_BY_TABLE_SIZE[numPlayers]];
}

/**
 * Map every seat index to its Position, given the dealer seat and number of players.
 *
 * The dealer seat gets "btn". Seats clockwise from dealer get
 * the remaining positions in order.
 */
export function seatToPositionMap(
  dealerSeatIndex: number,
  numPlayers: number,
): Map<number, Position> {
  const positions = positionsForTableSize(numPlayers);
  const map = new Map<number, Position>();

  for (let i = 0; i < numPlayers; i++) {
    const seatIndex = (dealerSeatIndex + i) % numPlayers;
    map.set(seatIndex, positions[i]);
  }

  return map;
}

/**
 * Get the position for a specific seat.
 */
export function positionForSeat(
  seatIndex: number,
  dealerSeatIndex: number,
  numPlayers: number,
): Position {
  const map = seatToPositionMap(dealerSeatIndex, numPlayers);
  const pos = map.get(seatIndex);
  if (!pos) {
    throw new Error(`Seat ${seatIndex} not found (${numPlayers} players, dealer at ${dealerSeatIndex})`);
  }
  return pos;
}

/**
 * Number of players yet to act AFTER hero in preflop action order.
 * Preflop order: UTG → UTG+1 → … → CO → BTN → SB → BB.
 */
export function playersBehind(heroPosition: Position, tableSize: number): number {
  const positions = positionsForTableSize(Math.max(2, Math.min(10, tableSize)));
  // Preflop action order: skip BTN/SB/BB from front, put them at end
  const blindsAndBtn = positions.slice(0, tableSize <= 2 ? 1 : 3); // btn,sb,bb (or just btn for HU)
  const rest = positions.slice(tableSize <= 2 ? 1 : 3);            // utg..co
  const actionOrder = [...rest, ...blindsAndBtn];
  const idx = actionOrder.indexOf(heroPosition);
  if (idx === -1) return 0;
  return actionOrder.length - 1 - idx;
}

// ─── Position range multipliers ───

/**
 * How much wider (>1) or tighter (<1) a player's range should be
 * from this position, relative to their baseline VPIP/PFR.
 *
 * These encode the fundamental poker truth: late position plays wider,
 * early position plays tighter.
 */
const POSITION_MULTIPLIERS: Record<Position, number> = {
  utg: 0.55,
  utg1: 0.60,
  utg2: 0.65,
  mp: 0.75,
  mp1: 0.80,
  hj: 0.90,
  co: 1.15,
  btn: 1.40,
  sb: 0.85,
  bb: 1.00,
};

/**
 * Get the range multiplier for a position.
 *
 * Multiply a player's VPIP/PFR by this to get position-adjusted values.
 * E.g., TAG with 22% VPIP from BTN: 22 * 1.40 = ~31% range.
 * Same TAG from UTG: 22 * 0.55 = ~12% range.
 */
export function positionRangeMultiplier(position: Position): number {
  return POSITION_MULTIPLIERS[position];
}

/**
 * Early positions: must act first, play tightest.
 */
export function isEarlyPosition(position: Position): boolean {
  return position === "utg" || position === "utg1" || position === "utg2";
}

/**
 * Late positions: act last, play widest.
 */
export function isLatePosition(position: Position): boolean {
  return position === "co" || position === "btn";
}

/**
 * Middle positions: between early and late.
 */
export function isMiddlePosition(position: Position): boolean {
  return position === "mp" || position === "mp1" || position === "hj";
}

/**
 * Blind positions: forced bets, special dynamics.
 */
export function isBlindPosition(position: Position): boolean {
  return position === "sb" || position === "bb";
}

/**
 * Human-readable position name.
 */
export function positionDisplayName(position: Position): string {
  const names: Record<Position, string> = {
    utg: "Under the Gun",
    utg1: "UTG+1",
    utg2: "UTG+2",
    mp: "Middle Position",
    mp1: "MP+1",
    hj: "Hijack",
    co: "Cutoff",
    btn: "Button",
    sb: "Small Blind",
    bb: "Big Blind",
  };
  return names[position];
}
