import { describe, it, expect } from "vitest";
import {
  rankOf,
  suitOf,
  rankValue,
  suitValue,
  cardToString,
  cardToDisplay,
  cardFromString,
  cardsFromStrings,
  createDeck,
  sameSuit,
  sameRank,
} from "../../convex/lib/primitives/card";

describe("Card encoding", () => {
  it("encodes 2c as index 0", () => {
    expect(cardToString(0)).toBe("2c");
  });

  it("encodes As as index 51", () => {
    expect(cardToString(51)).toBe("As");
  });

  it("round-trips all 52 cards", () => {
    for (let i = 0; i < 52; i++) {
      expect(cardFromString(cardToString(i))).toBe(i);
    }
  });

  it("rankOf returns correct rank", () => {
    expect(rankOf(0)).toBe("2");
    expect(rankOf(48)).toBe("A");
    expect(rankOf(20)).toBe("7");
  });

  it("suitOf returns correct suit", () => {
    expect(suitOf(0)).toBe("c");
    expect(suitOf(1)).toBe("d");
    expect(suitOf(2)).toBe("h");
    expect(suitOf(3)).toBe("s");
  });

  it("rankValue returns numeric rank", () => {
    expect(rankValue(cardFromString("2c"))).toBe(0);
    expect(rankValue(cardFromString("Ah"))).toBe(12);
    expect(rankValue(cardFromString("Ts"))).toBe(8);
  });

  it("suitValue returns numeric suit", () => {
    expect(suitValue(cardFromString("Ac"))).toBe(0);
    expect(suitValue(cardFromString("Ad"))).toBe(1);
    expect(suitValue(cardFromString("Ah"))).toBe(2);
    expect(suitValue(cardFromString("As"))).toBe(3);
  });

  it("cardToDisplay uses Unicode suit symbols", () => {
    expect(cardToDisplay(cardFromString("Ah"))).toBe("A\u2665");
    expect(cardToDisplay(cardFromString("Ks"))).toBe("K\u2660");
  });

  it("cardsFromStrings converts array", () => {
    const cards = cardsFromStrings(["Ah", "Ks"]);
    expect(cards).toEqual([cardFromString("Ah"), cardFromString("Ks")]);
  });

  it("createDeck has 52 unique cards", () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck).size).toBe(52);
  });

  it("sameSuit detects matching suits", () => {
    expect(sameSuit(cardFromString("Ah"), cardFromString("Kh"))).toBe(true);
    expect(sameSuit(cardFromString("Ah"), cardFromString("Ks"))).toBe(false);
  });

  it("sameRank detects matching ranks", () => {
    expect(sameRank(cardFromString("Ah"), cardFromString("As"))).toBe(true);
    expect(sameRank(cardFromString("Ah"), cardFromString("Kh"))).toBe(false);
  });

  it("throws on invalid card string", () => {
    expect(() => cardFromString("Xx")).toThrow("Invalid card");
    expect(() => cardFromString("1c")).toThrow("Invalid card");
  });
});
