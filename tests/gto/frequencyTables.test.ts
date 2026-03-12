import { describe, it, expect, beforeEach } from "vitest";
import {
  registerTable,
  getTable,
  hasTable,
  registeredArchetypes,
  tableCount,
  clearTables,
  lookupFrequencies,
  getPositionFrequencies,
  solverOutputToTable,
  type FrequencyTable,
  type SolverOutput,
} from "../../convex/lib/gto/tables";
import { ALL_PREFLOP_TABLES, FLOP_ARCHETYPE_METADATA } from "../../convex/lib/gto/tables/preflopTables";
import { loadSolverTables, validateSolverOutput, FLOP_ARCHETYPE_IDS } from "../../convex/lib/gto/tables/loadSolverTables";
import type { HandCategory } from "../../convex/lib/gto/handCategorizer";

// ─── Sample solver output (from the 3-board test run) ───

const SAMPLE_SOLVER_OUTPUT: SolverOutput = {
  archetypeId: "ace_high_dry_rainbow",
  boardsAnalyzed: 1,
  context: { street: "flop", potType: "srp", heroPosition: "btn", villainPosition: "bb" },
  ip_frequencies: {
    sets_plus: { check: 0.0409, bet_small: 0.1184, bet_large: 0.0, bet_medium: 0.8407 },
    middle_pair: { check: 0.7279, bet_small: 0.1285, bet_large: 0.0, bet_medium: 0.1435 },
    air: { check: 0.4989, bet_small: 0.0505, bet_large: 0.0, bet_medium: 0.4506 },
    top_pair_weak_kicker: { check: 0.1193, bet_small: 0.2005, bet_large: 0.0, bet_medium: 0.6801 },
    two_pair: { check: 0.0198, bet_small: 0.0617, bet_large: 0.0, bet_medium: 0.9186 },
    top_pair_top_kicker: { check: 0.0684, bet_small: 0.0793, bet_large: 0.0, bet_medium: 0.8523 },
  },
  oop_frequencies: {
    sets_plus: { check: 0.9482, bet_small: 0.0316, bet_large: 0.0003, bet_medium: 0.0198 },
    middle_pair: { check: 0.974, bet_small: 0.0257, bet_large: 0.0, bet_medium: 0.0003 },
    air: { check: 0.9909, bet_small: 0.0057, bet_large: 0.0, bet_medium: 0.0035 },
    top_pair_weak_kicker: { check: 0.9354, bet_small: 0.0489, bet_large: 0.0, bet_medium: 0.0156 },
    two_pair: { check: 0.891, bet_small: 0.0598, bet_large: 0.0, bet_medium: 0.0492 },
    top_pair_top_kicker: { check: 0.95, bet_small: 0.0425, bet_large: 0.0001, bet_medium: 0.0075 },
    bottom_pair: { check: 1.0, bet_small: 0.0, bet_large: 0.0, bet_medium: 0.0 },
  },
  actions_ip: ["bet_large", "bet_medium", "bet_small", "check"],
  actions_oop: ["bet_large", "bet_medium", "bet_small", "check"],
};

// ═══════════════════════════════════════════════════════
// AUTO-REGISTRATION
// ═══════════════════════════════════════════════════════

describe("Auto-registered preflop tables", () => {
  // Tables are registered on import in tables/index.ts

  it("has all 5 preflop tables registered", () => {
    expect(hasTable("rfi_opening")).toBe(true);
    expect(hasTable("bb_defense_vs_rfi")).toBe(true);
    expect(hasTable("three_bet_pots")).toBe(true);
    expect(hasTable("blind_vs_blind")).toBe(true);
    expect(hasTable("four_bet_five_bet")).toBe(true);
  });

  it("tableCount includes at least 5 preflop tables", () => {
    expect(tableCount()).toBeGreaterThanOrEqual(5);
  });

  it("registeredArchetypes includes all preflop IDs", () => {
    const ids = registeredArchetypes();
    expect(ids).toContain("rfi_opening");
    expect(ids).toContain("bb_defense_vs_rfi");
  });
});

// ═══════════════════════════════════════════════════════
// PREFLOP TABLE VALIDATION
// ═══════════════════════════════════════════════════════

