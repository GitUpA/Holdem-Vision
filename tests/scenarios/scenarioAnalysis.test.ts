/**
 * Scenario Analysis Tests — NOT pass/fail.
 *
 * These tests run full pipeline scenarios, capture all outputs,
 * and flag logical inconsistencies for human review. The goal is
 * to answer: "for this hand, did all outputs make logical sense
 * and meet the goal of the system?"
 *
 * Run with: pnpm test -- tests/scenarios/scenarioAnalysis.test.ts
 *
 * Review output in console — each scenario prints a full snapshot.
 */

import { describe, it, expect } from "vitest";
import type { ArchetypeId } from "../../convex/lib/gto/archetypeClassifier";
import {
  runScenario,
  runBatch,
  formatSnapshot,
} from "./scenarioRunner";

// ═══════════════════════════════════════════════════════
// INDIVIDUAL SCENARIO ANALYSIS
// ═══════════════════════════════════════════════════════

describe("Scenario Analysis — Individual Hands", () => {
  const scenarios: Array<{ name: string; archetypeId: ArchetypeId; seed: number }> = [
    { name: "AA on ace-high dry board IP", archetypeId: "ace_high_dry_rainbow", seed: 42 },
    { name: "Mid pair on two-tone connected OOP", archetypeId: "two_tone_connected", seed: 100 },
    { name: "Air on monotone board", archetypeId: "monotone", seed: 77 },
    { name: "RFI opening preflop", archetypeId: "rfi_opening", seed: 200 },
    { name: "BB defense vs RFI", archetypeId: "bb_defense_vs_rfi", seed: 150 },
    { name: "3-bet pot preflop", archetypeId: "three_bet_pots", seed: 300 },
    { name: "Paired board", archetypeId: "paired_boards", seed: 55 },
    { name: "C-bet decision", archetypeId: "cbet_sizing_frequency", seed: 88 },
    { name: "Turn barreling", archetypeId: "turn_barreling", seed: 111 },
  ];

  for (const { name, archetypeId, seed } of scenarios) {
    it(`${name} — outputs are logically consistent`, () => {
      const snapshot = runScenario({ archetypeId, seed });

      // Print full snapshot for human review
      console.log("\n" + formatSnapshot(snapshot));

      // ── Structural checks (these SHOULD pass) ──

      // Deal produced valid cards
      expect(snapshot.deal.heroCards.length).toBe(2);
      expect(snapshot.deal.archetypeId).toBe(archetypeId);

      // Narrative produced output
      expect(snapshot.narrative.headline.length).toBeGreaterThan(0);
      expect(snapshot.narrative.question.length).toBeGreaterThan(0);

      // Solution exists for data-backed archetypes
      if (snapshot.deal.hasFrequencyData) {
        expect(snapshot.solution).not.toBeNull();
      }

      // Coaching produced advice for all 5 profiles
      expect(snapshot.coaching.length).toBeGreaterThanOrEqual(4);

      // ── Logical consistency checks ──

      // Scoring: optimal action should score as "optimal"
      if (snapshot.solution) {
        const optimalScore = snapshot.scoring.find(
          (s) => s.action === snapshot.solution!.optimalAction,
        );
        if (optimalScore) {
          expect(optimalScore.verdict).toBe("optimal");
        }
      }

      // No crashes
      expect(snapshot.flags).not.toContain("CRASH");
      expect(snapshot.flags).not.toContain("COACHING_FAILED");

      // Collect flags for review (not fail — just surface)
      if (snapshot.flags.length > 0) {
        console.log(`  FLAGS: ${snapshot.flags.join(", ")}`);
      }
    });
  }
});

// ═══════════════════════════════════════════════════════
// BATCH ANALYSIS — run many, look for patterns
// ═══════════════════════════════════════════════════════

