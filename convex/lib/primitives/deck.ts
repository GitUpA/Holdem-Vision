/**
 * Deck operations — shuffle, deal, remove.
 * Uses Fisher-Yates shuffle with optional seedable PRNG.
 */
import type { CardIndex } from "../types/cards";
import { createDeck } from "./card";

/**
 * Fisher-Yates shuffle (in-place, returns same array).
 * Uses Math.random by default; pass a PRNG for deterministic results.
 */
export function shuffle(
  cards: CardIndex[],
  random: () => number = Math.random,
): CardIndex[] {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

/**
 * Simple seedable PRNG (mulberry32).
 * Good enough for card games — not cryptographic.
 */
export function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Create a shuffled deck, optionally excluding specific cards.
 */
export function createShuffledDeck(
  excludeCards: CardIndex[] = [],
  random?: () => number,
): CardIndex[] {
  const excluded = new Set(excludeCards);
  const deck = createDeck().filter((c) => !excluded.has(c));
  return shuffle(deck, random);
}

/**
 * Deal n cards from the top of a deck (mutates the deck).
 * Returns the dealt cards.
 */
export function deal(deck: CardIndex[], count: number): CardIndex[] {
  if (deck.length < count) {
    throw new Error(`Cannot deal ${count} cards from deck of ${deck.length}`);
  }
  return deck.splice(0, count);
}

/**
 * Get remaining cards not in any of the provided sets.
 */
export function remainingCards(...usedCardSets: CardIndex[][]): CardIndex[] {
  const used = new Set(usedCardSets.flat());
  return createDeck().filter((c) => !used.has(c));
}
