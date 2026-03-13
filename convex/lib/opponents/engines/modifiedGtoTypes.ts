/**
 * ModifiedGtoEngine type contracts.
 *
 * Defines the modifier system where GTO solver frequencies are the base
 * and each profile (NIT, FISH, TAG, LAG) is expressed as situation-aware
 * frequency modifiers on top of those base frequencies.
 *
 * Key insight: multiplicative modifiers naturally preserve GTO structure.
 * If GTO says "never fold sets" (fold=0%), multiplying by any fold scale
 * still gives 0%. Profiles converge with GTO on premium hands (natural
 * intersection) and diverge on marginal hands (profile bias expressing).
 *
 * Pure TypeScript, zero Convex imports.
 */
import type { SituationKey } from "../../types/opponents";

// ═══════════════════════════════════════════════════════
// FREQUENCY MODIFIER — how a profile warps GTO frequencies
// ═══════════════════════════════════════════════════════

/**
 * How a profile deviates from GTO frequencies in a given situation.
 * These are NOT action frequencies — they are *adjustments* to GTO frequencies.
 */
export interface FrequencyModifier {
  /** Multiply fold frequency by this factor. >1 = folds more than GTO, <1 = folds less. */
  foldScale: number;
  /** Multiply all aggressive actions (bet/raise) by this factor. */
  aggressionScale: number;
  /** Shift between call and raise within "continuing" actions.
   *  >0 pushes toward raises, <0 pushes toward calls. Range: [-1, 1]. */
  raiseVsCallBias: number;
  /** Shift between large and small sizings. >0 = bigger, <0 = smaller. Range: [-1, 1]. */
  sizingBias: number;
  /** How strongly this modifier applies. 0 = pure GTO, 1 = full modifier effect. */
  intensity: number;
}

// ═══════════════════════════════════════════════════════
// CONTEXTUAL CONFIG — game state modulates the modifier
// ═══════════════════════════════════════════════════════

/**
 * How game context modulates the base FrequencyModifier.
 * Each value is [0, 1]. High values = the profile's biases are
 * more sensitive to that factor.
 *
 * For example, a TAG with high handStrengthSensitivity has its
 * fold bias heavily attenuated by strong hands (converges to GTO
 * with premiums) while a FISH with low sensitivity keeps calling
 * regardless of hand strength.
 */
export interface ContextualModifierConfig {
  /** Strong hands attenuate fold/call biases → converge to GTO. */
  handStrengthSensitivity: number;
  /** Wet/dry board affects aggression modulation. */
  textureSensitivity: number;
  /** Good pot odds override folding tendencies. */
  potOddsSensitivity: number;
  /** IP/OOP effect (same semantic as positionAwareness). */
  positionSensitivity: number;
  /** Opponents fold easily → more aggression. */
  foldEquitySensitivity: number;
  /** Short SPR → more commitment. */
  sprSensitivity: number;
  /** Draws override folding tendencies. */
  drawSensitivity: number;
}

// ═══════════════════════════════════════════════════════
// SITUATION MODIFIER — full modifier for one SituationKey
// ═══════════════════════════════════════════════════════

/**
 * Full modifier for one SituationKey.
 *
 * The base FrequencyModifier says "in this situation, this profile
 * deviates from GTO in these ways." The contextual config says
 * "and the deviation is modulated by these game factors."
 */
export interface SituationModifier {
  /** Base frequency scaling factors. */
  base: FrequencyModifier;
  /** How game context attenuates/amplifies the base modifier. */
  context: ContextualModifierConfig;
  /** Teaching text explaining WHY this profile deviates here. */
  deviationReason: string;
}

/**
 * A complete profile modifier definition — maps each situation to
 * how the profile deviates from GTO in that situation.
 */
export type ProfileModifierMap = Record<SituationKey, SituationModifier>;

// ═══════════════════════════════════════════════════════
// CONTEXT FACTORS — computed game state for modulation
// ═══════════════════════════════════════════════════════

/**
 * Computed game context factors used by the modifier system.
 * Produced by contextAnalysis, consumed by modifierTransform.
 */
export interface ContextFactors {
  /** Overall hand strength, 0-1. */
  handStrength: number;
  /** Human-readable hand description. */
  handDescription: string;
  /** Board wetness, 0-1 (higher = more draws possible). */
  boardWetness: number;
  /** Total draw outs (0 if preflop or no draws). */
  drawOuts: number;
  /** Best draw type description. */
  bestDrawType: string;
  /** Pot odds as fraction (callAmount / (pot + callAmount)), 0 if no call needed. */
  potOdds: number;
  /** Probability opponents fold to aggression, 0-1. */
  foldEquity: number;
  /** Stack-to-pot ratio. */
  spr: number;
  /** Whether hero is in position. */
  isInPosition: boolean;
  /** Whether this is preflop. */
  isPreflop: boolean;
}

// ═══════════════════════════════════════════════════════
// HELPERS — identity modifier for GTO profile
// ═══════════════════════════════════════════════════════

/** Identity FrequencyModifier — no deviation from GTO. */
export const IDENTITY_MODIFIER: FrequencyModifier = {
  foldScale: 1.0,
  aggressionScale: 1.0,
  raiseVsCallBias: 0.0,
  sizingBias: 0.0,
  intensity: 0.0,
};

/** Zero-sensitivity context config (for profiles that don't adapt). */
export const ZERO_CONTEXT: ContextualModifierConfig = {
  handStrengthSensitivity: 0,
  textureSensitivity: 0,
  potOddsSensitivity: 0,
  positionSensitivity: 0,
  foldEquitySensitivity: 0,
  sprSensitivity: 0,
  drawSensitivity: 0,
};

/** Create an identity SituationModifier (pure GTO, no deviation). */
export function identitySituationModifier(): SituationModifier {
  return {
    base: { ...IDENTITY_MODIFIER },
    context: { ...ZERO_CONTEXT },
    deviationReason: "GTO plays at solver-optimal frequencies. No deviation.",
  };
}
