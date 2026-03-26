import { describe, it, expect } from "vitest";
import {
  scoreAction,
  normalizeToGtoAction,
} from "../../convex/lib/gto/evScoring";
import type { ArchetypeClassification, ArchetypeId } from "../../convex/lib/gto/archetypeClassifier";
import type { HandCategorization } from "../../convex/lib/gto/handCategorizer";
// Ensure preflop tables are registered
import "../../convex/lib/gto/tables";

// ─── Fixtures ───

const RFI_ARCHETYPE: ArchetypeClassification = {
  archetypeId: "rfi_opening",
  category: "preflop",
  confidence: 0.95,
  description: "Raise First In — opening the pot",
};

const PREMIUM_HAND: HandCategorization = {
  category: "premium_pair",
  description: "Premium pair (AA/KK/QQ)",
  relativeStrength: 0.95,
};

const AIR_HAND: HandCategorization = {
  category: "air",
  description: "Air — no pair, no draw",
  relativeStrength: 0.05,
};

const TPTK_HAND: HandCategorization = {
  category: "top_pair_top_kicker",
  description: "Top pair top kicker",
  relativeStrength: 0.75,
};

// ═══════════════════════════════════════════════════════
// scoreAction()
// ═══════════════════════════════════════════════════════

describe("scoreAction", () => {
  it("returns null when no frequency table exists", () => {
    const bogusArchetype: ArchetypeClassification = {
      archetypeId: "nonexistent" as ArchetypeId,
      category: "preflop",
      confidence: 0.9,
      description: "Does not exist",
    };
    const result = scoreAction(bogusArchetype, PREMIUM_HAND, "raise_small", 100, true);
    expect(result).toBeNull();
  });

  it("scores bet_medium with premium pair in RFI as optimal", () => {
    // RFI preflop tables use bet_medium for opening raises
    const result = scoreAction(RFI_ARCHETYPE, PREMIUM_HAND, "bet_medium", 100, true, "preflop");
    expect(result).not.toBeNull();
    expect(result!.verdict).toBe("optimal");
    expect(result!.userActionFrequency).toBeGreaterThan(0.3);
  });

  it("scores a fold with premium pair in RFI as blunder", () => {
    const result = scoreAction(RFI_ARCHETYPE, PREMIUM_HAND, "fold", 100, true, "preflop");
    expect(result).not.toBeNull();
    expect(result!.verdict).toBe("blunder");
    expect(result!.userActionFrequency).toBeLessThan(0.05);
  });

  it("calculates positive EV loss for suboptimal plays", () => {
    const result = scoreAction(RFI_ARCHETYPE, PREMIUM_HAND, "fold", 100, true, "preflop");
    expect(result).not.toBeNull();
    expect(result!.evLoss).toBeGreaterThan(0);
  });

  it("calculates zero EV loss for optimal plays", () => {
    // bet_medium is 100% frequency for premium pairs in RFI IP
    const result = scoreAction(RFI_ARCHETYPE, PREMIUM_HAND, "bet_medium", 100, true, "preflop");
    expect(result).not.toBeNull();
    expect(result!.evLoss).toBe(0);
  });

  it("identifies the optimal action", () => {
    const result = scoreAction(RFI_ARCHETYPE, PREMIUM_HAND, "fold", 100, true, "preflop");
    expect(result).not.toBeNull();
    // RFI preflop uses bet_medium for opens
    expect(result!.optimalAction).toBe("bet_medium");
    expect(result!.optimalFrequency).toBe(1.0);
  });

  it("includes all frequencies in result", () => {
    // Use a hand category that has multiple actions (middle_pair has bet_medium + fold)
    const middlePair: HandCategorization = {
      category: "middle_pair",
      description: "Middle pair",
      relativeStrength: 0.4,
    };
    const result = scoreAction(RFI_ARCHETYPE, middlePair, "bet_medium", 100, true, "preflop");
    expect(result).not.toBeNull();
    expect(result!.allFrequencies).toBeDefined();
    expect(Object.keys(result!.allFrequencies).length).toBeGreaterThanOrEqual(2);
  });

  it("scales EV loss with pot size", () => {
    const small = scoreAction(RFI_ARCHETYPE, PREMIUM_HAND, "fold", 50, true, "preflop");
    const large = scoreAction(RFI_ARCHETYPE, PREMIUM_HAND, "fold", 200, true, "preflop");
    expect(small).not.toBeNull();
    expect(large).not.toBeNull();
    expect(large!.evLoss).toBeGreaterThan(small!.evLoss);
  });

  it("returns explanation with children", () => {
    const result = scoreAction(RFI_ARCHETYPE, PREMIUM_HAND, "raise_small", 100, true, "preflop");
    expect(result).not.toBeNull();
    expect(result!.explanation.children).toBeDefined();
    expect(result!.explanation.children!.length).toBeGreaterThan(0);
  });

  it("explanation contains verdict in summary", () => {
    const result = scoreAction(RFI_ARCHETYPE, PREMIUM_HAND, "fold", 100, true, "preflop");
    expect(result).not.toBeNull();
    expect(result!.explanation.summary).toContain("BLUNDER");
  });
});

