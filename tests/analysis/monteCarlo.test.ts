import { describe, it, expect } from "vitest";
import { monteCarloEquity } from "../../convex/lib/analysis/monteCarlo";
import { cardsFromStrings } from "../../convex/lib/primitives/card";
import { seededRandom } from "../../convex/lib/primitives/deck";

describe("Monte Carlo equity engine", () => {
  it("AA is heavily favored preflop vs 1 opponent", () => {
    const hero = cardsFromStrings(["As", "Ah"]);
    const result = monteCarloEquity(hero, [], {
      trials: 50000,
      numOpponents: 1,
      random: seededRandom(42),
    });
    // AA vs random hand is ~85% equity
    expect(result.win).toBeGreaterThan(0.80);
    expect(result.win).toBeLessThan(0.90);
    expect(result.win + result.tie + result.lose).toBeCloseTo(1, 2);
  });

  it("72o is weak preflop", () => {
    const hero = cardsFromStrings(["7d", "2c"]);
    const result = monteCarloEquity(hero, [], {
      trials: 50000,
      numOpponents: 1,
      random: seededRandom(42),
    });
    // 72o vs random hand is ~35%
    expect(result.win).toBeGreaterThan(0.25);
    expect(result.win).toBeLessThan(0.45);
  });

  it("flopped set has strong equity", () => {
    const hero = cardsFromStrings(["Kc", "Kd"]);
    const community = cardsFromStrings(["Ks", "7h", "2d"]);
    const result = monteCarloEquity(hero, community, {
      trials: 50000,
      numOpponents: 1,
      random: seededRandom(42),
    });
    // Set of Kings on dry board is ~95%+
    expect(result.win).toBeGreaterThan(0.88);
  });

  it("returns hand distribution", () => {
    const hero = cardsFromStrings(["Ah", "Kh"]);
    const result = monteCarloEquity(hero, [], {
      trials: 3000,
      numOpponents: 1,
      random: seededRandom(42),
    });
    // Should have multiple hand types in distribution
    expect(Object.keys(result.handDistribution).length).toBeGreaterThan(3);
    // Probabilities should sum close to 1
    const sum = Object.values(result.handDistribution).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 1);
  });

  it("more opponents reduces equity", () => {
    const hero = cardsFromStrings(["As", "Kd"]);
    const eq1 = monteCarloEquity(hero, [], {
      trials: 3000,
      numOpponents: 1,
      random: seededRandom(42),
    });
    const eq3 = monteCarloEquity(hero, [], {
      trials: 3000,
      numOpponents: 3,
      random: seededRandom(42),
    });
    expect(eq3.win).toBeLessThan(eq1.win);
  });

  it("respects dead cards", () => {
    const hero = cardsFromStrings(["As", "Ah"]);
    // Remove the other two aces — hero can't make quads
    const dead = cardsFromStrings(["Ac", "Ad"]);
    const result = monteCarloEquity(hero, [], {
      trials: 3000,
      numOpponents: 1,
      deadCards: dead,
      random: seededRandom(42),
    });
    // Hero can't make quad aces, but could still make quads via board (very rare)
    expect(result.handDistribution["Four of a Kind"] ?? 0).toBeLessThan(0.01);
  });

  it("deterministic with same seed", () => {
    const hero = cardsFromStrings(["Qh", "Jh"]);
    const r1 = monteCarloEquity(hero, [], {
      trials: 1000,
      random: seededRandom(99),
    });
    const r2 = monteCarloEquity(hero, [], {
      trials: 1000,
      random: seededRandom(99),
    });
    expect(r1.win).toBe(r2.win);
    expect(r1.tie).toBe(r2.tie);
    expect(r1.lose).toBe(r2.lose);
  });

  it("runs 10k trials in reasonable time", () => {
    const hero = cardsFromStrings(["As", "Kd"]);
    const start = performance.now();
    monteCarloEquity(hero, [], {
      trials: 10000,
      numOpponents: 1,
      random: seededRandom(42),
    });
    const elapsed = performance.now() - start;
    // Should complete in under 5 seconds (generous for CI)
    expect(elapsed).toBeLessThan(5000);
  });
});
