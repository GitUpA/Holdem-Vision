import { describe, it, expect } from "vitest";
import { explainArchetype } from "../../convex/lib/gto/archetypeExplainer";
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

const BB_DEF_ARCHETYPE: ArchetypeClassification = {
  archetypeId: "bb_defense_vs_rfi",
  category: "preflop",
  confidence: 0.9,
  description: "Big Blind defense vs open raise",
};

const BOGUS_ARCHETYPE: ArchetypeClassification = {
  archetypeId: "nonexistent" as ArchetypeId,
  category: "preflop",
  confidence: 0.9,
  description: "No table",
};

const PREMIUM: HandCategorization = {
  category: "premium_pair",
  description: "Premium pair (AA/KK/QQ)",
  relativeStrength: 0.95,
};

const AIR: HandCategorization = {
  category: "air",
  description: "Air — no pair, no draw",
  relativeStrength: 0.05,
};

const MIDDLE: HandCategorization = {
  category: "middle_pair",
  description: "Middle pair",
  relativeStrength: 0.4,
};

// ═══════════════════════════════════════════════════════
// BASIC STRUCTURE
// ═══════════════════════════════════════════════════════

describe("explainArchetype — structure", () => {
  it("returns ExplanationNode with summary and children", () => {
    const result = explainArchetype(RFI_ARCHETYPE, PREMIUM, true);
    expect(result.summary).toBeTruthy();
    expect(result.children).toBeDefined();
    expect(result.children!.length).toBeGreaterThan(0);
    expect(result.tags).toContain("archetype-explanation");
  });

  it("includes hand category in children", () => {
    const result = explainArchetype(RFI_ARCHETYPE, PREMIUM, true);
    const handNode = result.children!.find((c) => c.tags?.includes("hand-category"));
    expect(handNode).toBeDefined();
    expect(handNode!.summary).toContain("premium_pair");
  });

  it("includes position in children", () => {
    const result = explainArchetype(RFI_ARCHETYPE, PREMIUM, true);
    const posNode = result.children!.find((c) => c.tags?.includes("position"));
    expect(posNode).toBeDefined();
    expect(posNode!.summary).toContain("In Position");
  });

  it("shows OOP when out of position", () => {
    const result = explainArchetype(RFI_ARCHETYPE, PREMIUM, false);
    const posNode = result.children!.find((c) => c.tags?.includes("position"));
    expect(posNode).toBeDefined();
    expect(posNode!.summary).toContain("Out of Position");
  });

  it("includes GTO frequencies node", () => {
    const result = explainArchetype(RFI_ARCHETYPE, PREMIUM, true);
    const freqNode = result.children!.find((c) => c.tags?.includes("frequencies"));
    expect(freqNode).toBeDefined();
    expect(freqNode!.children).toBeDefined();
    expect(freqNode!.children!.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════
// SENTIMENT
// ═══════════════════════════════════════════════════════

describe("explainArchetype — sentiment", () => {
  it("positive sentiment for strong hands", () => {
    const result = explainArchetype(RFI_ARCHETYPE, PREMIUM, true);
    expect(result.sentiment).toBe("positive");
  });

  it("negative sentiment for weak hands", () => {
    const result = explainArchetype(RFI_ARCHETYPE, AIR, true);
    expect(result.sentiment).toBe("negative");
  });

  it("neutral sentiment for middle strength", () => {
    const result = explainArchetype(RFI_ARCHETYPE, MIDDLE, true);
    expect(result.sentiment).toBe("neutral");
  });
});

// ═══════════════════════════════════════════════════════
// USER ACTION COMPARISON
// ═══════════════════════════════════════════════════════

describe("explainArchetype — user action", () => {
  it("includes user action node when provided", () => {
    // RFI preflop uses bet_medium for opening raises
    const result = explainArchetype(RFI_ARCHETYPE, PREMIUM, true, "bet_medium");
    const actionNode = result.children!.find((c) => c.tags?.includes("user-action"));
    expect(actionNode).toBeDefined();
    expect(actionNode!.summary).toContain("bet_medium");
  });

  it("labels optimal action as positive", () => {
    const result = explainArchetype(RFI_ARCHETYPE, PREMIUM, true, "bet_medium");
    const actionNode = result.children!.find((c) => c.tags?.includes("user-action"));
    expect(actionNode).toBeDefined();
    // Premium pair bet_medium in RFI is 100% frequency → optimal
    expect(actionNode!.sentiment).toBe("positive");
  });

  it("labels blunder action as negative", () => {
    const result = explainArchetype(RFI_ARCHETYPE, PREMIUM, true, "fold");
    const actionNode = result.children!.find((c) => c.tags?.includes("user-action"));
    expect(actionNode).toBeDefined();
    expect(actionNode!.sentiment).toBe("negative");
    expect(actionNode!.tags).toContain("blunder");
  });

  it("omits user action node when not provided", () => {
    const result = explainArchetype(RFI_ARCHETYPE, PREMIUM, true);
    const actionNode = result.children!.find((c) => c.tags?.includes("user-action"));
    expect(actionNode).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════
// TEACHING CONTENT
// ═══════════════════════════════════════════════════════

describe("explainArchetype — teaching content", () => {
  it("includes key principle when table exists", () => {
    const result = explainArchetype(RFI_ARCHETYPE, PREMIUM, true);
    const principleNode = result.children!.find((c) => c.tags?.includes("principle"));
    expect(principleNode).toBeDefined();
    expect(principleNode!.summary).toContain("Key principle:");
  });

  it("includes common mistakes when table has them", () => {
    const result = explainArchetype(RFI_ARCHETYPE, PREMIUM, true);
    const mistakesNode = result.children!.find((c) => c.tags?.includes("mistakes"));
    expect(mistakesNode).toBeDefined();
    expect(mistakesNode!.children).toBeDefined();
    expect(mistakesNode!.children!.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════
// NO DATA FALLBACK
// ═══════════════════════════════════════════════════════

describe("explainArchetype — no data", () => {
  it("shows warning when no frequency data", () => {
    const result = explainArchetype(BOGUS_ARCHETYPE, PREMIUM, true);
    const noDataNode = result.children!.find((c) => c.tags?.includes("no-data"));
    expect(noDataNode).toBeDefined();
    expect(noDataNode!.sentiment).toBe("warning");
  });

  it("still includes hand and position even without table", () => {
    const result = explainArchetype(BOGUS_ARCHETYPE, PREMIUM, true);
    expect(result.children!.find((c) => c.tags?.includes("hand-category"))).toBeDefined();
    expect(result.children!.find((c) => c.tags?.includes("position"))).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════
// DIFFERENT ARCHETYPES
// ═══════════════════════════════════════════════════════

describe("explainArchetype — BB defense", () => {
  it("produces valid explanation for BB defense archetype", () => {
    const result = explainArchetype(BB_DEF_ARCHETYPE, MIDDLE, false);
    expect(result.summary).toContain("Big Blind defense");
    expect(result.summary).toContain("Middle pair");
    expect(result.children!.length).toBeGreaterThan(0);
  });
});
