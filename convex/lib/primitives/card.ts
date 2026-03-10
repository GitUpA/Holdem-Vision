/**
 * Card primitives — pure TypeScript, zero Convex imports.
 *
 * Encoding: card index 0-51
 *   rank = Math.floor(index / 4)   → 0=2, 1=3, ..., 12=A
 *   suit = index % 4               → 0=clubs, 1=diamonds, 2=hearts, 3=spades
 */
import type { CardIndex, Rank, Suit } from "../types/cards";
import { RANKS, SUITS, SUIT_SYMBOLS } from "../types/cards";

export { RANKS, SUITS, SUIT_SYMBOLS };
export type { CardIndex, Rank, Suit };

export function rankOf(card: CardIndex): Rank {
  return RANKS[Math.floor(card / 4)];
}

export function suitOf(card: CardIndex): Suit {
  return SUITS[card % 4];
}

/** Numeric rank value (2=0, 3=1, ..., A=12) */
export function rankValue(card: CardIndex): number {
  return Math.floor(card / 4);
}

/** Numeric suit value (c=0, d=1, h=2, s=3) */
export function suitValue(card: CardIndex): number {
  return card % 4;
}

export function cardToString(card: CardIndex): string {
  return `${rankOf(card)}${suitOf(card)}`;
}

export function cardToDisplay(card: CardIndex): string {
  return `${rankOf(card)}${SUIT_SYMBOLS[suitOf(card)]}`;
}

export function cardFromString(str: string): CardIndex {
  const rank = str[0] as Rank;
  const suit = str[1] as Suit;
  const rankIdx = RANKS.indexOf(rank);
  const suitIdx = SUITS.indexOf(suit);
  if (rankIdx === -1 || suitIdx === -1) throw new Error(`Invalid card: ${str}`);
  return rankIdx * 4 + suitIdx;
}

export function cardsFromStrings(strs: string[]): CardIndex[] {
  return strs.map(cardFromString);
}

export function createDeck(): CardIndex[] {
  return Array.from({ length: 52 }, (_, i) => i);
}

/** Check if two cards share the same suit */
export function sameSuit(a: CardIndex, b: CardIndex): boolean {
  return suitValue(a) === suitValue(b);
}

/** Check if two cards share the same rank */
export function sameRank(a: CardIndex, b: CardIndex): boolean {
  return rankValue(a) === rankValue(b);
}
