import { describe, it, expect } from "vitest";
import {
  calculateFoldEquity,
  foldEquityScenarios,
} from "../../convex/lib/analysis/foldEquity";
import {
  NIT_PROFILE,
  FISH_PROFILE,
  TAG_PROFILE,
} from "../../convex/lib/opponents/presets";

// Use postflop.facing_bet params for flop/turn/river tests (most common fold equity scenario)
const tagParams = TAG_PROFILE.situations["postflop.facing_bet"]!;
const nitParams = NIT_PROFILE.situations["postflop.facing_bet"]!;
const fishParams = FISH_PROFILE.situations["postflop.facing_bet"]!;

// Use preflop.open params for preflop tests
const nitPreflopParams = NIT_PROFILE.situations["preflop.open"]!;
const fishPreflopParams = FISH_PROFILE.situations["preflop.open"]!;

describe("calculateFoldEquity", () => {
  const potBB = 6.5;

  it("returns valid structure", () => {
    const result = calculateFoldEquity(0.55, tagParams, 75, potBB, "flop", "TAG");
    expect(result.foldProbability).toBeGreaterThanOrEqual(0);
    expect(result.foldProbability).toBeLessThanOrEqual(1);
    expect(result.betBB).toBeCloseTo(4.875);
    expect(result.potBB).toBe(6.5);
    expect(result.breakEvenFoldPct).toBeGreaterThan(0);
    expect(result.explanation.summary).toBeTruthy();
    expect(result.recommendation).toMatch(/^(bet|check|marginal)$/);
  });

  it("betBB is correct for different sizes", () => {
    const r33 = calculateFoldEquity(0.5, tagParams, 33, potBB, "flop", "TAG");
    const r100 = calculateFoldEquity(0.5, tagParams, 100, potBB, "flop", "TAG");
    expect(r33.betBB).toBeCloseTo(6.5 * 0.33);
    expect(r100.betBB).toBeCloseTo(6.5);
  });

  it("break-even fold% is correct", () => {
    const result = calculateFoldEquity(0.5, tagParams, 100, 10, "flop", "TAG");
    expect(result.breakEvenFoldPct).toBeCloseTo(50, 0);

    const r50 = calculateFoldEquity(0.5, tagParams, 50, 10, "flop", "TAG");
    expect(r50.breakEvenFoldPct).toBeCloseTo(33.3, 0);
  });

  it("nit folds more than fish on flop", () => {
    const nit = calculateFoldEquity(0.5, nitParams, 75, potBB, "flop", "Nit");
    const fish = calculateFoldEquity(0.5, fishParams, 75, potBB, "flop", "Fish");
    expect(nit.foldProbability).toBeGreaterThan(fish.foldProbability);
  });

  it("larger bets get more folds", () => {
    const small = calculateFoldEquity(0.5, tagParams, 33, potBB, "flop", "TAG");
    const large = calculateFoldEquity(0.5, tagParams, 100, potBB, "flop", "TAG");
    expect(large.foldProbability).toBeGreaterThan(small.foldProbability);
  });

  it("high equity when called makes bet more +EV", () => {
    const lowEq = calculateFoldEquity(0.30, tagParams, 75, potBB, "flop", "TAG");
    const highEq = calculateFoldEquity(0.70, tagParams, 75, potBB, "flop", "TAG");
    expect(highEq.betEV).toBeGreaterThan(lowEq.betEV);
  });

  it("fold probability is capped at 0.95", () => {
    const result = calculateFoldEquity(0.5, nitParams, 200, 10, "flop", "Nit");
    expect(result.foldProbability).toBeLessThanOrEqual(0.95);
  });

  it("preflop fold rate based on continuePct", () => {
    // Nit preflop.open continuePct=12 → folds ~88%
    const nit = calculateFoldEquity(0.5, nitPreflopParams, 75, potBB, "preflop", "Nit");
    // Fish preflop.open continuePct=55 → folds ~45%
    const fish = calculateFoldEquity(0.5, fishPreflopParams, 75, potBB, "preflop", "Fish");
    expect(nit.foldProbability).toBeGreaterThan(fish.foldProbability);
  });

  it("turn/river fold rates decrease (stickier)", () => {
    const flop = calculateFoldEquity(0.5, tagParams, 75, potBB, "flop", "TAG");
    const turn = calculateFoldEquity(0.5, tagParams, 75, potBB, "turn", "TAG");
    const river = calculateFoldEquity(0.5, tagParams, 75, potBB, "river", "TAG");
    expect(turn.foldProbability).toBeLessThanOrEqual(flop.foldProbability);
    expect(river.foldProbability).toBeLessThanOrEqual(turn.foldProbability);
  });

  it("explanation has meaningful children", () => {
    const result = calculateFoldEquity(0.55, tagParams, 75, potBB, "flop", "TAG");
    expect(result.explanation.children).toBeDefined();
    expect(result.explanation.children!.length).toBe(4);
    expect(result.explanation.children![0].tags).toContain("bet-size");
    expect(result.explanation.children![1].tags).toContain("fold-rate");
    expect(result.explanation.children![2].tags).toContain("break-even");
    expect(result.explanation.children![3].tags).toContain("equity");
  });
});

describe("foldEquityScenarios", () => {
  it("returns 4 scenarios (33%, 50%, 75%, 100%)", () => {
    const scenarios = foldEquityScenarios(0.5, tagParams, 6.5, "flop", "TAG");
    expect(scenarios.length).toBe(4);
    expect(scenarios.map((s) => s.betSizePct)).toEqual([33, 50, 75, 100]);
  });

  it("larger bets have higher betBB", () => {
    const scenarios = foldEquityScenarios(0.5, tagParams, 10, "flop", "TAG");
    for (let i = 1; i < scenarios.length; i++) {
      expect(scenarios[i].result.betBB).toBeGreaterThan(scenarios[i - 1].result.betBB);
    }
  });

  it("each scenario has valid fold equity result", () => {
    const scenarios = foldEquityScenarios(0.5, fishParams, 8, "flop", "Fish");
    for (const s of scenarios) {
      expect(s.result.foldProbability).toBeGreaterThanOrEqual(0);
      expect(s.result.foldProbability).toBeLessThanOrEqual(1);
      expect(s.result.explanation.summary).toBeTruthy();
    }
  });
});
