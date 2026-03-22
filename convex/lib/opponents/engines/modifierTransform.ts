/**
 * Modifier Transform — applies profile modifiers to GTO base frequencies.
 *
 * The core transformation pipeline:
 * 1. GTO base frequencies (from solver or heuristic)
 * 2. Profile modifier (per SituationKey)
 * 3. Context factors (hand strength, board, draws, odds)
 * 4. Effective modifier (base × contextual attenuation)
 * 5. Modified frequencies (GTO × effective modifier)
 * 6. Renormalized to sum = 1.0
 *
 * Multiplicative modifiers preserve GTO structure naturally:
 * - GTO fold=0% for sets → NIT fold still 0% (intersection)
 * - GTO fold=30% for middle pair → NIT fold=54% (modifier expressing bias)
 *
 * Pure TypeScript, zero Convex imports.
 */
import type {
  FrequencyModifier,
  SituationModifier,
  ContextFactors,
} from "./modifiedGtoTypes";
import type { ActionFrequencies, GtoAction } from "../../gto/tables/types";

// ═══════════════════════════════════════════════════════
// CORE TRANSFORM
// ═══════════════════════════════════════════════════════

/**
 * Apply a situation modifier to GTO base frequencies, producing
 * modified frequencies that express the profile's deviations.
 *
 * Returns a new ActionFrequencies object (never mutates input).
 */
export function applyModifier(
  gtoFreqs: ActionFrequencies,
  modifier: SituationModifier,
  factors: ContextFactors,
): ActionFrequencies {
  // Compute the effective modifier (base attenuated by context)
  const effective = computeEffectiveModifier(modifier, factors);

  // Apply to each action category
  const modified: Partial<Record<GtoAction, number>> = {};

  // Track fold and call separately for raiseVsCallBias processing
  let callFreq = 0;
  let totalRaiseFreq = 0;
  const raiseActions: [GtoAction, number][] = [];

  for (const [action, freq] of Object.entries(gtoFreqs)) {
    const gtoAction = action as GtoAction;
    const f = freq ?? 0;
    if (f < 0.001) continue;

    if (gtoAction === "fold") {
      modified.fold = f * effective.foldScale;
    } else if (gtoAction === "check") {
      // Check is neutral — not affected by fold or aggression scales
      modified.check = f;
    } else if (gtoAction === "call") {
      callFreq = f;
    } else {
      // Aggressive actions: bet_small, bet_medium, bet_large, raise_small, raise_large
      const scaled = f * effective.aggressionScale;
      raiseActions.push([gtoAction, scaled]);
      totalRaiseFreq += scaled;
    }
  }

  // ── Apply raiseVsCallBias ──
  // Positive bias: steal from call → add to raises
  // Negative bias: steal from raises → add to calls
  const bias = effective.raiseVsCallBias;
  if (bias > 0 && callFreq > 0) {
    // Shift from call to raises
    const shift = callFreq * bias * 0.5; // Cap shift at 50% of call freq
    callFreq -= shift;
    if (raiseActions.length > 0) {
      // Distribute proportionally to existing raise actions
      const raisePortion = shift / raiseActions.length;
      for (const entry of raiseActions) {
        entry[1] += raisePortion;
      }
      totalRaiseFreq += shift;
    }
  } else if (bias < 0 && totalRaiseFreq > 0) {
    // Shift from raises to call
    const shift = totalRaiseFreq * Math.abs(bias) * 0.5;
    callFreq += shift;
    const scaleFactor = (totalRaiseFreq - shift) / totalRaiseFreq;
    for (const entry of raiseActions) {
      entry[1] *= scaleFactor;
    }
    totalRaiseFreq -= shift;
  }

  // Write call frequency
  if (callFreq > 0.001) {
    modified.call = callFreq;
  }

  // ── Apply sizingBias ──
  // Positive: shift from small → large sizings
  // Negative: shift from large → small sizings
  if (raiseActions.length >= 2 && effective.sizingBias !== 0) {
    applySizingBias(raiseActions, effective.sizingBias);
  }

  // Write raise actions
  for (const [action, freq] of raiseActions) {
    if (freq > 0.001) {
      modified[action] = freq;
    }
  }

  // ── Renormalize ──
  return renormalize(modified);
}

// ═══════════════════════════════════════════════════════
// EFFECTIVE MODIFIER COMPUTATION
// ═══════════════════════════════════════════════════════

/**
 * Compute the effective modifier by applying contextual attenuation
 * to the base modifier. Strong hands, good odds, draws all reduce
 * the profile's biases, making them play closer to GTO.
 */
