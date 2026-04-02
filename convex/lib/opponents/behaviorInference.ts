/**
 * Behavior Inference — infer behavioral params from observed actions.
 *
 * Layer 7 compliance: the coach is blind to setup. Instead of reading
 * an assigned profile label (NIT/TAG), the coach observes actions and
 * infers what TYPE of player this appears to be.
 *
 * This produces the same BehavioralParams shape that profiles provide,
 * but derived from action patterns — not assigned labels.
 *
 * Pure TypeScript, zero Convex imports.
 */

import type { PlayerAction, BehavioralParams, SituationKey } from "../types/opponents";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export interface InferredBehavior {
  /** Estimated behavioral params (same shape as profile situationMap) */
  params: Partial<Record<SituationKey, BehavioralParams>>;
  /** Confidence in the inference (0-1, based on sample size) */
  confidence: number;
  /** Human-readable description of observed pattern */
  description: string;
  /** Detected behavior pattern */
  pattern: BehaviorPattern;
}

export type BehaviorPattern =
  | "tight-passive"    // folds a lot, rarely raises (NIT-like)
  | "tight-aggressive" // folds a lot, but raises when playing (TAG-like)
  | "loose-passive"    // calls a lot, rarely raises (FISH-like)
  | "loose-aggressive" // plays many hands, raises often (LAG-like)
  | "balanced"         // close to GTO (no clear deviation)
  | "unknown";         // not enough data

// ═══════════════════════════════════════════════════════
// INFERENCE
// ═══════════════════════════════════════════════════════

/** Default GTO-like params when we have no data. */
const DEFAULT_PARAMS: BehavioralParams = {
  continuePct: 50,
  raisePct: 15,
  bluffFrequency: 0.3,
  positionAwareness: 0.7,
  sizings: [{ action: "bet", sizingPct: 67, weight: 1 }],
  explanation: "Inferred from observed actions.",
};

/**
 * Infer behavioral params from observed action history.
 *
 * With 0 actions: returns balanced/unknown (no reads yet).
 * With 1-3 actions: weak signal, conservative inference.
 * With 4+ actions: pattern emerges, higher confidence.
 */
export function inferBehavior(actions: PlayerAction[]): InferredBehavior {
  if (actions.length === 0) {
    return {
      params: { "preflop.open": DEFAULT_PARAMS },
      confidence: 0,
      description: "No actions observed yet.",
      pattern: "unknown",
    };
  }

  // Count action types
  const folds = actions.filter(a => a.actionType === "fold").length;
  const calls = actions.filter(a => a.actionType === "call").length;
  const checks = actions.filter(a => a.actionType === "check").length;
  const raises = actions.filter(a => a.actionType === "raise" || a.actionType === "bet").length;
  const total = actions.length;

  const foldRate = folds / total;
  const callRate = calls / total;
  const passiveRate = (folds + calls + checks) / total;
  const aggressiveRate = raises / total;

  // Derive behavioral params from observed rates
  // Profiles use percentage scale (0-100), not fractions (0-1)
  // With very few actions, blend toward GTO defaults to avoid wild extrapolation
  const gtoDefault = { continuePct: 30, raisePct: 20 }; // reasonable GTO baseline
  const sampleWeight = total >= 8 ? 1.0 : total >= 4 ? 0.7 : total >= 2 ? 0.4 : 0.2;
  const observedContinue = (1 - foldRate) * 100;
  const observedRaise = aggressiveRate * 100;
  const continuePct = observedContinue * sampleWeight + gtoDefault.continuePct * (1 - sampleWeight);
  const raisePct = observedRaise * sampleWeight + gtoDefault.raisePct * (1 - sampleWeight);
  const bluffFrequency = aggressiveRate > 0.3 ? 0.4 : 0.2; // aggressive players bluff more (stays 0-1)
  const positionAwareness = 0.5; // can't infer from actions alone

  // Detect pattern — require minimum 3 actions to classify
  let pattern: BehaviorPattern = "unknown";
  if (total >= 3) {
    pattern = "balanced";
    if (foldRate > 0.7) {
      pattern = aggressiveRate > 0.15 ? "tight-aggressive" : "tight-passive";
    } else if (foldRate < 0.3) {
      // Need a higher aggression bar for LAG classification — a fish who occasionally
      // raises shouldn't be labeled as aggressive. Require >40% aggressive rate
      // AND at least 3 aggressive actions to avoid small-sample misclassification.
      const aggressiveActions = actions.filter(a =>
        a.actionType === "raise" || a.actionType === "bet"
      ).length;
      pattern = (aggressiveRate > 0.4 && aggressiveActions >= 3) ? "loose-aggressive" : "loose-passive";
    }
  }

  // Confidence based on sample size.
  // Single-hand inference is unreliable — cap at 0.7 unless we have 15+ actions
  // (which implies multi-hand observation via session memory).
  let confidence = 0;
  if (total >= 15) confidence = 0.85;
  else if (total >= 10) confidence = 0.7;
  else if (total >= 5) confidence = 0.5;
  else if (total >= 3) confidence = 0.3;
  else confidence = 0.15;

  // Build description
  const descriptions: Record<BehaviorPattern, string> = {
    "tight-passive": `Tight and passive — folded ${(foldRate * 100).toFixed(0)}% of the time, rarely aggressive.`,
    "tight-aggressive": `Tight but aggressive — selective but raises when involved.`,
    "loose-passive": `Loose and passive — calls ${(callRate * 100).toFixed(0)}% of the time, rarely raises.`,
    "loose-aggressive": `Loose and aggressive — plays many hands and bets/raises ${(aggressiveRate * 100).toFixed(0)}% of the time.`,
    "balanced": `Balanced play — no clear pattern detected from ${total} actions.`,
    "unknown": "Not enough actions to determine a pattern.",
  };

  const sizings: import("../types/opponents").SizingPreference[] =
    aggressiveRate > 0.3
      ? [{ action: "bet", sizingPct: 100, weight: 1 }]
      : [{ action: "bet", sizingPct: 67, weight: 1 }];

  const inferredParams: BehavioralParams = {
    continuePct,
    raisePct,
    bluffFrequency,
    positionAwareness,
    sizings,
    explanation: `Inferred from ${total} observed actions.`,
  };

  // Apply to common situations
  const params: Partial<Record<SituationKey, BehavioralParams>> = {
    "preflop.open": inferredParams,
    "preflop.facing_raise": { ...inferredParams, continuePct: continuePct * 0.8 },
    "postflop.aggressor.ip": inferredParams,
    "postflop.aggressor.oop": inferredParams,
    "postflop.caller.ip": inferredParams,
    "postflop.caller.oop": inferredParams,
    "postflop.facing_bet": { ...inferredParams, continuePct: continuePct * 0.9 },
  };

  return {
    params,
    confidence,
    description: descriptions[pattern],
    pattern,
  };
}

