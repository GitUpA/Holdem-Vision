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
import type { PreflopClassification } from "./preflopClassification";
import { classificationToCoachingText } from "./preflopClassification";
import { getTeachingContent } from "./archetypePrototypes";

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
  street: "preflop" | "flop" | "turn" | "river" = "flop",
  preflopClassification?: PreflopClassification,
): ExplanationNode {
  // For turn/river, use textureArchetypeId for solver lookup
  const lookupArchetypeId = archetype.textureArchetypeId ?? archetype.archetypeId;
  const table = getTable(lookupArchetypeId, street);
  const lookup = lookupFrequencies(
    lookupArchetypeId,
    handCat.category,
    isInPosition,
    street,
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

  // GTO frequencies (preflop: use classification, postflop: use solver frequencies)
  if (preflopClassification) {
    const classText = classificationToCoachingText(preflopClassification);
    children.push({
      summary: `Range classification:${classText}`,
      detail: preflopClassification.teachingNote,
      sentiment: "neutral",
      tags: ["classification"],
    });
  } else if (lookup) {
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
  if (userAction && preflopClassification) {
    // Preflop: classification-based verdict
    const rc = preflopClassification.rangeClass;
    const isActionRaise = userAction.startsWith("bet") || userAction.startsWith("raise");
    const isActionCall = userAction === "call";
    const isActionFold = userAction === "fold";
    const matchesClass =
      (isActionRaise && (rc === "clear_raise" || rc === "raise" || rc === "mixed_raise")) ||
      (isActionCall && (rc === "call" || rc === "mixed_raise")) ||
      (isActionFold && (rc === "clear_fold" || rc === "borderline"));
    const sentiment = matchesClass ? "positive" : "warning";
    const verdictLabel = matchesClass ? "matches range" : "deviates from range";

    children.push({
      summary: `You chose: ${userAction} — ${verdictLabel}`,
      sentiment,
      tags: ["user-action", matchesClass ? "optimal" : "mistake"],
    });
  } else if (userAction && lookup) {
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

  // Prototype teaching content
  const teaching = getTeachingContent(archetype.archetypeId);
  if (teaching) {
    children.push({
      summary: `Key principle: ${teaching.concept}`,
      sentiment: "neutral",
      tags: ["principle", "prototype"],
    });
    children.push({
      summary: teaching.feeling,
      sentiment: "neutral",
      tags: ["feeling", "prototype"],
    });
  } else if (table?.keyPrinciple) {
    // Fallback to table-level principle if no prototype
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
