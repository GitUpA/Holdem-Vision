/**
 * Narrative Engine — orchestrates the full narrative pipeline.
 *
 * Entry point: buildNarrativeExplanation()
 * Composes: traits → interpretation → rendering
 *
 * Produces a RenderedNarrative with:
 * - oneLiner: "Folds — not confident enough to continue"
 * - paragraph: full character reasoning
 * - explanationTree: ExplanationNode tree (same tags as existing UI)
 * - interpretation: structured reasoning data
 * - character: label and summary
 *
 * Pure TypeScript, zero Convex imports.
 */
import type { ExplanationNode } from "../../types/analysis";
import type {
  NarrativeInput,
  RenderedNarrative,
  NarrativeProfile,
} from "./narrativeTypes";
import { getNarrativeProfile, deriveNarrativeProfile } from "./narrativeTraits";
import { interpretSituation } from "./narrativeInterpreter";
import { actionVerb } from "./narrativeTemplates";
import { formatSituation } from "./types";
import { getModifierMap } from "./modifierProfiles";

// ═══════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════

/**
 * Build a complete narrative explanation for a profile's decision.
 *
 * This is the single function that replaces inline explanation building
 * in modifiedGtoEngine.ts. It produces the same ExplanationNode tree
 * structure the UI already consumes, with enhanced narrative prose.
 */
export function buildNarrativeExplanation(input: NarrativeInput): RenderedNarrative {
  const {
    profileId,
    situationKey,
    action,
    factors,
    baseModifier,
    effectiveModifier,
    gtoFrequencies,
    modifiedFrequencies,
    gtoSource,
    arc,
  } = input;

  // Get or derive narrative profile
  const narrativeProfile = getNarrativeProfile(profileId, getModifierMap) ??
    deriveNarrativeProfile(profileId, buildFallbackModifierMap(baseModifier));

  // Interpret the situation through the profile's personality lens
  const previousArc = arc?.getArc(0); // Seat index 0 as placeholder — actual seat set by caller
  const interpretation = interpretSituation(
    narrativeProfile,
    factors,
    baseModifier,
    effectiveModifier,
    action.actionType,
    previousArc,
  );

  // Build the one-liner
  const oneLiner = buildOneLiner(narrativeProfile, action.actionType, interpretation);

  // Build the full paragraph
  const paragraph = buildParagraph(narrativeProfile, action, interpretation, factors);

  // Build the ExplanationNode tree (preserving existing tag structure)
  const profileName = input.profileName ?? profileId.toUpperCase();
  const isGtoProfile = baseModifier.base.intensity < 0.001;
  const explanationTree = buildExplanationTree(
    narrativeProfile, action, interpretation, factors,
    gtoFrequencies, modifiedFrequencies, gtoSource, situationKey,
    profileName, baseModifier.deviationReason, isGtoProfile,
  );

  return {
    oneLiner,
    paragraph,
    explanationTree,
    interpretation,
    character: {
      label: narrativeProfile.characterLabel,
      summary: narrativeProfile.characterSummary,
    },
  };
}

// ═══════════════════════════════════════════════════════
// ONE-LINER
// ═══════════════════════════════════════════════════════

function buildOneLiner(
  profile: NarrativeProfile,
  actionType: string,
  interpretation: ReturnType<typeof interpretSituation>,
): string {
  const verb = actionVerb(actionType as import("../../state/game-state").ActionType);
  if (interpretation.contextOverride) {
    return `${verb} — ${interpretation.contextOverride.toLowerCase()}`;
  }
  return `${verb} — ${interpretation.primaryReason.toLowerCase()}`;
}

// ═══════════════════════════════════════════════════════
// PARAGRAPH
// ═══════════════════════════════════════════════════════

function buildParagraph(
  profile: NarrativeProfile,
  action: NarrativeInput["action"],
  interpretation: ReturnType<typeof interpretSituation>,
  _factors: NarrativeInput["factors"],
): string {
  const parts: string[] = [];

  // Character intro
  parts.push(`${profile.characterLabel} (${profile.characterSummary.replace(/\.$/, "")})`);

  // Perception
  parts.push(`sees ${interpretation.perception.handAssessment.toLowerCase()}.`);

  // Board context
  parts.push(interpretation.perception.boardAssessment + ".");

  // Action + primary reason
  const verb = actionVerb(action.actionType as import("../../state/game-state").ActionType, "present");
  const amount = action.amount ? ` ${action.amount}` : "";
  parts.push(`${verb}${amount} — ${interpretation.primaryReason.toLowerCase()}.`);

  // Context override if present
  if (interpretation.contextOverride) {
    parts.push(interpretation.contextOverride + ".");
  }

  // Story arc continuity
  if (interpretation.storyArc?.continuityNarrative) {
    parts.push(interpretation.storyArc.continuityNarrative + ".");
  }

  return parts.join(" ");
}

// ═══════════════════════════════════════════════════════
// EXPLANATION TREE
// ═══════════════════════════════════════════════════════