// ═══════════════════════════════════════════════════════
// Verdict thresholds
// ═══════════════════════════════════════════════════════

describe("verdict thresholds", () => {
  it("scores air folding in RFI as optimal (GTO folds air)", () => {
    const result = scoreAction(RFI_ARCHETYPE, AIR_HAND, "fold", 100, true, "preflop");
    expect(result).not.toBeNull();
    // Air should fold most of the time in RFI
    expect(["optimal", "acceptable"]).toContain(result!.verdict);
  });
});

// ═══════════════════════════════════════════════════════
// normalizeToGtoAction()
// ═══════════════════════════════════════════════════════

describe("normalizeToGtoAction", () => {
  it("maps fold/check/call directly", () => {
    expect(normalizeToGtoAction("fold", undefined, 100)).toBe("fold");
    expect(normalizeToGtoAction("check", undefined, 100)).toBe("check");
    expect(normalizeToGtoAction("call", undefined, 100)).toBe("call");
  });

  it("maps small bet (<=45% pot) to bet_small", () => {
    expect(normalizeToGtoAction("bet", 30, 100)).toBe("bet_small");
    expect(normalizeToGtoAction("bet", 45, 100)).toBe("bet_small");
  });

  it("maps medium bet (46-90% pot) to bet_medium", () => {
    expect(normalizeToGtoAction("bet", 50, 100)).toBe("bet_medium");
    expect(normalizeToGtoAction("bet", 75, 100)).toBe("bet_medium");
    expect(normalizeToGtoAction("bet", 90, 100)).toBe("bet_medium");
  });

  it("maps large bet (>90% pot) to bet_large", () => {
    expect(normalizeToGtoAction("bet", 100, 100)).toBe("bet_large");
    expect(normalizeToGtoAction("bet", 150, 100)).toBe("bet_large");
  });

  it("maps raise to raise_small or raise_large", () => {
    expect(normalizeToGtoAction("raise", 30, 100)).toBe("raise_small");
    expect(normalizeToGtoAction("raise", 75, 100)).toBe("raise_large");
    expect(normalizeToGtoAction("raise", 120, 100)).toBe("raise_large");
  });

  it("maps all_in to raise_large", () => {
    expect(normalizeToGtoAction("all_in", undefined, 100)).toBe("raise_large");
  });

  it("defaults to bet_medium when amount is undefined for bet/raise", () => {
    expect(normalizeToGtoAction("bet", undefined, 100)).toBe("bet_medium");
  });

  it("defaults to check for unknown actions", () => {
    expect(normalizeToGtoAction("unknown", undefined, 100)).toBe("check");
  });
});

// ═══════════════════════════════════════════════════════
// Position sensitivity
// ═══════════════════════════════════════════════════════

describe("position sensitivity", () => {
  it("may produce different scores IP vs OOP for same action", () => {
    const ipResult = scoreAction(RFI_ARCHETYPE, TPTK_HAND, "raise_small", 100, true, "preflop");
    const oopResult = scoreAction(RFI_ARCHETYPE, TPTK_HAND, "raise_small", 100, false, "preflop");

    // Both should return results (preflop tables have both IP/OOP)
    expect(ipResult).not.toBeNull();
    expect(oopResult).not.toBeNull();

    // Frequencies may differ between positions
    // Just verify both return valid scores
    expect(ipResult!.verdict).toBeDefined();
    expect(oopResult!.verdict).toBeDefined();
  });
});
