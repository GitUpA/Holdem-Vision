/**
 * Flush detection regression test — monotone board.
 * Verifies that evaluateHand correctly detects flushes when
 * all 5 cards are the same suit.
 */
import { describe, it, expect } from "vitest";
import { evaluateHand } from "../../convex/lib/primitives/handEvaluator";
import { categorizeHand } from "../../convex/lib/gto/handCategorizer";
import { cardFromString, suitValue, cardToDisplay } from "../../convex/lib/primitives/card";
import { dealForArchetype } from "../../convex/lib/gto/constrainedDealer";
import { analyzeBoard } from "../../convex/lib/opponents/engines/boardTexture";
import type { ArchetypeId } from "../../convex/lib/gto/archetypeClassifier";

// Ensure solver tables are loaded
import "../../convex/lib/gto/tables/solverData";

describe("Flush detection on monotone boards", () => {
  it("evaluateHand detects flush with 5 clubs (card indices)", () => {
    // A♣=48, 5♣=12, 9♣=28, T♣=32, K♣=44
    const cards = [48, 12, 28, 32, 44];
    // Verify they're all clubs
    for (const c of cards) {
      expect(suitValue(c)).toBe(0); // 0 = clubs
    }
    const result = evaluateHand(cards);
    expect(result.rank.name).toBe("Flush");
    expect(result.rank.tier).toBe(5);
  });

  it("evaluateHand detects flush with 5 hearts (card indices)", () => {
    // A♥=50, K♥=46, Q♥=42, J♥=38, 9♥=30
    const cards = [50, 46, 42, 38, 30];
    for (const c of cards) {
      expect(suitValue(c)).toBe(2); // 2 = hearts
    }
    const result = evaluateHand(cards);
    expect(result.rank.name).toBe("Flush");
    expect(result.rank.tier).toBe(5);
  });

  it("evaluateHand detects flush with cardFromString", () => {
    const cards = [
      cardFromString("Ac"),
      cardFromString("5c"),
      cardFromString("9c"),
      cardFromString("Tc"),
      cardFromString("Kc"),
    ];
    for (const c of cards) {
      expect(suitValue(c)).toBe(0);
    }
    const result = evaluateHand(cards);
    expect(result.rank.name).toBe("Flush");
    expect(result.rank.tier).toBe(5);
  });

  it("categorizeHand detects flush on monotone board (hero matching suit)", () => {
    const heroCards = [cardFromString("Ac"), cardFromString("5c")];
    const communityCards = [
      cardFromString("9c"),
      cardFromString("Tc"),
      cardFromString("Kc"),
    ];
    const result = categorizeHand(heroCards, communityCards);
    // A flush should be categorized as sets_plus (tier 5)
    expect(result.category).not.toBe("air");
    expect(result.category).toBe("sets_plus");
  });

  it("categorizeHand correctly handles hero NOT matching monotone suit", () => {
    const heroCards = [cardFromString("Ad"), cardFromString("5h")];
    const communityCards = [
      cardFromString("9c"),
      cardFromString("Tc"),
      cardFromString("Kc"),
    ];
    const result = categorizeHand(heroCards, communityCards);
    // Hero doesn't have clubs — no flush, should be overcards or top_pair type
    expect(result.category).not.toBe("sets_plus");
  });

  it("constrained dealer monotone flop cards are all same suit", () => {
    // Deterministic RNG
    let seed = 42;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    for (let i = 0; i < 20; i++) {
      const deal = dealForArchetype({ archetypeId: "monotone" as ArchetypeId }, rng);

      // Verify community cards are all same suit
      expect(deal.communityCards.length).toBe(3);
      const suit0 = suitValue(deal.communityCards[0]);
      for (const c of deal.communityCards) {
        expect(suitValue(c)).toBe(suit0);
      }

      // Verify board texture says monotone
      const tex = analyzeBoard(deal.communityCards);
      expect(tex.isMonotone).toBe(true);

      // Log hero cards for debugging
      const heroSuit0 = suitValue(deal.heroCards[0]);
      const heroSuit1 = suitValue(deal.heroCards[1]);
      const heroMatchesSuit = heroSuit0 === suit0 && heroSuit1 === suit0;

      // If hero matches suit AND all 5 cards are same suit, it should be a flush
      if (heroMatchesSuit) {
        const allCards = [...deal.heroCards, ...deal.communityCards];
        const evalResult = evaluateHand(allCards);
        expect(evalResult.rank.tier).toBeGreaterThanOrEqual(5); // flush or better

        // And hand category should reflect this
        expect(deal.handCategory.category).toBe("sets_plus");
      }

      // If hero has one matching suit card (3 hero+community of same suit),
      // verify evaluateHand still works correctly
      const allCards = [...deal.heroCards, ...deal.communityCards];
      const evalResult = evaluateHand(allCards);
      
      // Log info for debugging
      const heroDisp = deal.heroCards.map(c => cardToDisplay(c)).join(" ");
      const commDisp = deal.communityCards.map(c => cardToDisplay(c)).join(" ");
      const catDisplay = `${deal.handCategory.category} (${deal.handCategory.subCategory ?? "none"})`;
      console.log(
        `Deal ${i}: Hero=${heroDisp} Board=${commDisp} | Eval=${evalResult.rank.name} tier=${evalResult.rank.tier} | Cat=${catDisplay}`
      );
    }
  });

  it("flush detection with 7 cards (2 hero + 5 community)", () => {
    // Test with 7 cards where flush exists in a 5-card subset
    const heroCards = [cardFromString("Ac"), cardFromString("2d")];
    const communityCards = [
      cardFromString("9c"),
      cardFromString("Tc"),
      cardFromString("Kc"),
      cardFromString("3c"), // turn card
      cardFromString("7h"), // river card
    ];
    // 4 clubs (Ac, 9c, Tc, Kc, 3c) = 5 clubs among 7 cards
    const allCards = [...heroCards, ...communityCards];
    const result = evaluateHand(allCards);
    expect(result.rank.name).toBe("Flush");
    expect(result.rank.tier).toBe(5);
  });
});
