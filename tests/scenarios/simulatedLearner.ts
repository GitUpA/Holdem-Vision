/**
 * Simulated Learner — tests educational effectiveness.
 *
 * Orchestrates a drill session where an analysis agent acts as the
 * "student." The agent only sees what a real user would see (board
 * narrative, coaching, narrative prompts, available actions). After
 * deciding, the agent gets feedback (score, narrative alignment,
 * teaching principle).
 *
 * The test: do the agent's decisions improve over a session?
 * If the system teaches effectively, accuracy should trend upward.
 *
 * Pure TypeScript, zero React, zero Convex.
 */

import type { ArchetypeId } from "../../convex/lib/gto/archetypeClassifier";
import type { ActionFrequencies, GtoAction } from "../../convex/lib/gto/tables/types";
import type { HandCategorization } from "../../convex/lib/gto/handCategorizer";
import type { ArchetypeClassification } from "../../convex/lib/gto/archetypeClassifier";
import { executeDrillPipeline, type SpotSolution } from "../../convex/lib/gto/drillPipeline";
import { buildBoardNarrative, type BoardNarrative } from "../../convex/lib/gto/narrativeContext";
import { buildNarrativePrompt, type NarrativePrompt, type NarrativeIntentId } from "../../convex/lib/gto/narrativePrompts";
import { buildNarrativeFeedback, type NarrativeFeedback } from "../../convex/lib/gto/narrativeFeedback";
import { scoreAction, type ActionScore } from "../../convex/lib/gto/evScoring";
import { buildNarrativeSummary, type NarrativeSessionSummary, type NarrativeChoiceRecord } from "../../convex/lib/gto/narrativeSummary";
import { updateSkillProgress, type DrillResultForAssessment } from "../../convex/lib/skills/skillAssessment";
import type { SkillProgress } from "../../convex/lib/skills/skillTree";
import { analyzeBoard } from "../../convex/lib/opponents/engines/boardTexture";
import { coachingLens } from "../../convex/lib/analysis/coachingLens";
import type { CoachingValue } from "../../convex/lib/analysis/coachingLens";

// ═══════════════════════════════════════════════════════
// TYPES — what the student sees at each decision point
// ═══════════════════════════════════════════════════════

/** Everything a user would see BEFORE making a decision */
export interface StudentView {
  /** Hand number in the session */
  handNumber: number;
  /** Board narrative (headline, context, question) */
  boardNarrative: BoardNarrative;
  /** Hero's cards as strings */
  heroCards: string[];
  /** Community cards as strings */
  communityCards: string[];
  /** Hand category description */
  handDescription: string;
  handCategory: string;
  relativeStrength: number;
  /** Position */
  isInPosition: boolean;
  /** Archetype info */
  archetypeId: string;
  archetypeDescription: string;
  /** Available actions */
  availableActions: GtoAction[];
  /** Narrative prompt ("What's your story?") */
  narrativePrompt: NarrativePrompt;
  /** Coaching advice from all 5 profiles */
  coaching: {
    profileName: string;
    action: string;
    narrativeOneLiner?: string;
  }[];
  /** GTO solution frequencies (what the user sees in learn mode) */
  frequencies: ActionFrequencies;
  /** Is this a mixed strategy spot? */
  isMixedStrategy: boolean;
  /** Previous hand feedback (if any) — what the student learned last time */
  previousFeedback?: StudentFeedback;
}

/** Everything a user would see AFTER making a decision */
export interface StudentFeedback {
  /** What the user chose */
  userAction: GtoAction;
  /** The verdict */
  verdict: string;
  /** EV loss */
  evLoss: number;
  /** What was optimal */
  optimalAction: string;
  optimalFrequency: number;
  /** Narrative feedback */
  narrativeFeedback: NarrativeFeedback;
  /** Was this a mixed strategy spot where both answers were valid? */
  wasCloseSpot: boolean;
}

/** Decision made by the simulated student */
export interface StudentDecision {
  action: GtoAction;
  narrativeChoice: NarrativeIntentId | null;
  /** The student's reasoning (for analysis) */
  reasoning: string;
}

/** Full session result */
export interface LearnerSessionResult {
  archetypeId: string;
  handsPlayed: number;
  /** Per-hand results */
  hands: {
    view: StudentView;
    decision: StudentDecision;
    feedback: StudentFeedback;
  }[];
  /** Session summary */
  summary: NarrativeSessionSummary;
  /** Skill progress after session */
  skillProgress: Record<string, SkillProgress>;
  /** Learning curve: accuracy per hand (rolling 3-hand window) */
  learningCurve: number[];
  /** Overall accuracy */
  accuracy: number;
  /** Did accuracy trend upward? */
  learningDetected: boolean;
}

