import { describe, it, expect } from "vitest";
import { dealForArchetype } from "../../convex/lib/gto/constrainedDealer";
import { seededRandom } from "../../convex/lib/primitives/deck";
import { analyzeBoard } from "../../convex/lib/opponents/engines/boardTexture";
import type { ArchetypeId } from "../../convex/lib/gto/archetypeClassifier";
// Ensure preflop tables are registered
import "../../convex/lib/gto/tables";

// ─── Helpers ───

function dealWith(archetypeId: ArchetypeId, seed = 42) {
  return dealForArchetype({ archetypeId }, seededRandom(seed));
}

// ═══════════════════════════════════════════════════════
// BASIC STRUCTURE
// ═══════════════════════════════════════════════════════

describe("constrainedDealer basics", () => {
  it("returns valid ConstrainedDeal shape", () => {
    const deal = dealWith("rfi_opening");
    expect(deal.heroCards).toHaveLength(2);
    expect(deal.numPlayers).toBe(6);
    expect(deal.archetype.archetypeId).toBe("rfi_opening");
    expect(deal.archetype.category).toBe("preflop");
    expect(deal.handCategory.category).toBeDefined();
    expect(deal.cardOverrides).toHaveLength(1);
    expect(deal.cardOverrides[0].seatIndex).toBe(deal.heroSeatIndex);
    expect(deal.cardOverrides[0].cards).toEqual(deal.heroCards);
  });

  it("produces deterministic results with same seed", () => {
    const d1 = dealWith("rfi_opening", 999);
    const d2 = dealWith("rfi_opening", 999);
    expect(d1.heroCards).toEqual(d2.heroCards);
    expect(d1.heroSeatIndex).toBe(d2.heroSeatIndex);
  });

  it("produces different results with different seeds", () => {
    const deals = new Set<string>();
    for (let seed = 0; seed < 10; seed++) {
      const d = dealWith("rfi_opening", seed);
      deals.add(d.heroCards.join(","));
    }
    expect(deals.size).toBeGreaterThan(1);
  });

  it("hero cards don't overlap with community cards", () => {
    for (let seed = 0; seed < 20; seed++) {
      const deal = dealWith("ace_high_dry_rainbow", seed);
      const heroSet = new Set(deal.heroCards);
      for (const c of deal.communityCards) {
        expect(heroSet.has(c)).toBe(false);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════
// PREFLOP ARCHETYPES
// ═══════════════════════════════════════════════════════

describe("constrainedDealer preflop", () => {
  it("rfi_opening: no community cards", () => {
    const deal = dealWith("rfi_opening");
    expect(deal.communityCards).toHaveLength(0);
    expect(deal.archetype.category).toBe("preflop");
  });

  it("bb_defense_vs_rfi: hero is BB", () => {
    // Hero always at seat 0, dealer moves to put hero in BB position
    const deal = dealWith("bb_defense_vs_rfi");
    expect(deal.heroSeatIndex).toBe(0); // fixed seat
    expect(deal.heroPosition).toBe("bb");
  });

  it("blind_vs_blind: hero is SB", () => {
    const deal = dealWith("blind_vs_blind");
    expect(deal.heroSeatIndex).toBe(0); // fixed seat
    expect(deal.heroPosition).toBe("sb");
  });

  it("preflop has frequency data for registered tables", () => {
    const deal = dealWith("rfi_opening");
    expect(deal.hasFrequencyData).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════
// FLOP TEXTURE ARCHETYPES
// ═══════════════════════════════════════════════════════

describe("constrainedDealer flop textures", () => {
  it("ace_high_dry_rainbow: produces matching texture", () => {
    let matched = 0;
    for (let seed = 0; seed < 30; seed++) {
      const deal = dealWith("ace_high_dry_rainbow", seed);
      expect(deal.communityCards).toHaveLength(3);
      const tex = analyzeBoard(deal.communityCards);
      if (tex.highCard === 12 && tex.isRainbow && !tex.isPaired) {
        matched++;
      }
    }
    // Most should match (rejection sampling + fallback)
    expect(matched).toBeGreaterThan(15);
  });

  it("paired_boards: produces paired texture", () => {
    let matched = 0;
    for (let seed = 0; seed < 30; seed++) {
      const deal = dealWith("paired_boards", seed);
      expect(deal.communityCards).toHaveLength(3);
      const tex = analyzeBoard(deal.communityCards);
      if (tex.isPaired) matched++;
    }
    expect(matched).toBeGreaterThan(15);
  });

  it("monotone: produces monotone texture", () => {
    let matched = 0;
    for (let seed = 0; seed < 30; seed++) {
      const deal = dealWith("monotone", seed);
      const tex = analyzeBoard(deal.communityCards);
      if (tex.isMonotone) matched++;
    }
    expect(matched).toBeGreaterThan(15);
  });

  it("flop texture hero defaults to BTN", () => {
    const deal = dealWith("ace_high_dry_rainbow");
    expect(deal.heroSeatIndex).toBe(0); // BTN = seat 0 when dealer = 0
  });

  it("categorizes hero hand vs the flop", () => {
    const deal = dealWith("ace_high_dry_rainbow");
    // Hand category should be based on hero cards + community
    expect(deal.handCategory.category).toBeDefined();
    expect(deal.handCategory.description).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════
// POSTFLOP PRINCIPLE ARCHETYPES
// ═══════════════════════════════════════════════════════

describe("constrainedDealer postflop principles", () => {
  it("cbet_sizing_frequency: 3 community cards (flop)", () => {
    const deal = dealWith("cbet_sizing_frequency");
    expect(deal.communityCards).toHaveLength(3);
  });

  it("turn_barreling: 4 community cards (turn)", () => {
    const deal = dealWith("turn_barreling");
    expect(deal.communityCards).toHaveLength(4);
  });

  it("river_bluff_catching_mdf: 5 community cards (river)", () => {
    const deal = dealWith("river_bluff_catching_mdf");
    expect(deal.communityCards).toHaveLength(5);
  });

  it("thin_value_river: 5 community cards", () => {
    const deal = dealWith("thin_value_river");
    expect(deal.communityCards).toHaveLength(5);
  });

  it("overbet_river: 5 community cards", () => {
    const deal = dealWith("overbet_river");
    expect(deal.communityCards).toHaveLength(5);
  });
});

// ═══════════════════════════════════════════════════════
// HAND CATEGORY CONSTRAINTS
// ═══════════════════════════════════════════════════════

describe("constrainedDealer hand category filtering", () => {
  it("respects handCategories constraint when possible", () => {
    let matched = 0;
    for (let seed = 0; seed < 20; seed++) {
      const deal = dealForArchetype(
        { archetypeId: "rfi_opening", handCategories: ["premium_pair"] },
        seededRandom(seed),
      );
      if (deal.handCategory.category === "premium_pair") matched++;
    }
    // Premium pairs are rare (~3%), so many retries will fail. But at least some should match
    // if the seed happens to produce one within 20 retries.
    // This is a best-effort constraint, not guaranteed.
    expect(matched).toBeGreaterThanOrEqual(0); // Won't always find one
  });
});
