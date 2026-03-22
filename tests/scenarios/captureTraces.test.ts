/**
 * Capture Hand Traces — runs full hands through the system
 * and writes structured traces to disk for separate analysis.
 *
 * This is CAPTURE ONLY. No analysis assertions.
 * Run: pnpm test -- tests/scenarios/captureTraces.test.ts
 * Output: tests/scenarios/output/
 */

import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import type { ArchetypeId } from "../../convex/lib/gto/archetypeClassifier";
import { traceHand, formatHandTrace, type HandTrace } from "./handTraceRunner";

const OUTPUT_DIR = join(__dirname, "output");

function ensureOutputDir() {
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

function writeTrace(name: string, trace: HandTrace) {
  ensureOutputDir();
  // Write JSON for programmatic analysis
  writeFileSync(
    join(OUTPUT_DIR, `${name}.json`),
    JSON.stringify(trace, null, 2),
    "utf-8",
  );
  // Write human-readable text
  writeFileSync(
    join(OUTPUT_DIR, `${name}.txt`),
    formatHandTrace(trace),
    "utf-8",
  );
}

describe("Capture Hand Traces", () => {
  const scenarios: Array<{ name: string; archetypeId: ArchetypeId; seed: number }> = [
    // Flop textures — diverse board types
    { name: "ace_high_dry", archetypeId: "ace_high_dry_rainbow", seed: 42 },
    { name: "two_tone_connected", archetypeId: "two_tone_connected", seed: 100 },
    { name: "monotone", archetypeId: "monotone", seed: 77 },
    { name: "paired_board", archetypeId: "paired_boards", seed: 55 },
    { name: "rainbow_connected", archetypeId: "rainbow_connected", seed: 88 },

    // Preflop — different spots
    { name: "rfi_opening", archetypeId: "rfi_opening", seed: 200 },
    { name: "bb_defense", archetypeId: "bb_defense_vs_rfi", seed: 150 },
    { name: "three_bet_pot", archetypeId: "three_bet_pots", seed: 300 },

    // Postflop principles
    { name: "cbet_decision", archetypeId: "cbet_sizing_frequency", seed: 111 },
    { name: "turn_barrel", archetypeId: "turn_barreling", seed: 222 },
  ];

  for (const { name, archetypeId, seed } of scenarios) {
    it(`captures trace: ${name}`, () => {
      const trace = traceHand({ archetypeId, seed });

      // Print to console
      console.log("\n" + formatHandTrace(trace));

      // Write to disk
      writeTrace(name, trace);

      // Structural sanity only — NOT analysis
      expect(trace.seatProfiles.length).toBeGreaterThan(0);
      // Streets may be 0 if hand ends during blinds (all fold preflop before any traced action)
      expect(trace.streets.length).toBeGreaterThanOrEqual(0);

      // Report
      const totalDecisions = trace.streets.reduce((sum, s) => sum + s.decisions.length, 0);
      console.log(`  → ${trace.streets.length} streets, ${totalDecisions} decisions, ${trace.flags.length} flags`);
      if (trace.flags.length > 0) {
        console.log(`  → Flags: ${trace.flags.join(", ")}`);
      }
    });
  }
});
