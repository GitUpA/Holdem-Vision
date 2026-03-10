import { describe, it, expect } from "vitest";
import {
  shuffle,
  seededRandom,
  createShuffledDeck,
  deal,
  remainingCards,
} from "../../convex/lib/primitives/deck";
import { createDeck, cardFromString } from "../../convex/lib/primitives/card";

describe("Deck operations", () => {
  it("shuffle preserves all cards", () => {
    const deck = createDeck();
    shuffle(deck);
    expect(deck).toHaveLength(52);
    expect(new Set(deck).size).toBe(52);
  });

  it("seededRandom produces deterministic results", () => {
    const rng1 = seededRandom(42);
    const rng2 = seededRandom(42);
    const vals1 = Array.from({ length: 10 }, rng1);
    const vals2 = Array.from({ length: 10 }, rng2);
    expect(vals1).toEqual(vals2);
  });

  it("seededRandom produces values in [0, 1)", () => {
    const rng = seededRandom(123);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("seeded shuffle is deterministic", () => {
    const d1 = shuffle([...createDeck()], seededRandom(99));
    const d2 = shuffle([...createDeck()], seededRandom(99));
    expect(d1).toEqual(d2);
  });

  it("different seeds produce different orders", () => {
    const d1 = shuffle([...createDeck()], seededRandom(1));
    const d2 = shuffle([...createDeck()], seededRandom(2));
    expect(d1).not.toEqual(d2);
  });

  it("createShuffledDeck excludes specified cards", () => {
    const excluded = [cardFromString("Ah"), cardFromString("Ks")];
    const deck = createShuffledDeck(excluded, seededRandom(42));
    expect(deck).toHaveLength(50);
    expect(deck).not.toContain(excluded[0]);
    expect(deck).not.toContain(excluded[1]);
  });

  it("deal removes cards from deck and returns them", () => {
    const deck = [...createDeck()];
    const dealt = deal(deck, 5);
    expect(dealt).toHaveLength(5);
    expect(deck).toHaveLength(47);
    // Dealt cards should not be in the remaining deck
    for (const card of dealt) {
      expect(deck).not.toContain(card);
    }
  });

  it("deal throws when deck is too small", () => {
    const deck = [0, 1, 2];
    expect(() => deal(deck, 5)).toThrow("Cannot deal 5 cards from deck of 3");
  });

  it("remainingCards returns cards not in any set", () => {
    const hero = [cardFromString("Ah"), cardFromString("Ks")];
    const community = [cardFromString("Tc"), cardFromString("9d"), cardFromString("8h")];
    const remaining = remainingCards(hero, community);
    expect(remaining).toHaveLength(47);
    for (const c of [...hero, ...community]) {
      expect(remaining).not.toContain(c);
    }
  });
});
