/**
 * Narrative Interpreter — produces structured reasoning from traits + context.
 *
 * Given a NarrativeProfile, ContextFactors, and the chosen action,
 * produces a SituationInterpretation that explains WHY the profile
 * took this action in character-coherent terms.
 *
 * The key mechanism: compares base modifier to effective modifier.
 * When context attenuated the profile's default tendency, the interpreter
 * explains what overrode the default ("Normally cautious, but the price
 * is too good to pass up").
 *
 * Pure TypeScript, zero Convex imports.
 */
import type {
  NarrativeProfile,
  NarrativeTrait,
  SituationInterpretation,
  NarrativePerception,
  ActiveTrait,
  StoryArcReference,
} from "./narrativeTypes";
import type {
  ContextFactors,
  SituationModifier,
  FrequencyModifier,
} from "./modifiedGtoTypes";
import type { ActionType } from "../../state/game-state";
import {
  assessHand,
  assessBoard,
  assessPrice,
  assessPosition,
  assessOpponents,
  buildContextOverrides,
  getPrimaryReason,
  getContinuityNarrative,
} from "./narrativeTemplates";

// ═══════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════

/**
 * Interpret a situation through the profile's personality lens.
 * Produces structured reasoning that explains the action in character.
 */
export function interpretSituation(
  profile: NarrativeProfile,
  factors: ContextFactors,
  baseModifier: SituationModifier,
  effectiveModifier: FrequencyModifier,
  action: ActionType,
  previousArc?: StoryArcReference,
): SituationInterpretation {
  const traits = profile.traits;
  const dominantTrait = traits[0];

  // Build perception through personality lens
  const perception = buildPerception(traits, factors);

  // Determine which traits actively influenced the decision
  const activeTraits = identifyActiveTraits(traits, factors, baseModifier, effectiveModifier, action);

  // Build primary and secondary reasons
  const primaryReason = dominantTrait
    ? getPrimaryReason(dominantTrait.id, action)
    : action === "fold" ? "Decides to fold" : "Decides to continue";

  const secondaryReasons = buildSecondaryReasons(activeTraits, factors);

  // Check for context overrides ("normally X, but Y")
  const contextOverride = buildContextOverrideNarrative(
    traits, baseModifier, effectiveModifier, factors, action,
  );

  // Build story arc connection
  const storyArc = buildStoryArc(previousArc, action, factors);

  return {
    perception,
    activeTraits,
    primaryReason,
    secondaryReasons,
    contextOverride,
    storyArc,
  };
}

// ═══════════════════════════════════════════════════════
// PERCEPTION — how the profile "sees" the situation
// ═══════════════════════════════════════════════════════

function buildPerception(
  traits: NarrativeTrait[],
  factors: ContextFactors,
): NarrativePerception {
  const isCautious = hasTrait(traits, "cautious");
  const isAggressive = hasTrait(traits, "aggressive");
  const isPriceSensitive = hasTrait(traits, "price-sensitive");
  const isPositional = hasTrait(traits, "positional");
  const isAggroExploiter = hasTrait(traits, "fold-equity-exploiter");

  return {
    handAssessment: assessHand(factors.handStrength, factors.handDescription, isCautious),
    boardAssessment: assessBoard(factors.boardWetness, isAggressive),
    priceAssessment: assessPrice(factors.potOdds, isPriceSensitive),
    positionAssessment: assessPosition(factors.isInPosition, isPositional),
    opponentAssessment: assessOpponents(factors.foldEquity, isAggroExploiter),
  };
}

// ═══════════════════════════════════════════════════════
// ACTIVE TRAITS — which traits influenced the decision
// ═══════════════════════════════════════════════════════

function identifyActiveTraits(
  traits: NarrativeTrait[],
  factors: ContextFactors,
  baseModifier: SituationModifier,
  effectiveModifier: FrequencyModifier,
  action: ActionType,
): ActiveTrait[] {
  const active: ActiveTrait[] = [];
  const isFolding = action === "fold";
  const isAggressive = action === "bet" || action === "raise" || action === "all_in";

  // Analyze context deltas
  const deltas = buildContextOverrides(
    baseModifier.base.foldScale,
    effectiveModifier.foldScale,
    baseModifier.base.aggressionScale,
    effectiveModifier.aggressionScale,
    {
      handStrength: factors.handStrength,
      drawOuts: factors.drawOuts,
      potOdds: factors.potOdds,
      foldEquity: factors.foldEquity,
      isInPosition: factors.isInPosition,
      boardWetness: factors.boardWetness,
      spr: factors.spr,
    },
    {
      hand: baseModifier.context.handStrengthSensitivity,
      draw: baseModifier.context.drawSensitivity,
      odds: baseModifier.context.potOddsSensitivity,
      foldEq: baseModifier.context.foldEquitySensitivity,
      position: baseModifier.context.positionSensitivity,
      texture: baseModifier.context.textureSensitivity,
      spr: baseModifier.context.sprSensitivity,
    },
  );

  for (const trait of traits.slice(0, 4)) {
    let influence = "";
    let attenuation: ActiveTrait["attenuation"] | undefined;

    // Determine how this trait influenced the action
    if (trait.id === "cautious") {
      influence = isFolding ? "Pushed toward folding — default is caution" : "Would prefer folding, but was overridden";
      if (!isFolding && deltas.length > 0) {
        attenuation = { factor: deltas[0].label, reason: deltas[0].reason };
      }
    } else if (trait.id === "sticky") {
      influence = isFolding ? "Normally stays in, but this time gave up" : "Keeps the hand alive — reluctant to fold";
    } else if (trait.id === "aggressive") {
      influence = isAggressive ? "Favored aggression — betting or raising" : "Would prefer aggression, but checked back";
      if (!isAggressive && deltas.length > 0) {
        const aggrDelta = deltas.find(d => d.factor === "foldEquity" || d.factor === "position" || d.factor === "texture");
        if (aggrDelta) {
          attenuation = { factor: aggrDelta.label, reason: aggrDelta.reason };
        }
      }
    } else if (trait.id === "passive") {
      influence = isAggressive ? "Unusually aggressive for this profile" : "Comfortable with a passive line";
    } else if (trait.id === "hand-reader") {
      influence = factors.handStrength > 0.6
        ? "Hand strength justified the action"
        : "Hand isn't strong enough for this profile's standards";
    } else if (trait.id === "price-sensitive") {
      influence = factors.potOdds < 0.25
        ? "Good price makes continuing worthwhile"
        : "The price is too steep";
    } else if (trait.id === "positional") {
      influence = factors.isInPosition
        ? "Position provides an edge here"
        : "Out of position — a disadvantage this profile respects";
    } else if (trait.id === "fold-equity-exploiter") {
      influence = factors.foldEquity > 0.4
        ? "Opponents fold enough to make aggression profitable"
        : "Low fold equity limits pressure options";
    } else if (trait.id === "balanced") {
      influence = "Playing close to GTO — minimal deviation";
    } else {
      influence = `${trait.label} tendency active`;
    }

    active.push({ trait, influence, attenuation });
  }

  return active;
}

