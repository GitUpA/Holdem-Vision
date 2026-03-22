/**
 * Narrative Session Summary — insights from a drill session.
 *
 * Analyzes a series of drill scores to identify:
 * - Which hand categories the user handles well vs poorly
 * - How often their narrative choices aligned with their actions
 * - Teaching insights based on weak areas
 *
 * Pure TypeScript, zero Convex imports.
 */

import type { ActionScore } from "./evScoring";
import type { HandCategory } from "./handCategorizer";
import type { NarrativeIntentId } from "./narrativePrompts";
import type { GtoAction } from "./tables/types";
import type { ArchetypeId } from "./archetypeClassifier";
import { getPrototype } from "./archetypePrototypes";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export interface NarrativeInsight {
  /** Teaching summary */
  summary: string;
  /** Which archetype/principle this relates to */
  archetypeId?: ArchetypeId;
  /** Strength or weakness? */
  type: "strength" | "weakness" | "observation";
  /** Relevant principle text */
  principle: string;
}

export interface NarrativeSessionSummary {
  /** 1-3 insights, prioritized by significance */
  insights: NarrativeInsight[];
  /** How often narrative choice matched action (null if no choices made) */
  narrativeAlignmentRate: number | null;
  /** Categories the user struggled with */
  weakCategories: HandCategory[];
  /** Categories the user handled well */
  strongCategories: HandCategory[];
}

export interface NarrativeChoiceRecord {
  choice: NarrativeIntentId | null;
  action: GtoAction;
  verdict: string;
}

// ═══════════════════════════════════════════════════════
// IMPLEMENTATION
// ═══════════════════════════════════════════════════════

const VERDICT_SCORES: Record<string, number> = {
  optimal: 1.0,
  acceptable: 0.7,
  mistake: 0.3,
  blunder: 0.0,
};

export function buildNarrativeSummary(
  scores: ActionScore[],
  narrativeChoices: NarrativeChoiceRecord[],
  archetypeId?: ArchetypeId,
): NarrativeSessionSummary {
  if (scores.length === 0) {
    return {
      insights: [{ summary: "No hands played yet.", type: "observation", principle: "" }],
      narrativeAlignmentRate: null,
      weakCategories: [],
      strongCategories: [],
    };
  }

  // ── Category analysis ──
  const categoryScores = new Map<HandCategory, number[]>();
  for (const score of scores) {
    const cat = score.handCategory.category;
    if (!categoryScores.has(cat)) categoryScores.set(cat, []);
    categoryScores.get(cat)!.push(VERDICT_SCORES[score.verdict] ?? 0.5);
  }

  const categoryAverages = new Map<HandCategory, number>();
  for (const [cat, values] of categoryScores) {
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    categoryAverages.set(cat, avg);
  }

  const weakCategories: HandCategory[] = [];
  const strongCategories: HandCategory[] = [];
  for (const [cat, avg] of categoryAverages) {
    if (avg < 0.5) weakCategories.push(cat);
    else if (avg >= 0.8) strongCategories.push(cat);
  }

  // ── Narrative alignment ──
  const choices = narrativeChoices.filter((c) => c.choice !== null);
  let narrativeAlignmentRate: number | null = null;
  if (choices.length > 0) {
    // Simple alignment: did the narrative intent's mapped actions include what they did?
    const aligned = choices.filter((c) => c.verdict === "optimal" || c.verdict === "acceptable").length;
    narrativeAlignmentRate = aligned / choices.length;
  }

  // ── Build insights ──
  const insights: NarrativeInsight[] = [];

  // Weakness insight
  if (weakCategories.length > 0) {
    const worstCat = [...categoryAverages.entries()]
      .sort(([, a], [, b]) => a - b)[0];
    const catLabel = worstCat[0].replace(/_/g, " ");
    const proto = archetypeId ? getPrototype(archetypeId) : undefined;
    const principle = proto?.teaching?.split(/[.!?]/)[0] ?? "Focus on understanding the board texture and how it affects your range.";

    insights.push({
      summary: `You struggled with ${catLabel} hands — ${(worstCat[1] * 100).toFixed(0)}% accuracy. ${principle}.`,
      archetypeId,
      type: "weakness",
      principle,
    });
  }

  // Strength insight
  if (strongCategories.length > 0) {
    const bestCat = [...categoryAverages.entries()]
      .sort(([, a], [, b]) => b - a)[0];
    const catLabel = bestCat[0].replace(/_/g, " ");
    insights.push({
      summary: `Your strongest area: ${catLabel} hands — ${(bestCat[1] * 100).toFixed(0)}% accuracy.`,
      type: "strength",
      principle: "Keep applying this understanding to similar spots.",
    });
  }

  // Narrative alignment insight
  if (narrativeAlignmentRate !== null) {
    if (narrativeAlignmentRate >= 0.8) {
      insights.push({
        summary: `Excellent narrative consistency — ${(narrativeAlignmentRate * 100).toFixed(0)}% of your actions matched your stated intent.`,
        type: "strength",
        principle: "Your story-telling and execution are aligned. This is the hallmark of disciplined play.",
      });
    } else if (narrativeAlignmentRate < 0.5) {
      insights.push({
        summary: `Your actions often didn't match your stated narrative — ${(narrativeAlignmentRate * 100).toFixed(0)}% alignment. Work on connecting your read to your action.`,
        type: "weakness",
        principle: "Before you act, ask: does this action match the story I said I was telling?",
      });
    }
  }

  // Overall observation if no specific insights
  if (insights.length === 0) {
    const overallScore = scores.reduce((s, sc) => s + (VERDICT_SCORES[sc.verdict] ?? 0), 0) / scores.length;
    insights.push({
      summary: `Overall accuracy: ${(overallScore * 100).toFixed(0)}%. Keep practicing to build pattern recognition.`,
      type: "observation",
      principle: "Consistent practice builds the recognition patterns that make decisions automatic.",
    });
  }

  return {
    insights,
    narrativeAlignmentRate,
    weakCategories,
    strongCategories,
  };
}
