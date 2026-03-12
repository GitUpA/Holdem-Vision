/**
 * Archetype Explainer — generates rich teaching ExplanationNode trees.
 *
 * Standalone explainer for use in drill mode score display and
 * replay overlay. Combines archetype info, hand category, frequencies,
 * and user action into a teaching explanation.
 *
 * Pure TypeScript, zero Convex imports.
 */
import type { ExplanationNode } from "../types/analysis";
import type { ArchetypeClassification } from "./archetypeClassifier";
import type { HandCategorization } from "./handCategorizer";
import {
  getTable,
  lookupFrequencies,
  type GtoAction,
  type ActionFrequencies,
} from "./tables";

// ═══════════════════════════════════════════════════════
// MAIN EXPLAINER
// ═══════════════════════════════════════════════════════

/**
 * Generate a teaching explanation for a specific archetype + hand.
 *
 * Without a user action: explains what GTO recommends.
 * With a user action: explains how the user's choice compares.
 */
export function explainArchetype(
  archetype: ArchetypeClassification,
  handCat: HandCategorization,
  isInPosition: boolean,
  userAction?: GtoAction,
): ExplanationNode {
  const table = getTable(archetype.archetypeId);
  const lookup = lookupFrequencies(
    archetype.archetypeId,
    handCat.category,
    isInPosition,
  );

  const children: ExplanationNode[] = [];

  // Hand category
  const handSentiment = handCat.relativeStrength > 0.6
    ? "positive"
    : handCat.relativeStrength > 0.3
      ? "neutral"
      : "negative" as const;
  children.push({
    summary: `Your hand: ${handCat.description} (${handCat.category})`,
    sentiment: handSentiment,
    tags: ["hand-category"],
  });

  // Position context
  children.push({
    summary: `Position: ${isInPosition ? "In Position" : "Out of Position"}`,
    sentiment: isInPosition ? "positive" : "neutral",
    tags: ["position"],
  });

  // GTO frequencies
  if (lookup) {
    const freqLines = formatFrequencies(lookup.frequencies);
    children.push({
      summary: `GTO says:`,
      children: freqLines,
      sentiment: "neutral",
      tags: ["frequencies"],
    });

    if (!lookup.isExact) {
      children.push({
        summary: `Note: using closest category (${lookup.handCategory}) — exact match not in table`,
        sentiment: "warning",
        tags: ["fallback"],
      });
    }
  } else {
    children.push({
      summary: "No frequency data available for this archetype",
      sentiment: "warning",
      tags: ["no-data"],
    });
  }

  // User action comparison
  if (userAction && lookup) {
    const userFreq = lookup.frequencies[userAction] ?? 0;
    const userPct = (userFreq * 100).toFixed(0);
    const verdict =
      userFreq >= 0.3 ? "optimal" :
      userFreq >= 0.15 ? "acceptable" :
      userFreq >= 0.05 ? "mistake" : "blunder";

    const sentimentMap = {
      optimal: "positive",
      acceptable: "positive",
      mistake: "warning",
      blunder: "negative",
    } as const;

    children.push({
      summary: `You chose: ${userAction} — GTO does this ${userPct}% of the time (${verdict})`,
      sentiment: sentimentMap[verdict],
      tags: ["user-action", verdict],
    });
  }

  // Key principle
  if (table?.keyPrinciple) {
    children.push({
      summary: `Key principle: ${table.keyPrinciple}`,
      sentiment: "neutral",
      tags: ["principle"],
    });
  }

  // Common mistakes
  if (table?.commonMistakes && table.commonMistakes.length > 0) {
    children.push({
      summary: "Common mistakes:",
      children: table.commonMistakes.map((m) => ({
        summary: m,
        sentiment: "warning" as const,
        tags: ["common-mistake"],
      })),
      sentiment: "warning",
      tags: ["mistakes"],
    });
  }

  return {
    summary: `${archetype.description} — ${handCat.description}`,
    sentiment: handSentiment,
    children,
    tags: ["archetype-explanation"],
  };
}

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

function formatFrequencies(frequencies: ActionFrequencies): ExplanationNode[] {
  return Object.entries(frequencies)
    .filter(([, v]) => (v ?? 0) > 0.01)
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
    .map(([action, freq]) => ({
      summary: `${action}: ${((freq ?? 0) * 100).toFixed(0)}%`,
      sentiment: "neutral" as const,
      tags: ["frequency"],
    }));
}
