import { describe, it, expect } from "vitest";
import { buildNarrativeFeedback } from "../../convex/lib/gto/narrativeFeedback";

describe("buildNarrativeFeedback", () => {
  it("provides action narrative for every action type", () => {
    const actions = ["fold", "check", "call", "bet_small", "bet_medium", "bet_large", "raise_small", "raise_large"] as const;
    for (const action of actions) {
      const fb = buildNarrativeFeedback(
        action,
        null,
        "bet_medium",
        0.5,
        { bet_medium: 0.5, check: 0.3, fold: 0.2 },
      );
      expect(fb.actionNarrative.length).toBeGreaterThan(0);
    }
  });

  it("returns null contrast when user chose optimal", () => {
    const fb = buildNarrativeFeedback(
      "bet_medium",
      "value_strong",
      "bet_medium",
      0.6,
      { bet_medium: 0.6, check: 0.3, fold: 0.1 },
    );
    expect(fb.gtoContrastNarrative).toBeNull();
  });

  it("returns soft contrast for mixed strategy minority action", () => {
    const fb = buildNarrativeFeedback(
      "check",
      "pot_control",
      "bet_medium",
      0.55,
      { bet_medium: 0.55, check: 0.45 },
    );
    expect(fb.gtoContrastNarrative).not.toBeNull();
    expect(fb.gtoContrastNarrative).toContain("valid");
  });

  it("returns stronger contrast for rare action", () => {
    const fb = buildNarrativeFeedback(
      "fold",
      "give_up",
      "bet_medium",
      0.7,
      { bet_medium: 0.7, check: 0.25, fold: 0.05 },
    );
    expect(fb.gtoContrastNarrative).not.toBeNull();
    expect(fb.gtoContrastNarrative).toContain("rarely");
  });

  it("detects narrative alignment", () => {
    const fb = buildNarrativeFeedback(
      "bet_medium",
      "value_strong",
      "bet_medium",
      0.6,
      { bet_medium: 0.6, check: 0.4 },
    );
    expect(fb.narrativeAlignment).toBe("aligned");
  });

  it("detects narrative contradiction", () => {
    const fb = buildNarrativeFeedback(
      "fold",
      "value_strong",
      "bet_medium",
      0.6,
      { bet_medium: 0.6, check: 0.4 },
    );
    expect(fb.narrativeAlignment).toBe("contradicted");
  });

  it("returns null alignment when no narrative choice", () => {
    const fb = buildNarrativeFeedback(
      "bet_medium",
      null,
      "bet_medium",
      0.6,
      { bet_medium: 0.6, check: 0.4 },
    );
    expect(fb.narrativeAlignment).toBeNull();
  });

  it("provides principle from archetype prototype", () => {
    const fb = buildNarrativeFeedback(
      "bet_medium",
      null,
      "bet_medium",
      0.6,
      { bet_medium: 0.6, check: 0.4 },
      "ace_high_dry_rainbow",
    );
    expect(fb.principleConnection.length).toBeGreaterThan(0);
    // Should come from the prototype's feeling, not the default
    expect(fb.principleConnection).not.toContain("Every action at the table");
  });

  it("falls back to default principle without archetype", () => {
    const fb = buildNarrativeFeedback(
      "check",
      null,
      "check",
      0.5,
      { check: 0.5, bet_medium: 0.5 },
    );
    expect(fb.principleConnection).toContain("story");
  });
});