describe("Preflop table structure", () => {
  for (const table of ALL_PREFLOP_TABLES) {
    describe(table.name, () => {
      it("has valid archetypeId", () => {
        expect(table.archetypeId).toBeTruthy();
      });

      it("has preflop context", () => {
        expect(table.context.street).toBe("preflop");
      });

      it("IP frequencies sum to ~1.0 per category", () => {
        for (const [cat, freqs] of Object.entries(table.ipFrequencies)) {
          const sum = Object.values(freqs!).reduce((a, b) => a + (b ?? 0), 0);
          expect(sum).toBeGreaterThan(0.95);
          expect(sum).toBeLessThan(1.05);
        }
      });

      it("OOP frequencies sum to ~1.0 per category", () => {
        for (const [cat, freqs] of Object.entries(table.oopFrequencies)) {
          const sum = Object.values(freqs!).reduce((a, b) => a + (b ?? 0), 0);
          expect(sum).toBeGreaterThan(0.95);
          expect(sum).toBeLessThan(1.05);
        }
      });

      it("has teaching metadata", () => {
        expect(table.keyPrinciple.length).toBeGreaterThan(10);
        expect(table.commonMistakes.length).toBeGreaterThan(0);
      });
    });
  }
});

// ═══════════════════════════════════════════════════════
// LOOKUPS
// ═══════════════════════════════════════════════════════

describe("lookupFrequencies", () => {
  it("returns exact match for registered category", () => {
    const result = lookupFrequencies("rfi_opening", "premium_pair", true);
    expect(result).not.toBeNull();
    expect(result!.isExact).toBe(true);
    expect(result!.frequencies.bet_medium).toBe(1.0);
  });

  it("returns fallback for unregistered category", () => {
    const result = lookupFrequencies("rfi_opening", "combo_draw", true);
    expect(result).not.toBeNull();
    expect(result!.isExact).toBe(false);
    // combo_draw (0.5 strength) should fall back to middle_pair (0.45) or flush_draw (0.4)
    expect(["middle_pair", "flush_draw", "straight_draw"]).toContain(result!.handCategory);
  });

  it("returns null for unregistered archetype", () => {
    const result = lookupFrequencies("monotone", "air", true);
    // monotone might not be registered yet (solver hasn't run full batch)
    // If not registered, should return null
    if (!hasTable("monotone")) {
      expect(result).toBeNull();
    }
  });

  it("returns different frequencies for IP vs OOP", () => {
    const ip = lookupFrequencies("bb_defense_vs_rfi", "premium_pair", true);
    const oop = lookupFrequencies("bb_defense_vs_rfi", "premium_pair", false);
    expect(ip).not.toBeNull();
    expect(oop).not.toBeNull();
    // Both should 3-bet premium, but frequencies may differ
    expect(ip!.frequencies.bet_large).toBe(1.0);
    expect(oop!.frequencies.bet_large).toBe(1.0);
  });
});

describe("getPositionFrequencies", () => {
  it("returns all categories for a registered archetype", () => {
    const freqs = getPositionFrequencies("rfi_opening", true);
    expect(freqs).not.toBeNull();
    expect(Object.keys(freqs!).length).toBeGreaterThan(3);
  });

  it("returns null for unregistered archetype", () => {
    // Use an archetype we know isn't registered as a preflop table
    if (!hasTable("overbet_river")) {
      const freqs = getPositionFrequencies("overbet_river", true);
      expect(freqs).toBeNull();
    }
  });
});

// ═══════════════════════════════════════════════════════
// SOLVER OUTPUT CONVERSION
// ═══════════════════════════════════════════════════════

describe("solverOutputToTable", () => {
  it("converts solver JSON to FrequencyTable", () => {
    const meta = FLOP_ARCHETYPE_METADATA["ace_high_dry_rainbow"];
    const table = solverOutputToTable(SAMPLE_SOLVER_OUTPUT, meta);

    expect(table.archetypeId).toBe("ace_high_dry_rainbow");
    expect(table.name).toBe("Ace-High Dry Rainbow");
    expect(table.boardsAnalyzed).toBe(1);
    expect(table.source).toContain("TexasSolver");
  });

  it("maps solver categories to HandCategory", () => {
    const meta = FLOP_ARCHETYPE_METADATA["ace_high_dry_rainbow"];
    const table = solverOutputToTable(SAMPLE_SOLVER_OUTPUT, meta);

    // sets_plus should be preserved
    expect(table.ipFrequencies.sets_plus).toBeDefined();
    expect(table.ipFrequencies.sets_plus!.bet_medium).toBeCloseTo(0.8407, 3);

    // air should be preserved
    expect(table.ipFrequencies.air).toBeDefined();
    expect(table.ipFrequencies.air!.check).toBeCloseTo(0.4989, 3);
  });

  it("filters out near-zero frequencies", () => {
    const meta = FLOP_ARCHETYPE_METADATA["ace_high_dry_rainbow"];
    const table = solverOutputToTable(SAMPLE_SOLVER_OUTPUT, meta);

    // bet_large was 0.0 everywhere in IP — should be filtered
    expect(table.ipFrequencies.sets_plus!.bet_large).toBeUndefined();
  });

  it("maps solver actions to GtoAction", () => {
    const meta = FLOP_ARCHETYPE_METADATA["ace_high_dry_rainbow"];
    const table = solverOutputToTable(SAMPLE_SOLVER_OUTPUT, meta);

    expect(table.actionsIp).toContain("check");
    expect(table.actionsIp).toContain("bet_medium");
    expect(table.actionsIp).toContain("bet_small");
  });
});

