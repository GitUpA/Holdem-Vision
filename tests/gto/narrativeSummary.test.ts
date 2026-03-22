import { describe, it, expect } from "vitest";
import { buildNarrativeSummary, type NarrativeChoiceRecord } from "../../convex/lib/gto/narrativeSummary";
import type { ActionScore } from "../../convex/lib/gto/evScoring";
import type { ArchetypeClassification } from "../../convex/lib/gto/archetypeClassifier";
import type { HandCategorization } from "../../convex/lib/gto/handCategorizer";

function makeScore(
  verdict: string,
  category: string,
  relativeStrength = 0.5,
): ActionScore {
  return {
    evLoss: verdict === "optimal" ? 0 : verdict === "acceptable" ? 1 : 3,
    userAction: "bet_medium",
    optimalAction: "bet_medium",
    optimalFrequency: 0.6,
    userActionFrequency: verdict === "optimal" ? 0.6 : 0.1,
    allFrequencies: { bet_medium: 0.6, check: 0.4 },
    archetype: {
      archetypeId: "ace_high_dry_rainbow",
      confidence: 0.9,
      category: "flop_texture",
      description: "test",
    } as ArchetypeClassification,
    handCategory: {
      category: category as HandCategorization["category"],
      relativeStrength,
      description: `test ${category}`,
    },
    verdict: verdict as ActionScore["verdict"],
    explanation: { summary: "test" },
  };
}

describe("buildNarrativeSummary", () => {
  it("returns observation for empty scores", () => {
    const summary = buildNarrativeSummary([], []);
    expect(summary.insights.length).toBe(1);
    expect(summary.insights[0].type).toBe("observation");
  });

  it("identifies weak categories", () => {
    const scores = [
      makeScore("blunder", "air"),
      makeScore("blunder", "air"),
      makeScore("optimal", "sets_plus"),
      makeScore("optimal", "sets_plus"),
    ];
    const summary = buildNarrativeSummary(scores, []);
    expect(summary.weakCategories).toContain("air");
    expect(summary.strongCategories).toContain("sets_plus");
  });

  it("produces weakness insight for poor categories", () => {
    const scores = [
      makeScore("blunder", "middle_pair"),
      makeScore("mistake", "middle_pair"),
    ];
    const summary = buildNarrativeSummary(scores, []);
    const weakness = summary.insights.find((i) => i.type === "weakness");
    expect(weakness).toBeDefined();
    expect(weakness!.summary).toContain("middle pair");
  });

  it("produces strength insight for good categories", () => {
    const scores = [
      makeScore("optimal", "top_pair_top_kicker"),
      makeScore("optimal", "top_pair_top_kicker"),
      makeScore("optimal", "top_pair_top_kicker"),
    ];
    const summary = buildNarrativeSummary(scores, []);
    const strength = summary.insights.find((i) => i.type === "strength");
    expect(strength).toBeDefined();
    expect(strength!.summary).toContain("top pair top kicker");
  });

  it("computes narrative alignment rate", () => {
    const choices: NarrativeChoiceRecord[] = [
      { choice: "value_strong", action: "bet_medium", verdict: "optimal" },
      { choice: "pot_control", action: "check", verdict: "optimal" },
      { choice: "bluff_fold_equity", action: "fold", verdict: "blunder" },
    ];
    const scores = [
      makeScore("optimal", "sets_plus"),
      makeScore("optimal", "middle_pair"),
      makeScore("blunder", "air"),
    ];
    const summary = buildNarrativeSummary(scores, choices);
    expect(summary.narrativeAlignmentRate).not.toBeNull();
    // 2 of 3 are optimal/acceptable
    expect(summary.narrativeAlignmentRate).toBeCloseTo(0.67, 1);
  });

  it("returns null alignment when no choices made", () => {
    const summary = buildNarrativeSummary(
      [makeScore("optimal", "overpair")],
      [],
    );
    expect(summary.narrativeAlignmentRate).toBeNull();
  });

  it("includes archetype-specific principle", () => {
    const scores = [makeScore("blunder", "air")];
    const summary = buildNarrativeSummary(scores, [], "ace_high_dry_rainbow");
    const weakness = summary.insights.find((i) => i.type === "weakness");
    expect(weakness?.principle.length).toBeGreaterThan(0);
  });
});