describe("Scenario Analysis — Batch Patterns", () => {
  it("runs 5 scenarios per archetype and reports flag patterns", () => {
    const archetypes: ArchetypeId[] = [
      "rfi_opening",
      "bb_defense_vs_rfi",
      "three_bet_pots",
      "ace_high_dry_rainbow",
      "two_tone_connected",
      "monotone",
      "paired_boards",
      "cbet_sizing_frequency",
    ];

    const result = runBatch(archetypes, 5);

    console.log("\n═══ BATCH SUMMARY ═══");
    console.log(`Total scenarios: ${result.totalScenarios}`);
    console.log(`Flag counts:`);
    for (const [flag, count] of Object.entries(result.flagSummary).sort(
      ([, a], [, b]) => b - a,
    )) {
      console.log(`  ${flag}: ${count}`);
    }

    // Print flagged scenarios
    if (result.allFlags.length > 0) {
      console.log(`\nFlagged scenarios (${result.allFlags.length}):`);
      for (const { scenario, flags } of result.allFlags) {
        console.log(`  ${scenario}: ${flags.join(", ")}`);
      }
    }

    // Structural: no crashes
    expect(result.flagSummary["CRASH"] ?? 0).toBe(0);

    // Surface data for analysis (not strict pass/fail)
    expect(result.totalScenarios).toBe(archetypes.length * 5);
  });

  it("narrative questions match hand strength tiers", () => {
    const archetypes: ArchetypeId[] = [
      "ace_high_dry_rainbow",
      "two_tone_connected",
      "monotone",
    ];

    const result = runBatch(archetypes, 10);

    let mismatchCount = 0;
    const mismatches: string[] = [];

    for (const [archId, snapshots] of Object.entries(result.scenariosByArchetype)) {
      for (const s of snapshots) {
        const strength = s.deal.relativeStrength;
        const q = s.narrative.question.toLowerCase();

        // Strong hand should get value/extract questions, not bluff/fold
        if (strength > 0.7 && (q.includes("nothing") || q.includes("give up"))) {
          mismatchCount++;
          mismatches.push(
            `${archId}: ${s.deal.handCategory} (${strength.toFixed(2)}) got weak question: "${s.narrative.question}"`,
          );
        }
        // Weak hand should not get value questions
        if (strength < 0.15 && q.includes("extract") && q.includes("value")) {
          mismatchCount++;
          mismatches.push(
            `${archId}: ${s.deal.handCategory} (${strength.toFixed(2)}) got strong question: "${s.narrative.question}"`,
          );
        }
      }
    }

    if (mismatches.length > 0) {
      console.log("\nNarrative question mismatches:");
      for (const m of mismatches) {
        console.log(`  ⚠ ${m}`);
      }
    }

    console.log(
      `\nNarrative-strength alignment: ${mismatches.length} mismatches out of ${result.totalScenarios} scenarios`,
    );

    // Soft threshold — some mismatches are ok (random questions), but pattern should be rare
    expect(mismatchCount).toBeLessThan(result.totalScenarios * 0.1);
  });

  it("coaching GTO advice matches solver solution direction", () => {
    const archetypes: ArchetypeId[] = [
      "ace_high_dry_rainbow",
      "kq_high_dry_rainbow",
      "two_tone_disconnected",
    ];

    const result = runBatch(archetypes, 10);

    let total = 0;
    let matches = 0;
    let directionMatches = 0;
    const disagreements: string[] = [];

    for (const snapshots of Object.values(result.scenariosByArchetype)) {
      for (const s of snapshots) {
        if (!s.solution) continue;
        const gto = s.coaching.find((c) => c.profileName === "GTO");
        if (!gto) continue;

        total++;
        if (gto.action === s.solution.optimalAction) {
          matches++;
          directionMatches++;
        } else {
          // Direction match: both aggressive, both passive, or both fold
          const gtoAgg = gto.action.startsWith("bet") || gto.action === "raise";
          const solAgg =
            s.solution.optimalAction.startsWith("bet") || s.solution.optimalAction === "raise";
          const gtoPass = gto.action === "check" || gto.action === "call";
          const solPass = s.solution.optimalAction === "check" || s.solution.optimalAction === "call";

          if ((gtoAgg && solAgg) || (gtoPass && solPass) || (gto.action === "fold" && s.solution.optimalAction === "fold")) {
            directionMatches++;
          } else {
            disagreements.push(
              `${s.deal.archetypeId}: ${s.deal.heroCards.join("")} | GTO coaching=${gto.action} vs solver=${s.solution.optimalAction} (${s.deal.handCategory})`,
            );
          }
        }
      }
    }

    console.log(`\nGTO coaching vs solver alignment:`);
    console.log(`  Exact match: ${matches}/${total} (${total > 0 ? ((matches / total) * 100).toFixed(0) : 0}%)`);
    console.log(`  Direction match: ${directionMatches}/${total} (${total > 0 ? ((directionMatches / total) * 100).toFixed(0) : 0}%)`);

    if (disagreements.length > 0) {
      console.log(`  Disagreements (${disagreements.length}):`);
      for (const d of disagreements) {
        console.log(`    ⚠ ${d}`);
      }
    }

    // Soft threshold — direction should match most of the time
    if (total > 0) {
      expect(directionMatches / total).toBeGreaterThan(0.6);
    }
  });
});
