import { describe, it, expect } from "vitest";
import {
  evaluateHand,
  compareHandRanks,
} from "../../convex/lib/primitives/handEvaluator";
import { cardsFromStrings } from "../../convex/lib/primitives/card";

function evalCards(strs: string[]) {
  return evaluateHand(cardsFromStrings(strs));
}

describe("Hand evaluator — 5-card hands", () => {
  it("Royal Flush", () => {
    const result = evalCards(["As", "Ks", "Qs", "Js", "Ts"]);
    expect(result.rank.name).toBe("Royal Flush");
    expect(result.rank.tier).toBe(9);
    expect(result.explanation.summary).toContain("Royal Flush");
    expect(result.explanation.sentiment).toBe("positive");
  });

  it("Straight Flush", () => {
    const result = evalCards(["9h", "8h", "7h", "6h", "5h"]);
    expect(result.rank.name).toBe("Straight Flush");
    expect(result.rank.tier).toBe(8);
    expect(result.explanation.summary).toContain("Straight Flush");
  });

  it("Straight Flush — wheel (A2345 suited)", () => {
    const result = evalCards(["Ac", "2c", "3c", "4c", "5c"]);
    expect(result.rank.name).toBe("Straight Flush");
    expect(result.rank.tier).toBe(8);
    // 5-high straight flush
    expect(result.rank.tiebreakers[0]).toBe(3); // rank of 5 = 3
  });

  it("Four of a Kind", () => {
    const result = evalCards(["Kc", "Kd", "Kh", "Ks", "Ac"]);
    expect(result.rank.name).toBe("Four of a Kind");
    expect(result.rank.tier).toBe(7);
    expect(result.explanation.summary).toContain("King");
  });

  it("Full House", () => {
    const result = evalCards(["Jc", "Jd", "Jh", "9s", "9c"]);
    expect(result.rank.name).toBe("Full House");
    expect(result.rank.tier).toBe(6);
    expect(result.explanation.summary).toContain("Jack");
    expect(result.explanation.summary).toContain("Nine");
  });

  it("Flush", () => {
    const result = evalCards(["Ad", "Jd", "8d", "5d", "3d"]);
    expect(result.rank.name).toBe("Flush");
    expect(result.rank.tier).toBe(5);
    expect(result.explanation.summary).toContain("Ace");
  });

  it("Straight", () => {
    const result = evalCards(["Tc", "9d", "8h", "7s", "6c"]);
    expect(result.rank.name).toBe("Straight");
    expect(result.rank.tier).toBe(4);
  });

  it("Straight — wheel (A2345)", () => {
    const result = evalCards(["Ah", "2c", "3d", "4s", "5h"]);
    expect(result.rank.name).toBe("Straight");
    expect(result.rank.tier).toBe(4);
    expect(result.rank.tiebreakers[0]).toBe(3); // 5-high
  });

  it("Three of a Kind", () => {
    const result = evalCards(["7c", "7d", "7h", "Ks", "2c"]);
    expect(result.rank.name).toBe("Three of a Kind");
    expect(result.rank.tier).toBe(3);
    expect(result.explanation.summary).toContain("Seven");
  });

  it("Two Pair", () => {
    const result = evalCards(["Ac", "Ad", "Kh", "Ks", "Qc"]);
    expect(result.rank.name).toBe("Two Pair");
    expect(result.rank.tier).toBe(2);
    expect(result.explanation.summary).toContain("Ace");
    expect(result.explanation.summary).toContain("King");
  });

  it("One Pair", () => {
    const result = evalCards(["Tc", "Td", "Ah", "Ks", "8c"]);
    expect(result.rank.name).toBe("One Pair");
    expect(result.rank.tier).toBe(1);
    expect(result.explanation.summary).toContain("Ten");
  });

  it("High Card", () => {
    const result = evalCards(["Ac", "Jd", "8h", "5s", "3c"]);
    expect(result.rank.name).toBe("High Card");
    expect(result.rank.tier).toBe(0);
    expect(result.explanation.summary).toContain("Ace");
    expect(result.explanation.sentiment).toBe("negative");
  });
});