export function computeEffectiveModifier(
  modifier: SituationModifier,
  factors: ContextFactors,
): FrequencyModifier {
  const { base, context } = modifier;
  const intensity = base.intensity;

  // Short-circuit: intensity=0 means pure GTO
  if (intensity < 0.001) {
    return {
      foldScale: 1.0,
      aggressionScale: 1.0,
      raiseVsCallBias: 0.0,
      sizingBias: 0.0,
      intensity: 0,
    };
  }

  // ── Fold attenuation factors ──
  // Hand strength: strong hands reduce excessive folding (and excessive calling)
  const strengthAttenuation = 1 - factors.handStrength * context.handStrengthSensitivity;

  // Draws reduce fold bias (having outs makes you want to continue)
  const drawAttenuation = 1 - Math.min(factors.drawOuts / 15, 1) * context.drawSensitivity;

  // Good pot odds reduce fold bias (cheap price to continue)
  const oddsAttenuation = factors.potOdds > 0
    ? 1 - Math.min(1 - factors.potOdds, 1) * context.potOddsSensitivity * 0.3
    : 1;

  const combinedFoldAttenuation = strengthAttenuation * drawAttenuation * oddsAttenuation;

  // ── Aggression modulation factors ──
  // Position boosts aggression for position-sensitive profiles
  const positionBoost = factors.isInPosition
    ? 1 + context.positionSensitivity * 0.15
    : 1 - context.positionSensitivity * 0.08;

  // Fold equity boosts aggression (opponents fold → bluffs profit)
  const foldEquityBoost = 1 + factors.foldEquity * context.foldEquitySensitivity * 0.5;

  // SPR: shallow stacks increase commitment
  const sprBoost = factors.spr < 4
    ? 1 + (4 - factors.spr) / 4 * context.sprSensitivity * 0.3
    : 1;

  // Board texture: wet boards amplify aggression
  const textureBoost = 1 + (factors.boardWetness - 0.5) * context.textureSensitivity * 0.3;

  // Strong hand on river: boost aggression for value betting
  // When handStrength > 0.9 on the river, any profile should lean toward betting for value
  const riverValueBoost = (!factors.isPreflop && factors.drawOuts === 0 && factors.handStrength > 0.9)
    ? 1 + (factors.handStrength - 0.9) * 10  // 0.9 → 1.0x, 0.95 → 1.5x, 1.0 → 2.0x
    : 1.0;

  // ── Apply intensity lerp ──
  return {
    foldScale: lerp(1.0, base.foldScale * combinedFoldAttenuation, intensity),
    aggressionScale: lerp(
      1.0,
      base.aggressionScale * positionBoost * foldEquityBoost * sprBoost * textureBoost * riverValueBoost,
      intensity,
    ),
    raiseVsCallBias: base.raiseVsCallBias * intensity,
    sizingBias: base.sizingBias * intensity,
    intensity,
  };
}

// ═══════════════════════════════════════════════════════
// SIZING BIAS
// ═══════════════════════════════════════════════════════

/** Sizing order from smallest to largest for bias shifting. */
const SIZING_ORDER: GtoAction[] = [
  "bet_small", "raise_small", "bet_medium", "bet_large", "raise_large",
];

/**
 * Shift between small and large sizing actions.
 * Positive bias: favor larger sizes. Negative: favor smaller.
 */
function applySizingBias(
  actions: [GtoAction, number][],
  bias: number,
): void {
  if (actions.length < 2) return;

  // Sort by sizing order
  actions.sort(([a], [b]) => {
    const aIdx = SIZING_ORDER.indexOf(a);
    const bIdx = SIZING_ORDER.indexOf(b);
    return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
  });

  const totalWeight = actions.reduce((s, [, f]) => s + f, 0);
  if (totalWeight < 0.001) return;

  // Apply exponential weight shift
  for (let i = 0; i < actions.length; i++) {
    // Position ranges from -1 (smallest) to +1 (largest)
    const position = actions.length === 1 ? 0 :
      (i / (actions.length - 1)) * 2 - 1;
    // Bias shifts weight toward one end
    const shift = 1 + position * bias * 0.5;
    actions[i][1] *= Math.max(0.1, shift);
  }

  // Re-proportionalize to maintain total weight
  const newTotal = actions.reduce((s, [, f]) => s + f, 0);
  if (newTotal > 0.001) {
    const scale = totalWeight / newTotal;
    for (const entry of actions) {
      entry[1] *= scale;
    }
  }
}

// ═══════════════════════════════════════════════════════
// RENORMALIZE
// ═══════════════════════════════════════════════════════

/**
 * Normalize frequencies to sum to 1.0.
 * Filters out near-zero entries.
 */
export function renormalize(
  freqs: Partial<Record<GtoAction, number>>,
): ActionFrequencies {
  const entries = Object.entries(freqs).filter(
    ([, v]) => v !== undefined && v > 0.001,
  ) as [GtoAction, number][];

  if (entries.length === 0) {
    // Fallback: 100% check
    return { check: 1.0 };
  }

  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  const result: ActionFrequencies = {};
  for (const [action, freq] of entries) {
    result[action] = freq / total;
  }
  return result;
}

// ═══════════════════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════════════════

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
