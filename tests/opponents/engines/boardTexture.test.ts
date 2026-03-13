import { describe, it, expect } from "vitest";
import { analyzeBoard } from "../../../convex/lib/opponents/engines/boardTexture";
import { cardsFromStrings } from "../../../convex/lib/primitives/card";

describe("analyzeBoard", () => {
  it("returns neutral texture for empty board (preflop)", () => {
    const t = analyzeBoard([]);
    expect(t.cardCount).toBe(0);
    expect(t.wetness).toBe(0.5);
    expect(t.description).toContain("Preflop");
  });

  it("identifies a dry rainbow flop", () => {
    // A♠ 8♥ 3♣ — all different suits, no connections (A-8 gap=4, 8-3 gap=5; no wheel)
    const cards = cardsFromStrings(["As", "8h", "3c"]);
    const t = analyzeBoard(cards);
    expect(t.isRainbow).toBe(true);
    expect(t.isTwoTone).toBe(false);
    expect(t.isMonotone).toBe(false);
    expect(t.hasConnectors).toBe(false);
    expect(t.wetness).toBeLessThan(0.3);
    expect(t.highCard).toBe(12); // Ace
    expect(t.description).toContain("dry");
  });

  it("identifies a wet two-tone connected flop", () => {
    // Q♠ J♠ T♥ — two spades, connected
    const cards = cardsFromStrings(["Qs", "Js", "Th"]);
    const t = analyzeBoard(cards);
    expect(t.isTwoTone).toBe(true);
    expect(t.hasConnectors).toBe(true);
    expect(t.wetness).toBeGreaterThan(0.4);
  });

  it("identifies a monotone flop", () => {
    // 9♦ 6♦ 3♦ — all diamonds
    const cards = cardsFromStrings(["9d", "6d", "3d"]);
    const t = analyzeBoard(cards);
    expect(t.isMonotone).toBe(true);
    expect(t.flushPossible).toBe(true);
    expect(t.isRainbow).toBe(false);
    expect(t.wetness).toBeGreaterThan(0.3);
  });

  it("identifies a paired board", () => {
    // K♠ K♥ 5♣
    const cards = cardsFromStrings(["Ks", "Kh", "5c"]);
    const t = analyzeBoard(cards);
    expect(t.isPaired).toBe(true);
    expect(t.isTrips).toBe(false);
  });

  it("identifies trips on board", () => {
    // 8♠ 8♥ 8♦
    const cards = cardsFromStrings(["8s", "8h", "8d"]);
    const t = analyzeBoard(cards);
    expect(t.isPaired).toBe(true);
    expect(t.isTrips).toBe(true);
  });

  it("handles turn (4 cards)", () => {
    // K♠ J♥ 9♣ 7♦ — all gap-2 pairs, no gap-1 connectors
    const cards = cardsFromStrings(["Ks", "Jh", "9c", "7d"]);
    const t = analyzeBoard(cards);
    expect(t.cardCount).toBe(4);
    expect(t.isRainbow).toBe(true);
    // Gap-2 cards are "small gaps" but not strict connectors (gap <= 1)
    // This board is straight-heavy because there are 3 small-gap pairs
    expect(t.straightHeavy).toBe(true);
  });

  it("handles river (5 cards)", () => {
    const cards = cardsFromStrings(["As", "Kh", "Qd", "Jc", "Ts"]);
    const t = analyzeBoard(cards);
    expect(t.cardCount).toBe(5);
    expect(t.hasConnectors).toBe(true);
    expect(t.straightHeavy).toBe(true);
  });

  it("detects wheel connectivity (A-2)", () => {
    // A♠ 2♥ 5♦
    const cards = cardsFromStrings(["As", "2h", "5d"]);
    const t = analyzeBoard(cards);
    expect(t.hasConnectors).toBe(true); // A wraps to 2
  });

  it("wetness score is between 0 and 1", () => {
    // Test with various boards
    const boards = [
      cardsFromStrings(["As", "8h", "2d"]),        // dry
      cardsFromStrings(["Qh", "Jh", "Td"]),        // wet
      cardsFromStrings(["5s", "5h", "5d"]),         // trips
      cardsFromStrings(["9s", "8s", "7s"]),         // monotone connected
    ];
    for (const board of boards) {
      const t = analyzeBoard(board);
      expect(t.wetness).toBeGreaterThanOrEqual(0);
      expect(t.wetness).toBeLessThanOrEqual(1);
    }
  });
});