// ═══════════════════════════════════════════════════════
// CONTEXT OVERRIDE NARRATIVE
// ═══════════════════════════════════════════════════════

function buildContextOverrideNarrative(
  traits: NarrativeTrait[],
  baseModifier: SituationModifier,
  effectiveModifier: FrequencyModifier,
  factors: ContextFactors,
  action: ActionType,
): string | undefined {
  const foldDelta = Math.abs(baseModifier.base.foldScale - effectiveModifier.foldScale);
  const aggrDelta = Math.abs(baseModifier.base.aggressionScale - effectiveModifier.aggressionScale);

  // Only generate override narrative when context significantly changed the outcome
  if (foldDelta < 0.2 && aggrDelta < 0.15) return undefined;

  const isCautious = hasTrait(traits, "cautious");
  const isSticky = hasTrait(traits, "sticky");

  // Cautious profile continuing despite high foldScale
  if (isCautious && action !== "fold" && foldDelta > 0.2) {
    if (factors.handStrength > 0.6) {
      return `Normally would fold here, but ${factors.handDescription} is strong enough to continue`;
    }
    if (factors.drawOuts > 6) {
      return `Normally would fold, but ${factors.drawOuts} outs to improve make it worth staying`;
    }
    if (factors.potOdds > 0 && factors.potOdds < 0.2) {
      return "Normally would fold, but the price is too good to pass up";
    }
    return "Context overrides the usual caution here";
  }

  // Sticky profile folding despite low foldScale
  if (isSticky && action === "fold" && foldDelta > 0.15) {
    if (factors.handStrength < 0.15) {
      return "Even a loose player gives up with nothing — the hand has no future";
    }
    return "Sometimes even the stickiest player has to let go";
  }

  // Aggression boost from context
  if (aggrDelta > 0.15 && (action === "bet" || action === "raise")) {
    if (factors.foldEquity > 0.5) {
      return "Opponents fold enough to make this bet profitable regardless of hand strength";
    }
    if (factors.isInPosition && factors.boardWetness < 0.3) {
      return "Position plus a dry board creates a perfect spot for aggression";
    }
  }

  return undefined;
}

// ═══════════════════════════════════════════════════════
// SECONDARY REASONS
// ═══════════════════════════════════════════════════════

function buildSecondaryReasons(
  activeTraits: ActiveTrait[],
  factors: ContextFactors,
): string[] {
  const reasons: string[] = [];

  // Add context-based secondary reasons
  if (factors.drawOuts > 6) {
    reasons.push(`Has ${factors.drawOuts} outs to improve (${factors.bestDrawType})`);
  }

  if (factors.spr < 3) {
    reasons.push("Short stack-to-pot ratio increases commitment");
  }

  // Add trait-attenuation reasons
  for (const at of activeTraits) {
    if (at.attenuation) {
      reasons.push(`${at.attenuation.factor}: ${at.attenuation.reason}`);
    }
  }

  return reasons.slice(0, 3); // Max 3 secondary reasons
}

// ═══════════════════════════════════════════════════════
// STORY ARC
// ═══════════════════════════════════════════════════════

function buildStoryArc(
  previousArc: StoryArcReference | undefined,
  currentAction: ActionType,
  _factors: ContextFactors,
): StoryArcReference | undefined {
  if (!previousArc || previousArc.previousActions.length === 0) return undefined;

  const lastAction = previousArc.previousActions[previousArc.previousActions.length - 1];
  const continuityNarrative = getContinuityNarrative(
    lastAction.action,
    lastAction.intent,
    currentAction,
  );

  if (!continuityNarrative) return undefined;

  return {
    previousActions: previousArc.previousActions,
    continuityNarrative,
  };
}

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

function hasTrait(traits: NarrativeTrait[], id: string): boolean {
  return traits.some(t => t.id === id && t.strength > 0.25);
}
