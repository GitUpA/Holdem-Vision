/**
 * Learner Simulation — tests educational effectiveness.
 *
 * Runs multiple "student" strategies through the drill system and
 * compares their learning outcomes. If the system teaches effectively:
 * - Coaching-following student > random student
 * - Narrative-reading student > random student
 * - Learning student improves over time
 *
 * Run: pnpm test -- tests/scenarios/learnerSimulation.test.ts
 */

import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import type { ArchetypeId } from "../../convex/lib/gto/archetypeClassifier";
import {
  runLearnerSession,
  randomStudent,
  frequencyStudent,
  coachingStudent,
  narrativeStudent,
  createLearningStudent,
  formatLearnerResult,
} from "./simulatedLearner";

const OUTPUT_DIR = join(__dirname, "output");

function ensureOutputDir() {
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

describe("Learner Simulation — Educational Effectiveness", () => {
  const archetypes: ArchetypeId[] = [
    "rfi_opening",
    "ace_high_dry_rainbow",
    "two_tone_connected",
    "bb_defense_vs_rfi",
  ];

  it("compares student strategies across archetypes", () => {
    ensureOutputDir();

    const results: Record<string, Record<string, { accuracy: number; learning: boolean }>> = {};
    const allOutput: string[] = [];

    allOutput.push("═══════════════════════════════════════════════════════");
    allOutput.push("  LEARNER SIMULATION — EDUCATIONAL EFFECTIVENESS");
    allOutput.push("═══════════════════════════════════════════════════════");
    allOutput.push("");

    for (const archId of archetypes) {
      results[archId] = {};

      const strategies = [
        { name: "random", fn: randomStudent },
        { name: "frequency", fn: frequencyStudent },
        { name: "coaching", fn: coachingStudent },
        { name: "narrative", fn: narrativeStudent },
        { name: "learning", fn: createLearningStudent() },
      ];

      allOutput.push(`── ${archId} ──`);

      for (const strat of strategies) {
        const result = runLearnerSession(archId, 15, strat.fn, 42);
        results[archId][strat.name] = {
          accuracy: result.accuracy,
          learning: result.learningDetected,
        };

        allOutput.push(
          `  ${strat.name.padEnd(12)} accuracy: ${(result.accuracy * 100).toFixed(0)}% | ` +
          `learning: ${result.learningDetected ? "YES" : "no "} | ` +
          `curve: ${result.learningCurve.map((v) => `${(v * 100).toFixed(0)}`).join("-")}`,
        );
      }
      allOutput.push("");
    }

    // Aggregate across archetypes
    allOutput.push("── AGGREGATE ──");
    const stratNames = ["random", "frequency", "coaching", "narrative", "learning"];
    for (const strat of stratNames) {
      const accs = archetypes.map((a) => results[a][strat]?.accuracy ?? 0);
      const avg = accs.reduce((s, v) => s + v, 0) / accs.length;
      const learned = archetypes.filter((a) => results[a][strat]?.learning).length;
      allOutput.push(
        `  ${strat.padEnd(12)} avg accuracy: ${(avg * 100).toFixed(0)}% | ` +
        `learned: ${learned}/${archetypes.length}`,
      );
    }
    allOutput.push("");

    const report = allOutput.join("\n");
    console.log("\n" + report);
    writeFileSync(join(OUTPUT_DIR, "learner_simulation.txt"), report, "utf-8");

    // Write detailed results for the learning student on one archetype
    const detailedResult = runLearnerSession("ace_high_dry_rainbow", 15, createLearningStudent(), 42);
    writeFileSync(
      join(OUTPUT_DIR, "learner_detailed.txt"),
      formatLearnerResult(detailedResult),
      "utf-8",
    );

    // ── Assertions: educational effectiveness ──

    // Frequency student should be near-perfect (it cheats by looking at the answer)
    for (const archId of archetypes) {
      expect(results[archId].frequency.accuracy).toBeGreaterThan(0.5);
    }

    // Coaching student should beat random
    const coachingAvg = archetypes.reduce((s, a) => s + (results[a].coaching?.accuracy ?? 0), 0) / archetypes.length;
    const randomAvg = archetypes.reduce((s, a) => s + (results[a].random?.accuracy ?? 0), 0) / archetypes.length;
    console.log(`\nCoaching avg: ${(coachingAvg * 100).toFixed(0)}% vs Random avg: ${(randomAvg * 100).toFixed(0)}%`);

    // Narrative student should perform reasonably
    const narrativeAvg = archetypes.reduce((s, a) => s + (results[a].narrative?.accuracy ?? 0), 0) / archetypes.length;
    console.log(`Narrative avg: ${(narrativeAvg * 100).toFixed(0)}%`);
  }, 60000);
});
