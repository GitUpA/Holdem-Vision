/**
 * Snapshot Quality Analysis — programmatic hands evaluated for coherence.
 *
 * Uses HandStepper to play hands, captures FullSnapshot at each decision,
 * then evaluates whether the system output is:
 *   1. Internally consistent (commentary matches GTO, action stories match hand strength)
 *   2. Educationally sound (narratives make poker sense)
 *   3. Non-contradictory (all components agree on direction)
 *
 * Writes detailed reports to data/quality/ for human review.
 */
import { describe, it, expect } from "vitest";
import { HandStepper } from "../../convex/lib/analysis/handStepper";
import { formatSnapshot, type FullSnapshot } from "../../convex/lib/analysis/snapshot";
import { cardFromString } from "../../convex/lib/primitives/card";
import * as fs from "fs";
import * as path from "path";

const QUALITY_DIR = path.join(process.cwd(), "data", "quality");

function ensureDir() {
  if (!fs.existsSync(QUALITY_DIR)) fs.mkdirSync(QUALITY_DIR, { recursive: true });
}

interface QualityIssue {
  severity: "error" | "warning" | "info";
  component: string;
  message: string;
}

function analyzeSnapshot(snap: FullSnapshot, label: string): QualityIssue[] {
  const issues: QualityIssue[] = [];

  // ── 1. Commentary should have a recommendation ──
  if (snap.commentary) {
    if (!snap.commentary.recommendedAction) {
      issues.push({ severity: "warning", component: "commentary", message: "No recommended action" });
    }

    // Commentary confidence should match GTO clarity
    if (snap.gtoFrequencies) {
      const maxFreq = Math.max(...Object.values(snap.gtoFrequencies).map(v => v ?? 0));
      if (maxFreq > 0.7 && snap.commentary.confidence !== "clear") {
        issues.push({ severity: "warning", component: "commentary", message: `GTO is clear (${(maxFreq*100).toFixed(0)}%) but commentary says "${snap.commentary.confidence}"` });
      }
    }
  } else {
    issues.push({ severity: "error", component: "commentary", message: "No commentary generated" });
  }

  // ── 2. GTO recommendation should exist ──
  if (!snap.gtoFrequencies) {
    issues.push({ severity: "warning", component: "gto", message: "No GTO frequencies available" });
  }

  // ── 3. Hand strength should make sense ──
  if (snap.handStrength.relativeStrength > 0.7 && snap.handStrength.category === "air") {
    issues.push({ severity: "error", component: "handStrength", message: `High strength (${snap.handStrength.relativeStrength}) but category is "air"` });
  }

  // ── 4. Action stories should cover all legal actions ──
  const legalCount = [
    snap.legalActions.canFold,
    snap.legalActions.canCheck,
    snap.legalActions.canCall && snap.legalActions.callAmount > 0,
    snap.legalActions.canBet,
    snap.legalActions.canRaise,
  ].filter(Boolean).length;

  if (snap.actionStories.length !== legalCount) {
    issues.push({ severity: "warning", component: "actionStories", message: `${snap.actionStories.length} stories for ${legalCount} legal actions` });
  }

  // ── 5. Commentary and GTO should agree on direction ──
  if (snap.commentary?.recommendedAction && snap.gtoOptimalAction) {
    const commentaryDir = actionDirection(snap.commentary.recommendedAction);
    const gtoDir = actionDirection(snap.gtoOptimalAction);
    if (commentaryDir !== gtoDir && commentaryDir !== "neutral" && gtoDir !== "neutral") {
      issues.push({ severity: "warning", component: "consistency", message: `Commentary says "${snap.commentary.recommendedAction}" (${commentaryDir}) but GTO says "${snap.gtoOptimalAction}" (${gtoDir})` });
    }
  }

  // ── 6. Opponent stories should have reasonable equity ──
  for (const opp of snap.opponentStories) {
    if (opp.equityVsRange < 0 || opp.equityVsRange > 1) {
      issues.push({ severity: "error", component: "opponentStory", message: `Invalid equity ${opp.equityVsRange} for ${opp.position}` });
    }
    if (opp.rangePercent < 0 || opp.rangePercent > 100) {
      issues.push({ severity: "error", component: "opponentStory", message: `Invalid range ${opp.rangePercent}% for ${opp.position}` });
    }
  }

  // ── 7. Archetype should exist ──
  if (!snap.archetype) {
    issues.push({ severity: "warning", component: "archetype", message: "No archetype classification" });
  }

  // ── 8. Pot should be positive ──
  if (snap.pot <= 0) {
    issues.push({ severity: "error", component: "gameState", message: `Pot is ${snap.pot}` });
  }

  // ── 9. Board texture should exist postflop ──
  if (snap.communityCards.length >= 3 && !snap.boardTexture) {
    issues.push({ severity: "error", component: "boardTexture", message: "No board texture for postflop" });
  }

  // ── 10. Suited hand should NOT be "air" ──
  if (snap.handStrength.description.includes("suited") && snap.handStrength.category === "air") {
    issues.push({ severity: "warning", component: "handStrength", message: `Suited hand categorized as air: ${snap.handStrength.description}` });
  }

  return issues;
}