// ═══════════════════════════════════════════════════════
// SEEDED RNG
// ═══════════════════════════════════════════════════════

function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// ═══════════════════════════════════════════════════════
// CARD HELPERS
// ═══════════════════════════════════════════════════════

import { cardToString } from "../../convex/lib/primitives/card";
import type { CardIndex } from "../../convex/lib/types/cards";

function cards(indices: CardIndex[]): string[] {
  return indices.map((c) => cardToString(c));
}

// ═══════════════════════════════════════════════════════
// MAIN ORCHESTRATOR
// ═══════════════════════════════════════════════════════

/**
 * Run a simulated learning session.
 *
 * @param archetypeId - which archetype to drill
 * @param numHands - how many hands to play
 * @param decisionFn - the "student" function that makes decisions given what it sees
 * @param seed - for reproducibility
 */
export function runLearnerSession(
  archetypeId: ArchetypeId,
  numHands: number,
  decisionFn: (view: StudentView) => StudentDecision,
  seed = 42,
): LearnerSessionResult {
  const rng = seededRng(seed);
  const hands: LearnerSessionResult["hands"] = [];
  const scores: ActionScore[] = [];
  const narrativeChoices: NarrativeChoiceRecord[] = [];
  let previousFeedback: StudentFeedback | undefined;
  let skillProgress: Record<string, SkillProgress> = {};

  for (let i = 0; i < numHands; i++) {
    // 1. Deal a hand
    const result = executeDrillPipeline(archetypeId, rng);
    const { deal, state, solution } = result;

    if (!solution) continue;

    // 2. Build the student view (only what a user would see)
    const boardTexture = deal.communityCards.length >= 3
      ? analyzeBoard(deal.communityCards)
      : undefined;

    const boardNarrative = buildBoardNarrative(
      deal.archetype,
      deal.handCategory,
      boardTexture,
      deal.isInPosition,
    );

    const narrativePrompt = buildNarrativePrompt(
      deal.handCategory,
      deal.isInPosition,
      deal.archetype.category === "preflop",
      solution.frequencies,
    );

    // Get coaching
    let coaching: StudentView["coaching"] = [];
    try {
      const coachResult = coachingLens.analyze({
        heroCards: deal.heroCards,
        heroSeatIndex: deal.heroSeatIndex,
        communityCards: deal.communityCards,
        deadCards: [],
        opponents: [],
        street: deal.archetype.category === "preflop" ? "preflop" : "flop",
        gameState: state,
      });
      const cv = coachResult.value as CoachingValue | undefined;
      if (cv) {
        coaching = cv.advices.map((a) => ({
          profileName: a.profileName,
          action: a.actionType,
          narrativeOneLiner: a.narrative?.oneLiner,
        }));
      }
    } catch {
      // coaching unavailable
    }

    // Check mixed strategy
    const sortedFreqs = Object.entries(solution.frequencies)
      .filter(([, v]) => (v ?? 0) > 0.01)
      .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0));
    const isMixedStrategy = sortedFreqs.length >= 2
      && (sortedFreqs[1][1] ?? 0) >= 0.25
      && ((sortedFreqs[0][1] ?? 0) - (sortedFreqs[1][1] ?? 0)) < 0.20;

    const view: StudentView = {
      handNumber: i + 1,
      boardNarrative,
      heroCards: cards(deal.heroCards),
      communityCards: cards(deal.communityCards),
      handDescription: deal.handCategory.description,
      handCategory: deal.handCategory.category,
      relativeStrength: deal.handCategory.relativeStrength,
      isInPosition: deal.isInPosition,
      archetypeId: deal.archetype.archetypeId,
      archetypeDescription: deal.archetype.description,
      availableActions: solution.availableActions,
      narrativePrompt,
      coaching,
      frequencies: solution.frequencies,
      isMixedStrategy,
      previousFeedback,
    };

    // 3. Get student's decision
    const decision = decisionFn(view);

    // 4. Score the decision
    const drillStreet = deal.archetype.category === "preflop" ? "preflop" as const : "flop" as const;
    const score = scoreAction(
      deal.archetype,
      deal.handCategory,
      decision.action,
      state.pot.total / 2, // pot in BB (blinds = 1/2)
      deal.isInPosition,
      drillStreet,
    );

    if (!score) continue;
    scores.push(score);

    // 5. Build feedback
    const narrativeFeedback = buildNarrativeFeedback(
      decision.action,
      decision.narrativeChoice,
      solution.optimalAction,
      solution.optimalFrequency,
      solution.frequencies,
      deal.archetype.archetypeId,
    );

    const feedback: StudentFeedback = {
      userAction: decision.action,
      verdict: score.verdict,
      evLoss: score.evLoss,
      optimalAction: solution.optimalAction,
      optimalFrequency: solution.optimalFrequency,
      narrativeFeedback,
      wasCloseSpot: isMixedStrategy,
    };

    previousFeedback = feedback;

    // Track narrative choices
    narrativeChoices.push({
      choice: decision.narrativeChoice,
      action: decision.action,
      verdict: score.verdict,
    });

    hands.push({ view, decision, feedback });
  }

  // 6. Session summary
  const summary = buildNarrativeSummary(scores, narrativeChoices, archetypeId);

  // 7. Update skill progress
  const drillResults: DrillResultForAssessment[] = scores.map((s) => ({
    archetypeId,
    verdict: s.verdict as "optimal" | "acceptable" | "mistake" | "blunder",
  }));
  skillProgress = updateSkillProgress(skillProgress, drillResults);

  // 8. Compute learning curve (rolling 3-hand accuracy)
  const learningCurve: number[] = [];
  for (let i = 0; i < scores.length; i++) {
    const windowStart = Math.max(0, i - 2);
    const window = scores.slice(windowStart, i + 1);
    const windowAccuracy = window.filter((s) => s.verdict === "optimal" || s.verdict === "acceptable").length / window.length;
    learningCurve.push(windowAccuracy);
  }

  // Detect learning: compare first third vs last third accuracy
  const accuracy = scores.length > 0
    ? scores.filter((s) => s.verdict === "optimal" || s.verdict === "acceptable").length / scores.length
    : 0;

  let learningDetected = false;
  if (scores.length >= 6) {
    const third = Math.floor(scores.length / 3);
    const firstThird = scores.slice(0, third);
    const lastThird = scores.slice(-third);
    const firstAcc = firstThird.filter((s) => s.verdict === "optimal" || s.verdict === "acceptable").length / firstThird.length;
    const lastAcc = lastThird.filter((s) => s.verdict === "optimal" || s.verdict === "acceptable").length / lastThird.length;
    learningDetected = lastAcc > firstAcc + 0.05; // 5% improvement threshold
  }

  return {
    archetypeId,
    handsPlayed: hands.length,
    hands,
    summary,
    skillProgress,
    learningCurve,
    accuracy,
    learningDetected,
  };
}

