/**
 * Batch Validation — runs many scenarios across ALL archetypes,
 * aggregates flags, and writes summary to disk.
 *
 * Run: pnpm test -- tests/scenarios/batchValidation.test.ts
 * Output: tests/scenarios/output/batch_summary.txt
 *         tests/scenarios/output/batch_summary.json
 */

import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { ALL_ARCHETYPE_IDS } from "../../convex/lib/gto/archetypeClassifier";
import { traceHand, formatHandTrace, type HandTrace } from "./handTraceRunner";

const OUTPUT_DIR = join(__dirname, "output");
const HANDS_PER_ARCHETYPE = 10;

const ALL_ARCHETYPES = ALL_ARCHETYPE_IDS;

function ensureOutputDir() {
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

interface BatchStats {
  totalHands: number;
  totalDecisions: number;
  handsReachedTarget: number;
  handsCrashed: number;
  flagCounts: Record<string, number>;
  perArchetype: Record<string, {
    hands: number;
    decisions: number;
    reachedTarget: number;
    crashed: number;
    flags: string[];
    avgStreets: number;
    narrativeIssues: string[];
  }>;
  narrativeAnalysis: {
    totalNarratives: number;
    genericNarratives: number;  // "Decides to continue" / "Decides to fold"
    strengthMismatches: number; // "hand strength justifies" at low strength
    repeatedPerHand: number;    // same narrative repeated across streets in one hand
    uniqueNarrativeTexts: number;
  };
  coachingAnalysis: {
    totalCoachingPoints: number;
    solverDisagreements: number;
    allProfilesAgree: number;
  };
}

function analyzeNarrativeQuality(traces: HandTrace[]): BatchStats["narrativeAnalysis"] {
  let totalNarratives = 0;
  let genericNarratives = 0;
  let strengthMismatches = 0;
  let repeatedPerHand = 0;
  const uniqueTexts = new Set<string>();

  for (const trace of traces) {
    const handNarratives = new Map<string, Set<string>>(); // seatIndex -> set of narratives

    for (const street of trace.streets) {
      for (const d of street.decisions) {
        if (!d.narrativeOneLiner) continue;
        totalNarratives++;
        uniqueTexts.add(d.narrativeOneLiner);

        // Generic check
        if (
          d.narrativeOneLiner === "Decides to continue" ||
          d.narrativeOneLiner === "Decides to fold" ||
          d.narrativeOneLiner === "Decides to check" ||
          d.narrativeOneLiner === "Decides to call" ||
          d.narrativeOneLiner === "Decides to bet" ||
          d.narrativeOneLiner === "Decides to raise"
        ) {
          genericNarratives++;
        }

        // Strength mismatch
        if (
          d.narrativeOneLiner.toLowerCase().includes("hand strength justifies") &&
          d.handStrength !== undefined &&
          d.handStrength < 0.3
        ) {
          strengthMismatches++;
        }

        // Track per-seat narratives for repetition check
        const key = `${d.seatIndex}`;
        if (!handNarratives.has(key)) handNarratives.set(key, new Set());
        handNarratives.get(key)!.add(d.narrativeOneLiner);
      }
    }

    // Check for repetition: if a seat has fewer unique narratives than decisions
    for (const street of trace.streets) {
      for (const d of street.decisions) {
        const key = `${d.seatIndex}`;
        const seatDecisionCount = trace.streets.reduce(
          (sum, s) => sum + s.decisions.filter((dd) => dd.seatIndex === d.seatIndex).length,
          0,
        );
        const uniqueCount = handNarratives.get(key)?.size ?? 0;
        if (seatDecisionCount > 2 && uniqueCount === 1) {
          repeatedPerHand++;
          break; // count once per seat per hand
        }
      }
    }
  }

  return {
    totalNarratives,
    genericNarratives,
    strengthMismatches,
    repeatedPerHand,
    uniqueNarrativeTexts: uniqueTexts.size,
  };
}

describe("Batch Validation — All Archetypes", () => {
  it("runs 100 hands and produces validation report", () => {
    ensureOutputDir();

    const allTraces: HandTrace[] = [];
    const stats: BatchStats = {
      totalHands: 0,
      totalDecisions: 0,
      handsReachedTarget: 0,
      handsCrashed: 0,
      flagCounts: {},
      perArchetype: {},
      narrativeAnalysis: {
        totalNarratives: 0,
        genericNarratives: 0,
        strengthMismatches: 0,
        repeatedPerHand: 0,
        uniqueNarrativeTexts: 0,
      },
      coachingAnalysis: {
        totalCoachingPoints: 0,
        solverDisagreements: 0,
        allProfilesAgree: 0,
      },
    };

    for (const archetypeId of ALL_ARCHETYPES) {
      const archStats = {
        hands: 0,
        decisions: 0,
        reachedTarget: 0,
        crashed: 0,
        flags: [] as string[],
        avgStreets: 0,
        narrativeIssues: [] as string[],
      };
      let totalStreets = 0;

      for (let i = 0; i < HANDS_PER_ARCHETYPE; i++) {
        const seed = 1000 + ALL_ARCHETYPES.indexOf(archetypeId) * 100 + i;
        try {
          const trace = traceHand({ archetypeId, seed });
          allTraces.push(trace);
          stats.totalHands++;
          archStats.hands++;

          const decisions = trace.streets.reduce((s, st) => s + st.decisions.length, 0);
          stats.totalDecisions += decisions;
          archStats.decisions += decisions;
          totalStreets += trace.streets.length;

          if (trace.outcome.reachedTargetStreet) {
            stats.handsReachedTarget++;
            archStats.reachedTarget++;
          }

          for (const flag of trace.flags) {
            const key = flag.split(":")[0];
            stats.flagCounts[key] = (stats.flagCounts[key] || 0) + 1;
            archStats.flags.push(flag);
          }

          // Coaching analysis
          for (const c of trace.coaching) {
            stats.coachingAnalysis.totalCoachingPoints++;
            const actions = new Set(c.profiles.map((p) => p.action));
            if (actions.size === 1) stats.coachingAnalysis.allProfilesAgree++;
            if (c.solverOptimalAction) {
              const gto = c.profiles.find((p) => p.name === "GTO");
              if (gto && gto.action !== c.solverOptimalAction) {
                const gtoAgg = gto.action.startsWith("bet") || gto.action === "raise";
                const solAgg = c.solverOptimalAction.startsWith("bet") || c.solverOptimalAction === "raise";
                if (gtoAgg !== solAgg && gto.action !== "fold" && c.solverOptimalAction !== "fold") {
                  stats.coachingAnalysis.solverDisagreements++;
                }
              }
            }
          }
        } catch (err) {
          stats.handsCrashed++;
          archStats.crashed++;
          archStats.flags.push(`CRASH:${err instanceof Error ? err.message.substring(0, 50) : "unknown"}`);
          stats.flagCounts["CRASH"] = (stats.flagCounts["CRASH"] || 0) + 1;
        }
      }

      archStats.avgStreets = archStats.hands > 0 ? totalStreets / archStats.hands : 0;
      stats.perArchetype[archetypeId] = archStats;
    }

    // Narrative analysis
    stats.narrativeAnalysis = analyzeNarrativeQuality(allTraces);

    // Build report
    const lines: string[] = [];
    lines.push("═══════════════════════════════════════════════════════════");
    lines.push("  BATCH VALIDATION REPORT");
    lines.push(`  ${stats.totalHands} hands across ${ALL_ARCHETYPES.length} archetypes`);
    lines.push("═══════════════════════════════════════════════════════════");
    lines.push("");
    lines.push("── OVERVIEW ──");
    lines.push(`Total hands:      ${stats.totalHands}`);
    lines.push(`Total decisions:  ${stats.totalDecisions}`);
    lines.push(`Reached target:   ${stats.handsReachedTarget} (${((stats.handsReachedTarget / stats.totalHands) * 100).toFixed(0)}%)`);
    lines.push(`Crashed:          ${stats.handsCrashed}`);
    lines.push("");

    lines.push("── FLAGS ──");
    const sortedFlags = Object.entries(stats.flagCounts).sort(([, a], [, b]) => b - a);
    if (sortedFlags.length === 0) {
      lines.push("  None!");
    }
    for (const [flag, count] of sortedFlags) {
      lines.push(`  ${flag}: ${count}`);
    }
    lines.push("");

    lines.push("── NARRATIVE QUALITY ──");
    const na = stats.narrativeAnalysis;
    lines.push(`Total narratives:      ${na.totalNarratives}`);
    lines.push(`Unique texts:          ${na.uniqueNarrativeTexts}`);
    lines.push(`Generic fallbacks:     ${na.genericNarratives} (${na.totalNarratives > 0 ? ((na.genericNarratives / na.totalNarratives) * 100).toFixed(1) : 0}%)`);
    lines.push(`Strength mismatches:   ${na.strengthMismatches}`);
    lines.push(`Repeated per hand:     ${na.repeatedPerHand} seats with same narrative every street`);
    lines.push("");

    lines.push("── COACHING QUALITY ──");
    const ca = stats.coachingAnalysis;
    lines.push(`Total coaching points: ${ca.totalCoachingPoints}`);
    lines.push(`Solver disagreements:  ${ca.solverDisagreements} (direction mismatch)`);
    lines.push(`All profiles agree:    ${ca.allProfilesAgree}`);
    lines.push("");

    lines.push("── PER ARCHETYPE ──");
    for (const [id, a] of Object.entries(stats.perArchetype)) {
      const reachPct = a.hands > 0 ? ((a.reachedTarget / a.hands) * 100).toFixed(0) : "N/A";
      const flagStr = a.flags.length > 0 ? ` [${a.flags.join(", ")}]` : "";
      lines.push(
        `  ${id.padEnd(28)} ${a.hands}h ${a.decisions}d ${a.avgStreets.toFixed(1)}st reach:${reachPct}%${a.crashed ? ` CRASH:${a.crashed}` : ""}${flagStr}`,
      );
    }
    lines.push("");

    const report = lines.join("\n");
    console.log("\n" + report);

    writeFileSync(join(OUTPUT_DIR, "batch_summary.txt"), report, "utf-8");
    writeFileSync(join(OUTPUT_DIR, "batch_summary.json"), JSON.stringify(stats, null, 2), "utf-8");

    // Assertions — these define "the system is working"
    expect(stats.handsCrashed).toBe(0);
    expect(stats.narrativeAnalysis.strengthMismatches).toBe(0);
    expect(stats.narrativeAnalysis.genericNarratives).toBeLessThan(stats.narrativeAnalysis.totalNarratives * 0.15); // <15% generic
    expect(stats.handsReachedTarget / stats.totalHands).toBeGreaterThan(0.5); // >50% reach target
  }, 120000); // 2 min timeout
});