function actionDirection(action: string): "aggressive" | "passive" | "fold" | "neutral" {
  if (action === "fold") return "fold";
  if (action === "check" || action === "call") return "passive";
  if (action.startsWith("bet") || action.startsWith("raise")) return "aggressive";
  return "neutral";
}

// ═══════════════════════════════════════════════════════
// TEST SCENARIOS
// ═══════════════════════════════════════════════════════

const SCENARIOS: Array<{
  name: string;
  heroCards: [string, string];
  description: string;
}> = [
  { name: "AA_premium", heroCards: ["As", "Ah"], description: "Premium pair — should always recommend aggressive action" },
  { name: "72o_junk", heroCards: ["7h", "2d"], description: "Worst hand — should fold facing any raise" },
  { name: "AKs_strong", heroCards: ["Ac", "Kc"], description: "Strong suited — should raise or call" },
  { name: "94s_suited_junk", heroCards: ["9c", "4c"], description: "Suited junk — should fold but category should note suitedness" },
  { name: "QQ_overpair", heroCards: ["Qs", "Qc"], description: "Strong pair — raise preflop, postflop depends on board" },
  { name: "T9s_connector", heroCards: ["Ts", "9s"], description: "Suited connector — playable, position matters" },
  { name: "KJo_broadway", heroCards: ["Kd", "Jh"], description: "Broadway offsuit — marginal, position dependent" },
  { name: "55_small_pair", heroCards: ["5h", "5d"], description: "Small pair — set mining hand" },
  { name: "A2o_weakace", heroCards: ["Ad", "2h"], description: "Weak ace offsuit — usually fold facing raises" },
  { name: "JTs_premium_connector", heroCards: ["Jh", "Th"], description: "Premium suited connector — always playable" },
];

describe("Snapshot Quality Analysis", { timeout: 120000 }, () => {
  it("analyzes 10 hands and produces quality report", () => {
    ensureDir();
    const allIssues: Array<{ scenario: string; issues: QualityIssue[]; snapshot: string }> = [];
    let totalErrors = 0;
    let totalWarnings = 0;

    for (const scenario of SCENARIOS) {
      const stepper = new HandStepper({ debug: false });
      const step = stepper.deal([
        cardFromString(scenario.heroCards[0]),
        cardFromString(scenario.heroCards[1]),
      ]);

      if (!step) {
        allIssues.push({
          scenario: scenario.name,
          issues: [{ severity: "error", component: "stepper", message: "No decision point reached" }],
          snapshot: "N/A",
        });
        totalErrors++;
        continue;
      }

      const issues = analyzeSnapshot(step.snapshot, scenario.name);
      const errors = issues.filter(i => i.severity === "error").length;
      const warnings = issues.filter(i => i.severity === "warning").length;
      totalErrors += errors;
      totalWarnings += warnings;

      allIssues.push({
        scenario: scenario.name,
        issues,
        snapshot: step.formatted,
      });
    }

    // Write report
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        scenarios: SCENARIOS.length,
        totalErrors,
        totalWarnings,
        passRate: `${((SCENARIOS.length - allIssues.filter(a => a.issues.some(i => i.severity === "error")).length) / SCENARIOS.length * 100).toFixed(0)}%`,
      },
      scenarios: allIssues.map(a => ({
        name: a.scenario,
        errors: a.issues.filter(i => i.severity === "error").length,
        warnings: a.issues.filter(i => i.severity === "warning").length,
        issues: a.issues,
        snapshot: a.snapshot,
      })),
    };

    fs.writeFileSync(
      path.join(QUALITY_DIR, "quality-report.json"),
      JSON.stringify(report, null, 2),
    );

    // Log summary
    console.log(`\n=== QUALITY REPORT ===`);
    console.log(`Scenarios: ${SCENARIOS.length}`);
    console.log(`Errors: ${totalErrors}`);
    console.log(`Warnings: ${totalWarnings}`);
    console.log(`Pass rate: ${report.summary.passRate}`);
    for (const s of allIssues) {
      if (s.issues.length > 0) {
        console.log(`\n${s.scenario}:`);
        for (const i of s.issues) {
          console.log(`  [${i.severity}] ${i.component}: ${i.message}`);
        }
      } else {
        console.log(`\n${s.scenario}: ✓ CLEAN`);
      }
    }

    // Assert no errors (warnings are OK for now)
    expect(totalErrors).toBe(0);
  });
});