// ═══════════════════════════════════════════════════════
// STUDENT STRATEGIES — different "learners" to test
// ═══════════════════════════════════════════════════════

/** Random student — picks uniformly from available actions. Baseline. */
export function randomStudent(view: StudentView): StudentDecision {
  const idx = Math.floor(Math.random() * view.availableActions.length);
  return {
    action: view.availableActions[idx],
    narrativeChoice: null,
    reasoning: "Random choice",
  };
}

/** Frequency-following student — picks the highest-frequency action from the solution. Ceiling. */
export function frequencyStudent(view: StudentView): StudentDecision {
  const sorted = Object.entries(view.frequencies)
    .filter(([a]) => view.availableActions.includes(a as GtoAction))
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0));
  const best = (sorted[0]?.[0] ?? view.availableActions[0]) as GtoAction;
  return {
    action: best,
    narrativeChoice: null,
    reasoning: `Picked highest frequency: ${best}`,
  };
}

/** Coaching-following student — picks whatever GTO coaching recommends. */
export function coachingStudent(view: StudentView): StudentDecision {
  const gtoAdvice = view.coaching.find((c) => c.profileName === "GTO");
  let action = view.availableActions[0];
  if (gtoAdvice) {
    // Map coaching action to available GtoAction
    const coachAction = gtoAdvice.action;
    if (view.availableActions.includes(coachAction as GtoAction)) {
      action = coachAction as GtoAction;
    } else {
      // Try matching by family (bet → bet_medium, raise → raise_large)
      const family = coachAction.replace(/_.*/, "");
      const match = view.availableActions.find((a) => a.startsWith(family));
      if (match) action = match;
    }
  }
  return {
    action,
    narrativeChoice: null,
    reasoning: `Followed GTO coaching: ${action}`,
  };
}