describe("Hand evaluator — 7-card hands (Texas Hold'em)", () => {
  it("finds best 5 from 7 cards", () => {
    // Hero: Ah Kh, Board: Qh Jh Th 2c 3d -> Royal Flush
    const result = evalCards(["Ah", "Kh", "Qh", "Jh", "Th", "2c", "3d"]);
    expect(result.rank.name).toBe("Royal Flush");
    expect(result.bestFive).toHaveLength(5);
  });

  it("picks the stronger hand from 7 cards", () => {
    // Hero: As Ks, Board: Ad Kd 3h 7c Tc -> Two Pair AA KK
    const result = evalCards(["As", "Ks", "Ad", "Kd", "3h", "7c", "Tc"]);
    expect(result.rank.name).toBe("Two Pair");
    // Should be aces and kings, not something weaker
    expect(result.rank.tiebreakers[0]).toBe(12); // Ace pair
    expect(result.rank.tiebreakers[1]).toBe(11); // King pair
  });

  it("finds full house over two pair in 7 cards", () => {
    // Cards: Js Jd Jh 9c 9d 2h 3s -> Full House JJJ 99
    const result = evalCards(["Js", "Jd", "Jh", "9c", "9d", "2h", "3s"]);
    expect(result.rank.name).toBe("Full House");
  });

  it("finds flush over straight in 7 cards", () => {
    // 5 hearts including a straight possibility
    const result = evalCards(["Ah", "Kh", "Qh", "Jd", "Th", "2h", "3c"]);
    expect(result.rank.name).toBe("Flush");
  });
});

describe("Hand comparison", () => {
  it("higher tier beats lower tier", () => {
    const flush = evalCards(["Ad", "Jd", "8d", "5d", "3d"]);
    const straight = evalCards(["Tc", "9d", "8h", "7s", "6c"]);
    expect(compareHandRanks(flush.rank, straight.rank)).toBeGreaterThan(0);
  });

  it("same tier uses tiebreakers", () => {
    const aceHigh = evalCards(["Ac", "Jd", "8h", "5s", "3c"]);
    const kingHigh = evalCards(["Kc", "Jd", "8h", "5s", "3c"]);
    expect(compareHandRanks(aceHigh.rank, kingHigh.rank)).toBeGreaterThan(0);
  });

  it("same hand ranks as tie", () => {
    const hand1 = evalCards(["Ac", "Kd", "Qh", "Js", "9c"]);
    const hand2 = evalCards(["Ad", "Kc", "Qs", "Jh", "9d"]);
    expect(compareHandRanks(hand1.rank, hand2.rank)).toBe(0);
  });

  it("higher pair beats lower pair", () => {
    const aces = evalCards(["Ac", "Ad", "Kh", "Qs", "Jc"]);
    const kings = evalCards(["Kc", "Kd", "Ah", "Qs", "Jc"]);
    expect(compareHandRanks(aces.rank, kings.rank)).toBeGreaterThan(0);
  });

  it("same pair, better kicker wins", () => {
    const aK = evalCards(["Ac", "Ad", "Kh", "3s", "2c"]);
    const aQ = evalCards(["As", "Ah", "Qh", "3s", "2c"]);
    expect(compareHandRanks(aK.rank, aQ.rank)).toBeGreaterThan(0);
  });

  it("higher two pair beats lower two pair", () => {
    const akTwoPair = evalCards(["Ac", "Ad", "Kh", "Ks", "2c"]);
    const aqTwoPair = evalCards(["As", "Ah", "Qh", "Qs", "2c"]);
    expect(compareHandRanks(akTwoPair.rank, aqTwoPair.rank)).toBeGreaterThan(0);
  });
});

describe("Explanation trees", () => {
  it("all evaluations have summary and tags", () => {
    const hands = [
      ["As", "Ks", "Qs", "Js", "Ts"],       // Royal
      ["9h", "8h", "7h", "6h", "5h"],         // SF
      ["Kc", "Kd", "Kh", "Ks", "Ac"],         // Quads
      ["Jc", "Jd", "Jh", "9s", "9c"],         // FH
      ["Ad", "Jd", "8d", "5d", "3d"],          // Flush
      ["Tc", "9d", "8h", "7s", "6c"],          // Straight
      ["7c", "7d", "7h", "Ks", "2c"],          // Trips
      ["Ac", "Ad", "Kh", "Ks", "Qc"],          // Two pair
      ["Tc", "Td", "Ah", "Ks", "8c"],          // Pair
      ["Ac", "Jd", "8h", "5s", "3c"],          // High card
    ];

    for (const hand of hands) {
      const result = evalCards(hand);
      expect(result.explanation.summary).toBeTruthy();
      expect(result.explanation.tags).toContain("hand-rank");
      expect(result.explanation.detail).toBeTruthy();
    }
  });

  it("bestFive always has exactly 5 cards", () => {
    // Test with 5, 6, and 7 cards
    const five = evalCards(["As", "Ks", "Qs", "Js", "Ts"]);
    expect(five.bestFive).toHaveLength(5);

    const six = evalCards(["As", "Ks", "Qs", "Js", "Ts", "2c"]);
    expect(six.bestFive).toHaveLength(5);

    const seven = evalCards(["As", "Ks", "Qs", "Js", "Ts", "2c", "3d"]);
    expect(seven.bestFive).toHaveLength(5);
  });
});
