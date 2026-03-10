/**
 * Card type definitions — pure TypeScript, zero Convex imports.
 */

export const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"] as const;
export const SUITS = ["c", "d", "h", "s"] as const;
export const SUIT_NAMES = { c: "clubs", d: "diamonds", h: "hearts", s: "spades" } as const;
export const SUIT_SYMBOLS = { c: "\u2663", d: "\u2666", h: "\u2665", s: "\u2660" } as const;

export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];

/** Card index 0-51. rank = floor(i/4), suit = i%4 */
export type CardIndex = number;

export type Street = "preflop" | "flop" | "turn" | "river";
export type Position = "utg" | "utg1" | "utg2" | "mp" | "mp1" | "hj" | "co" | "btn" | "sb" | "bb";

export const HAND_RANK_NAMES = [
  "High Card",
  "One Pair",
  "Two Pair",
  "Three of a Kind",
  "Straight",
  "Flush",
  "Full House",
  "Four of a Kind",
  "Straight Flush",
  "Royal Flush",
] as const;

export type HandRankName = (typeof HAND_RANK_NAMES)[number];

/** Numeric hand rank for comparison (higher = better) */
export interface HandRank {
  tier: number;          // 0=high card .. 9=royal flush
  name: HandRankName;
  tiebreakers: number[]; // ordered values for breaking ties within tier
}