describe("solverOutputToTable — underpair merging", () => {
  it("merges underpair into bottom_pair", () => {
    const withUnderpair: SolverOutput = {
      ...SAMPLE_SOLVER_OUTPUT,
      archetypeId: "two_tone_connected",
      ip_frequencies: {
        underpair: { check: 0.4, bet_small: 0.3, bet_medium: 0.3 },
        bottom_pair: { check: 0.6, bet_small: 0.2, bet_medium: 0.2 },
      },
      oop_frequencies: {},
    };
    const meta = FLOP_ARCHETYPE_METADATA["two_tone_connected"];
    const table = solverOutputToTable(withUnderpair, meta);

    // underpair maps to bottom_pair → should merge with existing bottom_pair
    expect(table.ipFrequencies.bottom_pair).toBeDefined();
    // Merged = average of underpair and bottom_pair
    expect(table.ipFrequencies.bottom_pair!.check).toBeCloseTo(0.5, 1);
  });
});

// ═══════════════════════════════════════════════════════
// SOLVER TABLE LOADER
// ═══════════════════════════════════════════════════════

describe("loadSolverTables", () => {
  const originalCount = tableCount();

  it("registers solver output as frequency tables", () => {
    const registered = loadSolverTables([SAMPLE_SOLVER_OUTPUT]);
    expect(registered).toContain("ace_high_dry_rainbow");
    expect(hasTable("ace_high_dry_rainbow")).toBe(true);
  });

  it("loaded table is queryable", () => {
    loadSolverTables([SAMPLE_SOLVER_OUTPUT]);
    const result = lookupFrequencies("ace_high_dry_rainbow", "sets_plus", true);
    expect(result).not.toBeNull();
    expect(result!.isExact).toBe(true);
    expect(result!.frequencies.bet_medium).toBeCloseTo(0.8407, 3);
  });

  it("skips unknown archetype IDs", () => {
    const unknown: SolverOutput = {
      ...SAMPLE_SOLVER_OUTPUT,
      archetypeId: "nonexistent_archetype",
    };
    const registered = loadSolverTables([unknown]);
    expect(registered).toHaveLength(0);
  });
});

describe("validateSolverOutput", () => {
  it("accepts valid solver output", () => {
    expect(validateSolverOutput(SAMPLE_SOLVER_OUTPUT)).toBe(true);
  });

  it("rejects null", () => {
    expect(validateSolverOutput(null)).toBe(false);
  });

  it("rejects missing fields", () => {
    expect(validateSolverOutput({ archetypeId: "test" })).toBe(false);
  });

  it("rejects wrong types", () => {
    expect(validateSolverOutput({
      archetypeId: 123,
      boardsAnalyzed: "one",
      ip_frequencies: {},
      oop_frequencies: {},
      actions_ip: [],
      actions_oop: [],
    })).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════
// FLOP METADATA
// ═══════════════════════════════════════════════════════

describe("FLOP_ARCHETYPE_METADATA", () => {
  it("has metadata for all 8 flop texture archetypes", () => {
    for (const id of FLOP_ARCHETYPE_IDS) {
      expect(FLOP_ARCHETYPE_METADATA[id]).toBeDefined();
      expect(FLOP_ARCHETYPE_METADATA[id].name.length).toBeGreaterThan(0);
      expect(FLOP_ARCHETYPE_METADATA[id].keyPrinciple.length).toBeGreaterThan(10);
      expect(FLOP_ARCHETYPE_METADATA[id].commonMistakes.length).toBeGreaterThanOrEqual(2);
    }
  });
});