/**
 * Build a synthetic OpponentProfile from inferred behavior.
 * This allows the existing estimateRange() to work without
 * a pre-assigned profile — the "profile" is inferred from actions.
 */
export function buildInferredProfile(
  actions: PlayerAction[],
  position?: string,
): import("../types/opponents").OpponentProfile {
  const inferred = inferBehavior(actions);

  // Build a complete situation map from inferred params
  const defaultParams = inferred.params["preflop.open"] ?? DEFAULT_PARAMS;
  const situations: Record<SituationKey, BehavioralParams> = {
    "preflop.open": inferred.params["preflop.open"] ?? defaultParams,
    "preflop.facing_raise": inferred.params["preflop.facing_raise"] ?? defaultParams,
    "preflop.facing_3bet": { ...defaultParams, continuePct: defaultParams.continuePct * 0.6 },
    "preflop.facing_4bet": { ...defaultParams, continuePct: defaultParams.continuePct * 0.3 },
    "preflop.facing_limpers": inferred.params["preflop.open"] ?? defaultParams,
    "preflop.bb_vs_limpers": inferred.params["preflop.open"] ?? defaultParams,
    "preflop.sb_complete": inferred.params["preflop.open"] ?? defaultParams,
    "postflop.aggressor.ip": inferred.params["postflop.aggressor.ip"] ?? defaultParams,
    "postflop.aggressor.oop": inferred.params["postflop.aggressor.oop"] ?? defaultParams,
    "postflop.caller.ip": inferred.params["postflop.caller.ip"] ?? defaultParams,
    "postflop.caller.oop": inferred.params["postflop.caller.oop"] ?? defaultParams,
    "postflop.facing_bet": inferred.params["postflop.facing_bet"] ?? defaultParams,
    "postflop.facing_raise": { ...defaultParams, continuePct: defaultParams.continuePct * 0.7 },
    "postflop.facing_allin": { ...defaultParams, continuePct: defaultParams.continuePct * 0.4 },
  };

  return {
    id: `inferred-${inferred.pattern}`,
    name: `Inferred (${inferred.pattern})`,
    description: inferred.description,
    engineId: "modified-gto",
    situations,
  };
}