/** Narrative-reading student — picks based on the narrative prompt and board context. */
export function narrativeStudent(view: StudentView): StudentDecision {
  // Pick the narrative that best matches the board context
  const prompt = view.narrativePrompt;
  const bestNarrative = prompt.options[0]; // highest fitness

  // Map narrative intent to action
  let action = view.availableActions[0];
  if (bestNarrative) {
    const mapped = bestNarrative.mappedActions.find((a) => view.availableActions.includes(a));
    if (mapped) action = mapped;
  }

  return {
    action,
    narrativeChoice: bestNarrative?.id ?? null,
    reasoning: `Narrative: "${bestNarrative?.label}" → ${action}`,
  };
}

/**
 * Learning student — starts random, then uses feedback to improve.
 * Maintains internal state across hands.
 */
export function createLearningStudent(): (view: StudentView) => StudentDecision {
  const actionMemory = new Map<string, GtoAction>(); // handCategory → best action seen

  return (view: StudentView) => {
    const key = `${view.archetypeId}:${view.handCategory}:${view.isInPosition}`;

    // Check if we learned from previous feedback
    if (view.previousFeedback) {
      const prevKey = key; // simplified — uses current hand's key
      if (view.previousFeedback.verdict === "optimal" || view.previousFeedback.verdict === "acceptable") {
        actionMemory.set(prevKey, view.previousFeedback.userAction);
      } else if (view.previousFeedback.optimalAction) {
        actionMemory.set(prevKey, view.previousFeedback.optimalAction as GtoAction);
      }
    }

    // If we've seen this spot before, use what we learned
    const remembered = actionMemory.get(key);
    if (remembered && view.availableActions.includes(remembered)) {
      return {
        action: remembered,
        narrativeChoice: view.narrativePrompt.gtoNarrative,
        reasoning: `Remembered from feedback: ${remembered}`,
      };
    }

    // First time seeing this spot — use narrative prompt
    const prompt = view.narrativePrompt;
    const bestNarrative = prompt.options[0];
    let action = view.availableActions[0];
    if (bestNarrative) {
      const mapped = bestNarrative.mappedActions.find((a) => view.availableActions.includes(a));
      if (mapped) action = mapped;
    }

    return {
      action,
      narrativeChoice: bestNarrative?.id ?? null,
      reasoning: `First time: narrative "${bestNarrative?.label}" → ${action}`,
    };
  };
}

// ═══════════════════════════════════════════════════════
// PRETTY PRINT
// ═══════════════════════════════════════════════════════

export function formatLearnerResult(r: LearnerSessionResult): string {
  const lines: string[] = [];

  lines.push(`═══ LEARNER SESSION: ${r.archetypeId} ═══`);
  lines.push(`Hands: ${r.handsPlayed} | Accuracy: ${(r.accuracy * 100).toFixed(0)}% | Learning: ${r.learningDetected ? "YES" : "no"}`);
  lines.push("");

  // Learning curve
  lines.push("Learning curve (rolling 3-hand accuracy):");
  const curve = r.learningCurve.map((v) => `${(v * 100).toFixed(0)}%`).join(" → ");
  lines.push(`  ${curve}`);
  lines.push("");

  // Per-hand summary
  for (const hand of r.hands) {
    const v = hand.view;
    const d = hand.decision;
    const f = hand.feedback;
    const verdictIcon = f.verdict === "optimal" ? "✓" : f.verdict === "acceptable" ? "~" : "✗";
    lines.push(`  Hand ${v.handNumber}: ${v.heroCards.join(" ")} | ${v.handDescription} | ${v.isInPosition ? "IP" : "OOP"}`);
    lines.push(`    Board: ${v.communityCards.join(" ") || "(preflop)"}`);
    lines.push(`    Narrative: "${v.boardNarrative.headline}"`);
    lines.push(`    Question: "${v.boardNarrative.question}"`);
    lines.push(`    Student chose: ${d.action} (${d.reasoning})`);
    lines.push(`    ${verdictIcon} ${f.verdict} | Optimal: ${f.optimalAction} (${(f.optimalFrequency * 100).toFixed(0)}%) | EV loss: ${f.evLoss.toFixed(1)} BB`);
    lines.push(`    Feedback: "${f.narrativeFeedback.actionNarrative}"`);
    if (f.narrativeFeedback.gtoContrastNarrative) {
      lines.push(`    GTO: "${f.narrativeFeedback.gtoContrastNarrative}"`);
    }
    lines.push(`    Principle: "${f.narrativeFeedback.principleConnection}"`);
    lines.push("");
  }

  // Session summary insights
  if (r.summary.insights.length > 0) {
    lines.push("Session insights:");
    for (const insight of r.summary.insights) {
      lines.push(`  [${insight.type}] ${insight.summary}`);
    }
  }

  return lines.join("\n");
}
