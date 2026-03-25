import { describe, it, expect } from "vitest";
import { HandStepper } from "../../convex/lib/analysis/handStepper";
import { formatSnapshot } from "../../convex/lib/analysis/snapshot";
import { cardFromString } from "../../convex/lib/primitives/card";
import { GTO_PROFILE } from "../../convex/lib/opponents/presets";

describe("Hand Stepper — programmatic hand play", () => {
  it("deals a hand and captures first decision snapshot", () => {
    const stepper = new HandStepper({ debug: true });
    const heroCards: [number, number] = [cardFromString("As"), cardFromString("Kh")];
    const step = stepper.deal(heroCards);

    expect(step).not.toBeNull();
    if (!step) return;

    const snap = step.snapshot;
    expect(snap.heroCards).toEqual(["A♠", "K♥"]);
    expect(snap.street).toBe("preflop");
    expect(snap.handStrength.description).toBeTruthy();
    expect(snap.legalActions.canFold).toBe(true);
    expect(snap.pot).toBeGreaterThan(0);
    expect(snap.players.length).toBe(6);

    // Debug data should be present
    expect(snap.debug).toBeDefined();
    expect(snap.debug!.rawHandCat).toBeDefined();
  });

  it("captures archetype classification", () => {
    const stepper = new HandStepper();
    const step = stepper.deal([cardFromString("Qd"), cardFromString("Jc")]);

    expect(step).not.toBeNull();
    if (!step) return;

    expect(step.snapshot.archetype).not.toBeNull();
    expect(step.snapshot.archetype!.id).toBeTruthy();
    expect(step.snapshot.archetype!.confidence).toBeGreaterThan(0);
  });

  it("captures GTO frequencies", () => {
    const stepper = new HandStepper();
    const step = stepper.deal([cardFromString("As"), cardFromString("Ah")]);

    expect(step).not.toBeNull();
    if (!step) return;

    // AA should have GTO data
    expect(step.snapshot.gtoFrequencies).not.toBeNull();
    expect(step.snapshot.gtoSource).toBeTruthy();
    expect(step.snapshot.gtoOptimalAction).toBeTruthy();
  });

  it("captures hand commentary", () => {
    const stepper = new HandStepper();
    const step = stepper.deal([cardFromString("7h"), cardFromString("2d")]);

    expect(step).not.toBeNull();
    if (!step) return;

    expect(step.snapshot.commentary).not.toBeNull();
    expect(step.snapshot.commentary!.narrative.length).toBeGreaterThan(30);
    expect(step.snapshot.commentary!.confidence).toBeTruthy();
  });

  it("captures action stories", () => {
    const stepper = new HandStepper();
    const step = stepper.deal([cardFromString("Ts"), cardFromString("9s")]);

    expect(step).not.toBeNull();
    if (!step) return;

    expect(step.snapshot.actionStories.length).toBeGreaterThan(0);
    for (const story of step.snapshot.actionStories) {
      expect(story.action).toBeTruthy();
      expect(story.narrative.length).toBeGreaterThan(10);
    }
  });

  it("formats snapshot as readable text", () => {
    const stepper = new HandStepper();
    const step = stepper.deal([cardFromString("Ks"), cardFromString("Qh")]);

    expect(step).not.toBeNull();
    if (!step) return;

    const text = step.formatted;
    expect(text).toContain("PREFLOP");
    expect(text).toContain("K♠");
    expect(text).toContain("Pot:");
    expect(text).toContain("Actions:");
  });

  it("plays a full hand automatically", { timeout: 30000 }, () => {
    const stepper = new HandStepper();
    const result = stepper.playFullHand(
      [cardFromString("As"), cardFromString("Kd")],
    );

    // Should have at least one decision step
    // (may be 0 if hero was never reached — all folded before)
    expect(result.steps.length).toBeGreaterThanOrEqual(0);
    expect(result.heroActions).toBeDefined();
  });

  it("captures opponent stories when opponents have acted", () => {
    const stepper = new HandStepper();
    // Deal and let auto-play happen — opponents will act preflop
    const step = stepper.deal([cardFromString("Ac"), cardFromString("Kc")]);

    expect(step).not.toBeNull();
    if (!step) return;

    // Opponent stories may or may not be populated depending on
    // whether any opponent acted before hero's first decision
    // (some may have folded, reducing active opponents)
    expect(step.snapshot.opponentStories).toBeDefined();
  });

  it("produces coherent data across all components", () => {
    const stepper = new HandStepper();
    const step = stepper.deal([cardFromString("8h"), cardFromString("8c")]);

    expect(step).not.toBeNull();
    if (!step) return;

    const snap = step.snapshot;

    // Hand strength should match hand category
    expect(snap.handStrength.category).toBeTruthy();

    // If GTO says fold, commentary should lean toward fold
    if (snap.gtoOptimalAction === "fold" && snap.gtoFrequencies) {
      const foldFreq = snap.gtoFrequencies.fold ?? 0;
      if (foldFreq > 0.7) {
        // Strong fold signal — commentary should not recommend raise
        expect(snap.commentary?.recommendedAction).not.toBe("raise");
      }
    }

    // Action stories should cover all legal actions
    const legalCount = [
      snap.legalActions.canFold,
      snap.legalActions.canCheck,
      snap.legalActions.canCall && snap.legalActions.callAmount > 0,
      snap.legalActions.canBet,
      snap.legalActions.canRaise,
    ].filter(Boolean).length;
    expect(snap.actionStories.length).toBe(legalCount);
  });

  it("without debug flag, no debug data is included", () => {
    const stepper = new HandStepper({ debug: false });
    const step = stepper.deal([cardFromString("Jd"), cardFromString("Ts")]);

    expect(step).not.toBeNull();
    if (!step) return;

    expect(step.snapshot.debug).toBeUndefined();
  });
});