function buildExplanationTree(
  profile: NarrativeProfile,
  action: NarrativeInput["action"],
  interpretation: ReturnType<typeof interpretSituation>,
  factors: NarrativeInput["factors"],
  gtoFrequencies: NarrativeInput["gtoFrequencies"],
  modifiedFrequencies: NarrativeInput["modifiedFrequencies"],
  gtoSource: string,
  situationKey: string,
  profileName: string,
  deviationReason: string,
  isGtoProfile: boolean,
): ExplanationNode {
  const situationLabel = formatSituation(situationKey);
  const verb = actionVerb(action.actionType as import("../../state/game-state").ActionType);
  const amount = action.amount ? ` ${action.amount}` : "";

  const children: ExplanationNode[] = [];

  // Decision node
  children.push({
    summary: `Decision: ${verb}${amount}`,
    sentiment: action.actionType === "fold" ? "negative" : "positive",
    tags: ["decision"],
    detail: interpretation.primaryReason,
  });

  // Narrative reasoning (the new part)
  const narrativeChildren: ExplanationNode[] = [];

  // Perception
  narrativeChildren.push({
    summary: interpretation.perception.handAssessment,
    tags: ["hand-strength"],
    sentiment: factors.handStrength > 0.5 ? "positive" : factors.handStrength < 0.25 ? "negative" : "neutral",
  });
  narrativeChildren.push({
    summary: interpretation.perception.boardAssessment,
    tags: ["board-texture"],
  });
  if (factors.potOdds > 0) {
    narrativeChildren.push({
      summary: interpretation.perception.priceAssessment,
      tags: ["pot-odds"],
    });
  }
  narrativeChildren.push({
    summary: interpretation.perception.positionAssessment,
    tags: ["position"],
  });
  if (factors.foldEquity > 0) {
    narrativeChildren.push({
      summary: interpretation.perception.opponentAssessment,
      tags: ["fold-equity"],
    });
  }

  // Context override
  if (interpretation.contextOverride) {
    narrativeChildren.push({
      summary: interpretation.contextOverride,
      sentiment: "warning",
      tags: ["context-override"],
    });
  }

  // Story arc
  if (interpretation.storyArc?.continuityNarrative) {
    narrativeChildren.push({
      summary: interpretation.storyArc.continuityNarrative,
      tags: ["story-arc"],
    });
  }

  children.push({
    summary: `${profile.characterLabel}: ${interpretation.primaryReason}`,
    children: narrativeChildren,
    tags: ["narrative"],
  });

  // GTO base frequencies (preserved for backward compat)
  const gtoChildren: ExplanationNode[] = Object.entries(gtoFrequencies)
    .filter(([, v]) => (v ?? 0) > 0.01)
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
    .map(([a, v]) => ({
      summary: `${a}: ${((v ?? 0) * 100).toFixed(0)}%`,
      tags: ["frequency"] as string[],
    }));

  children.push({
    summary: `GTO base frequencies (${gtoSource}):`,
    children: gtoChildren,
    tags: ["gto-base"],
  });

  // Modified frequencies (skip for GTO — no deviation)
  if (!isGtoProfile) {
    const modChildren: ExplanationNode[] = Object.entries(modifiedFrequencies)
      .filter(([, v]) => (v ?? 0) > 0.01)
      .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
      .map(([a, v]) => ({
        summary: `${a}: ${((v ?? 0) * 100).toFixed(0)}%`,
        tags: ["frequency"] as string[],
      }));

    if (modChildren.length > 0) {
      children.push({
        summary: `${profileName} frequencies:`,
        detail: deviationReason,
        children: modChildren,
        tags: ["modifier", profile.profileId],
      });
    }
  }

  // Secondary reasons
  if (interpretation.secondaryReasons.length > 0) {
    children.push({
      summary: "Additional factors:",
      children: interpretation.secondaryReasons.map(r => ({ summary: r })),
      tags: ["context"],
    });
  }

  return {
    summary: `${profileName} (${profile.characterLabel}) — ${situationLabel}: ${verb}${amount} — ${factors.handDescription}`,
    children,
    tags: ["modified-gto"],
  };
}

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

/** Build a fallback modifier map from a single modifier (all 11 situations identical). */
function buildFallbackModifierMap(
  modifier: NarrativeInput["baseModifier"],
): import("./modifiedGtoTypes").ProfileModifierMap {
  const keys = [
    "preflop.open", "preflop.facing_raise", "preflop.facing_3bet", "preflop.facing_4bet",
    "postflop.aggressor.ip", "postflop.aggressor.oop",
    "postflop.caller.ip", "postflop.caller.oop",
    "postflop.facing_bet", "postflop.facing_raise", "postflop.facing_allin",
  ] as const;

  const map: Record<string, typeof modifier> = {};
  for (const key of keys) {
    map[key] = modifier;
  }
  return map as import("./modifiedGtoTypes").ProfileModifierMap;
}
