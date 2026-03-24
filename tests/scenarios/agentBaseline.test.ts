/**
 * Agent Baseline — text-reading strategy for educational effectiveness.
 *
 * Tests whether a sophisticated text-reading student (triangulating
 * board narrative, coaching advice, narrative prompts, hand strength,
 * and position) can beat the simpler coded students.
 *
 * Target baselines:
 *   Random:    52%
 *   Coaching:  70%
 *   Narrative: 83%
 *   Agent:     ???  (goal: beat 83%)
 *
 * Run: pnpm test -- tests/scenarios/agentBaseline.test.ts
 */

import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import type { GtoAction } from "../../convex/lib/gto/tables/types";
import type { NarrativeIntentId } from "../../convex/lib/gto/narrativePrompts";
import {
  runLearnerSession,
  randomStudent,
  coachingStudent,
  narrativeStudent,
  formatLearnerResult,
  type StudentView,
  type StudentDecision,
} from "./simulatedLearner";

const OUTPUT_DIR = join(__dirname, "output");

function ensureOutputDir() {
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

// ═══════════════════════════════════════════════════════
// AGENT STUDENT — triangulates all available signals
// ═══════════════════════════════════════════════════════

/**
 * Sophisticated text-reading student that triangulates ALL available signals.
 *
 * Key insight from analysis: the narrative prompt's top option is already
 * very well-calibrated to GTO. The agent's job is to use narrative as the
 * PRIMARY signal, then use coaching consensus and board context to refine
 * the specific action SIZE (bet_small vs bet_medium) and to break ties
 * in ambiguous spots.
 *
 * Signal priority:
 * 1. Narrative prompt (top option mapped action) — primary decision
 * 2. Coaching consensus — action family validation + sizing refinement
 * 3. GTO coaching specifically — sizing guidance
 * 4. Board context from headline/question — confirms or overrides
 * 5. Hand strength tier — sanity check
 * 6. Previous feedback — learn from mistakes
 */
function createAgentStudent(): (view: StudentView) => StudentDecision {
  // Memory: track corrected category→action mappings
  const corrections = new Map<string, GtoAction>();

  return (view: StudentView): StudentDecision => {
    const {
      handCategory,
      relativeStrength,
      isInPosition,
      coaching,
      narrativePrompt,
      availableActions,
      boardNarrative,
      archetypeId,
      previousFeedback,
      isMixedStrategy,
    } = view;

    // ── Step 0: Learn from previous feedback ──
    if (previousFeedback) {
      if (previousFeedback.verdict === "mistake" || previousFeedback.verdict === "blunder") {
        // Store correction for this category
        // Use a general key so it applies to similar hands
        const prevCatKey = `${archetypeId}:prev`;
        corrections.set(prevCatKey, previousFeedback.optimalAction as GtoAction);
      }
    }

    // ── Step 1: Narrative prompt — PRIMARY signal ──
    const topNarrative = narrativePrompt.options[0];
    const narrativeAction = topNarrative?.mappedActions.find((a) =>
      availableActions.includes(a),
    );

    // ── Step 2: Coaching analysis ──
    const gtoAdvice = coaching.find((c) => c.profileName === "GTO");
    const gtoCoachAction = gtoAdvice?.action;

    // Count coaching votes by action family
    const familyVotes = new Map<string, number>();
    const exactVotes = new Map<string, number>();
    for (const c of coaching) {
      const family = c.action.replace(/_.*/, "");
      familyVotes.set(family, (familyVotes.get(family) ?? 0) + 1);
      exactVotes.set(c.action, (exactVotes.get(c.action) ?? 0) + 1);
    }

    // Get coaching consensus family
    let topFamily = "";
    let topFamilyCount = 0;
    for (const [fam, cnt] of familyVotes) {
      if (cnt > topFamilyCount) { topFamilyCount = cnt; topFamily = fam; }
    }
    const hasConsensus = topFamilyCount >= 3;

    // ── Step 3: Determine action family from narrative ──
    // The narrative's mapped action tells us the ACTION FAMILY (bet, check, fold)
    // Coaching tells us the SIZING (small, medium, large)
    let chosenAction: GtoAction;
    let reasoning: string;
    const chosenNarrative = topNarrative?.id ?? null;

    if (narrativeAction) {
      // Start with narrative's action
      chosenAction = narrativeAction;
      reasoning = `Narrative "${topNarrative?.label}" → ${narrativeAction}`;

      // ── Step 4: Refine sizing using coaching ──
      const narrativeFamily = narrativeAction.replace(/_.*/, "");

      // If narrative says "bet" but doesn't specify size, use coaching to pick size
      if (narrativeFamily === "bet" && gtoCoachAction) {
        const gtoFamily = gtoCoachAction.replace(/_.*/, "");
        if (gtoFamily === "bet") {
          // GTO coaching agrees we should bet — use their sizing
          const gtoSizedAction = availableActions.find((a) => a === gtoCoachAction);
          if (gtoSizedAction) {
            chosenAction = gtoSizedAction;
            reasoning += ` [sizing from GTO coaching: ${gtoSizedAction}]`;
          }
        }
      }

      // If coaching has strong consensus on a different action family,
      // and narrative fitness is low, defer to coaching
      if (hasConsensus && topFamily !== narrativeFamily) {
        const narrativeFitness = topNarrative?.fitness ?? 0;
        if (narrativeFitness < 0.6) {
          // Low-confidence narrative — coaching overrides
          const coachAction = availableActions.find((a) => a.startsWith(topFamily));
          if (coachAction) {
            chosenAction = coachAction;
            reasoning += ` [overridden by strong coaching consensus (${topFamilyCount}/5 → ${topFamily})]`;
          }
        }
      }
    } else {
      // No narrative-mapped action available — fall back to coaching
      if (gtoCoachAction && availableActions.includes(gtoCoachAction as GtoAction)) {
        chosenAction = gtoCoachAction as GtoAction;
        reasoning = `No narrative action → GTO coaching: ${gtoCoachAction}`;
      } else if (hasConsensus) {
        const coachAction = availableActions.find((a) => a.startsWith(topFamily));
        chosenAction = coachAction ?? availableActions[0];
        reasoning = `No narrative action → coaching consensus: ${topFamily}`;
      } else {
        chosenAction = availableActions[0];
        reasoning = `No clear signal → default first action`;
      }
    }

    // ── Step 5: Cross-validate with hand strength ──
    // Sanity check: don't fold strong hands or bluff with monsters
    const strongCats = new Set(["sets_plus", "two_pair", "premium_pair", "overpair", "top_pair_top_kicker"]);
    if (strongCats.has(handCategory) && chosenAction === "fold") {
      // Never fold strong hands
      const betAction = availableActions.find((a) => a.startsWith("bet") || a.startsWith("raise"));
      chosenAction = betAction ?? (availableActions.includes("call") ? "call" : availableActions[0]);
      reasoning += ` [sanity: never fold ${handCategory}]`;
    }

    // ── Step 6: Ensure action is available ──
    if (!availableActions.includes(chosenAction)) {
      if (narrativeAction && availableActions.includes(narrativeAction)) {
        chosenAction = narrativeAction;
      } else {
        chosenAction = availableActions[0];
      }
      reasoning += ` [fallback: ${chosenAction}]`;
    }

    return {
      action: chosenAction,
      narrativeChoice: chosenNarrative as NarrativeIntentId | null,
      reasoning,
    };
  };
}

// ═══════════════════════════════════════════════════════
// FORMAT STUDENT VIEW (what a human/AI would read)
// ═══════════════════════════════════════════════════════

function formatStudentView(view: StudentView): string {
  const lines: string[] = [];

  lines.push(`═══ HAND ${view.handNumber} ═══`);
  lines.push(`Archetype: ${view.archetypeDescription} (${view.archetypeId})`);
  lines.push(`Board: ${view.communityCards.join(" ") || "(preflop)"}`);
  lines.push(`Your cards: ${view.heroCards.join(" ")}`);
  lines.push(`Hand: ${view.handDescription} (${view.handCategory}, strength: ${(view.relativeStrength * 100).toFixed(0)}%)`);
  lines.push(`Position: ${view.isInPosition ? "In Position (IP)" : "Out of Position (OOP)"}`);
  lines.push("");

  lines.push(`BOARD NARRATIVE:`);
  lines.push(`  "${view.boardNarrative.headline}"`);
  lines.push(`  ${view.boardNarrative.context}`);
  lines.push(`  Question: "${view.boardNarrative.question}"`);
  lines.push("");

  lines.push(`COACHING ADVICE:`);
  for (const c of view.coaching) {
    const liner = c.narrativeOneLiner ? ` — "${c.narrativeOneLiner}"` : "";
    lines.push(`  ${c.profileName}: ${c.action}${liner}`);
  }
  lines.push("");

  lines.push(`NARRATIVE OPTIONS ("What's your story here?"):`);
  for (const opt of view.narrativePrompt.options) {
    lines.push(`  [${opt.id}] "${opt.label}" (fitness: ${(opt.fitness * 100).toFixed(0)}%)`);
    lines.push(`    → maps to: ${opt.mappedActions.join(", ")}`);
  }
  lines.push("");

  lines.push(`AVAILABLE ACTIONS: ${view.availableActions.join(", ")}`);
  // Note: frequencies intentionally excluded (quiz mode)

  if (view.previousFeedback) {
    lines.push("");
    lines.push(`PREVIOUS HAND FEEDBACK:`);
    lines.push(`  You chose: ${view.previousFeedback.userAction} → ${view.previousFeedback.verdict}`);
    lines.push(`  Optimal was: ${view.previousFeedback.optimalAction} (${(view.previousFeedback.optimalFrequency * 100).toFixed(0)}%)`);
    lines.push(`  "${view.previousFeedback.narrativeFeedback.principleConnection}"`);
  }

  return lines.join("\n");
}

// ═══════════════════════════════════════════════════════
// TEST
// ═══════════════════════════════════════════════════════

describe("Agent Baseline — Text-Reading Strategy", () => {
  it("runs 15 hands and compares agent to coded students", () => {
    ensureOutputDir();

    const archetypeId = "ace_high_dry_rainbow" as const;
    const numHands = 15;
    const seed = 42;

    // Run all strategies
    const agentResult = runLearnerSession(archetypeId, numHands, createAgentStudent(), seed);
    const randomResult = runLearnerSession(archetypeId, numHands, randomStudent, seed);
    const coachingResult = runLearnerSession(archetypeId, numHands, coachingStudent, seed);
    const narrativeResult = runLearnerSession(archetypeId, numHands, narrativeStudent, seed);

    // Build report
    const report: string[] = [];
    report.push("═══════════════════════════════════════════════════════");
    report.push("  AGENT BASELINE — TEXT-READING STRATEGY RESULTS");
    report.push("═══════════════════════════════════════════════════════");
    report.push("");
    report.push(`Archetype: ${archetypeId}`);
    report.push(`Hands: ${numHands}`);
    report.push(`Seed: ${seed}`);
    report.push("");

    // Comparison table
    report.push("── ACCURACY COMPARISON ──");
    report.push(`  Random:    ${(randomResult.accuracy * 100).toFixed(0)}%`);
    report.push(`  Coaching:  ${(coachingResult.accuracy * 100).toFixed(0)}%`);
    report.push(`  Narrative: ${(narrativeResult.accuracy * 100).toFixed(0)}%`);
    report.push(`  Agent:     ${(agentResult.accuracy * 100).toFixed(0)}%`);
    report.push("");

    // Learning curves
    report.push("── LEARNING CURVES (rolling 3-hand) ──");
    report.push(`  Random:    ${randomResult.learningCurve.map((v) => `${(v * 100).toFixed(0)}%`).join(" → ")}`);
    report.push(`  Coaching:  ${coachingResult.learningCurve.map((v) => `${(v * 100).toFixed(0)}%`).join(" → ")}`);
    report.push(`  Narrative: ${narrativeResult.learningCurve.map((v) => `${(v * 100).toFixed(0)}%`).join(" → ")}`);
    report.push(`  Agent:     ${agentResult.learningCurve.map((v) => `${(v * 100).toFixed(0)}%`).join(" → ")}`);
    report.push("");

    // Per-hand detail for agent
    report.push("── AGENT HAND-BY-HAND ──");
    report.push("");

    for (const hand of agentResult.hands) {
      const v = hand.view;
      const d = hand.decision;
      const f = hand.feedback;
      const verdictMark = f.verdict === "optimal" ? "[OK]"
        : f.verdict === "acceptable" ? "[~~]"
          : "[XX]";

      report.push(`Hand ${v.handNumber}: ${v.heroCards.join(" ")} on ${v.communityCards.join(" ") || "(preflop)"}`);
      report.push(`  ${v.handDescription} | ${v.isInPosition ? "IP" : "OOP"} | strength: ${(v.relativeStrength * 100).toFixed(0)}%`);
      report.push(`  Headline: "${v.boardNarrative.headline}"`);
      report.push(`  Question: "${v.boardNarrative.question}"`);
      report.push(`  Coaching: ${v.coaching.map((c) => `${c.profileName}=${c.action}`).join(", ")}`);
      report.push(`  Top narrative: "${v.narrativePrompt.options[0]?.label}" (fitness ${((v.narrativePrompt.options[0]?.fitness ?? 0) * 100).toFixed(0)}%)`);
      report.push(`  Agent chose: ${d.action}`);
      report.push(`  Reasoning: ${d.reasoning}`);
      report.push(`  ${verdictMark} ${f.verdict} | Optimal: ${f.optimalAction} (${(f.optimalFrequency * 100).toFixed(0)}%) | EV loss: ${f.evLoss.toFixed(2)} BB`);
      if (f.verdict !== "optimal" && f.verdict !== "acceptable") {
        report.push(`  Feedback: "${f.narrativeFeedback.actionNarrative}"`);
        report.push(`  Principle: "${f.narrativeFeedback.principleConnection}"`);
      }
      report.push("");
    }

    // Verdict analysis
    const agentVerdicts = agentResult.hands.map((h) => h.feedback.verdict);
    const optimal = agentVerdicts.filter((v) => v === "optimal").length;
    const acceptable = agentVerdicts.filter((v) => v === "acceptable").length;
    const mistake = agentVerdicts.filter((v) => v === "mistake").length;
    const blunder = agentVerdicts.filter((v) => v === "blunder").length;

    report.push("── VERDICT BREAKDOWN ──");
    report.push(`  Optimal:    ${optimal}/${numHands}`);
    report.push(`  Acceptable: ${acceptable}/${numHands}`);
    report.push(`  Mistake:    ${mistake}/${numHands}`);
    report.push(`  Blunder:    ${blunder}/${numHands}`);
    report.push("");

    // Beat target?
    const beatNarrative = agentResult.accuracy > narrativeResult.accuracy;
    report.push("── CONCLUSION ──");
    report.push(`  Agent (${(agentResult.accuracy * 100).toFixed(0)}%) ${beatNarrative ? "BEATS" : "does NOT beat"} Narrative (${(narrativeResult.accuracy * 100).toFixed(0)}%)`);
    if (beatNarrative) {
      report.push(`  The text-reading triangulation strategy outperforms simple narrative following!`);
    } else {
      const gap = narrativeResult.accuracy - agentResult.accuracy;
      report.push(`  Gap: ${(gap * 100).toFixed(0)}% behind narrative. Analysis of mistakes needed.`);
    }

    const reportText = report.join("\n");
    console.log("\n" + reportText);
    writeFileSync(join(OUTPUT_DIR, "agent_baseline.txt"), reportText, "utf-8");

    // Also write detailed student views for analysis
    const viewsReport: string[] = [];
    viewsReport.push("═══ STUDENT VIEWS (what the agent reads) ═══\n");
    for (const hand of agentResult.hands) {
      viewsReport.push(formatStudentView(hand.view));
      viewsReport.push(`\n--- AGENT DECISION: ${hand.decision.action} (${hand.decision.reasoning})`);
      viewsReport.push(`--- RESULT: ${hand.feedback.verdict} | Optimal: ${hand.feedback.optimalAction}\n`);
      viewsReport.push("─".repeat(60) + "\n");
    }
    writeFileSync(join(OUTPUT_DIR, "agent_views.txt"), viewsReport.join("\n"), "utf-8");

    // Assertions
    expect(agentResult.accuracy).toBeGreaterThan(randomResult.accuracy);
    expect(agentResult.handsPlayed).toBe(numHands);
  }, 60000);
});
