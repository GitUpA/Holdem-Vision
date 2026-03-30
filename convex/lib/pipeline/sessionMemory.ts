/**
 * Session Memory — accumulates per-villain action stats across hands.
 *
 * Enables adaptive profiles: the "perfect exploiter" reads villain patterns
 * from accumulated data and adjusts its modifier vector dynamically.
 *
 * Pure TypeScript, zero persistence. Lives in memory during a batch run
 * or browser session. Convex persistence is a future enhancement.
 *
 * Pure TypeScript, zero Convex imports.
 */

import type { SituationKey } from "../types/opponents";
import type { ActionType } from "../state/gameState";
import type { BehaviorPattern } from "../opponents/behaviorInference";
import type { ProfileModifierMap, SituationModifier } from "../opponents/engines/modifiedGtoTypes";
import { identitySituationModifier } from "../opponents/engines/modifiedGtoTypes";
import { ALL_SITUATION_KEYS } from "../types/opponents";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export interface SituationStats {
  total: number;
  folds: number;
  calls: number;
  raises: number;
  checks: number;
}

export interface VillainMemory {
  seatIndex: number;
  stats: Partial<Record<SituationKey, SituationStats>>;
  handsObserved: number;
}

export interface PatternRead {
  pattern: BehaviorPattern;
  confidence: number;
  foldRate: number;
  aggressiveRate: number;
  totalActions: number;
}

// ═══════════════════════════════════════════════════════
// SESSION MEMORY
// ═══════════════════════════════════════════════════════

export class SessionMemory {
  villains = new Map<number, VillainMemory>();
  handsCompleted = 0;

  /** Record a single action for a villain in a given situation. */
  recordAction(seatIndex: number, situation: SituationKey, action: ActionType): void {
    let villain = this.villains.get(seatIndex);
    if (!villain) {
      villain = { seatIndex, stats: {}, handsObserved: 0 };
      this.villains.set(seatIndex, villain);
    }

    let stats = villain.stats[situation];
    if (!stats) {
      stats = { total: 0, folds: 0, calls: 0, raises: 0, checks: 0 };
      villain.stats[situation] = stats;
    }

    stats.total++;
    if (action === "fold") stats.folds++;
    else if (action === "call") stats.calls++;
    else if (action === "check") stats.checks++;
    else if (action === "bet" || action === "raise" || action === "all_in") stats.raises++;
  }

  /** Mark a hand as completed for a villain. */
  recordHandComplete(seatIndex: number): void {
    const villain = this.villains.get(seatIndex);
    if (villain) villain.handsObserved++;
    this.handsCompleted++;
  }

  /** Get the inferred behavior pattern for a villain from session data. */
  getPattern(seatIndex: number): PatternRead {
    const villain = this.villains.get(seatIndex);
    if (!villain) {
      return { pattern: "unknown", confidence: 0, foldRate: 0, aggressiveRate: 0, totalActions: 0 };
    }

    // Aggregate across all situations
    let totalActions = 0;
    let totalFolds = 0;
    let totalCalls = 0;
    let totalRaises = 0;

    for (const stats of Object.values(villain.stats)) {
      if (!stats) continue;
      totalActions += stats.total;
      totalFolds += stats.folds;
      totalCalls += stats.calls;
      totalRaises += stats.raises;
    }

    if (totalActions === 0) {
      return { pattern: "unknown", confidence: 0, foldRate: 0, aggressiveRate: 0, totalActions: 0 };
    }

    const foldRate = totalFolds / totalActions;
    const continueActions = totalActions - totalFolds;
    const aggressiveRate = continueActions > 0 ? totalRaises / continueActions : 0;

    // Classify pattern (same logic as behaviorInference.ts but with more data)
    let pattern: BehaviorPattern = "balanced";
    if (totalActions < 5) {
      pattern = "unknown";
    } else if (foldRate > 0.65) {
      pattern = aggressiveRate > 0.4 ? "tight-aggressive" : "tight-passive";
    } else if (foldRate < 0.35) {
      pattern = aggressiveRate > 0.4 ? "loose-aggressive" : "loose-passive";
    }

    // Confidence from sample size
    let confidence = 0;
    if (totalActions >= 30) confidence = 0.9;
    else if (totalActions >= 20) confidence = 0.8;
    else if (totalActions >= 10) confidence = 0.6;
    else if (totalActions >= 5) confidence = 0.4;
    else confidence = 0.15;

    return { pattern, confidence, foldRate, aggressiveRate, totalActions };
  }

  /**
   * Generate a dynamic modifier map for countering the detected pattern.
   *
   * This is the core of the "perfect exploiter" — it converts observed
   * behavior into the optimal counter-modifier, scaled by confidence.
   */
  getCounterModifier(seatIndex: number): ProfileModifierMap {
    const { pattern, confidence } = this.getPattern(seatIndex);

    // Counter-modifier templates (from counterStrategyMap.ts principles)
    const counterModifiers: Record<BehaviorPattern, Partial<SituationModifier["base"]>> = {
      // vs tight-passive (NIT): bluff more, steal more
      "tight-passive": {
        foldScale: 0.6,          // fold less (play more hands)
        aggressionScale: 1.5,    // bet/raise more
        raiseVsCallBias: 0.3,    // prefer raising
        intensity: 1.0,
      },
      // vs tight-aggressive (TAG): tighten up, trap
      "tight-aggressive": {
        foldScale: 1.1,          // slightly tighter
        aggressionScale: 0.8,    // less aggression (trap)
        raiseVsCallBias: -0.2,   // prefer calling (trapping)
        intensity: 1.0,
      },
      // vs loose-passive (FISH): value bet relentlessly, never bluff
      "loose-passive": {
        foldScale: 0.9,          // slightly wider (they call everything)
        aggressionScale: 1.3,    // more aggression (value betting)
        raiseVsCallBias: 0.2,    // prefer raising for value
        intensity: 1.0,
      },
      // vs loose-aggressive (LAG): tighten up, let them bluff into you
      "loose-aggressive": {
        foldScale: 1.0,          // stay balanced
        aggressionScale: 0.7,    // less aggression (let them bet)
        raiseVsCallBias: -0.4,   // prefer calling (catching bluffs)
        intensity: 1.0,
      },
      // vs balanced/unknown: stay GTO
      "balanced": { foldScale: 1.0, aggressionScale: 1.0, raiseVsCallBias: 0.0, intensity: 0 },
      "unknown": { foldScale: 1.0, aggressionScale: 1.0, raiseVsCallBias: 0.0, intensity: 0 },
    };

    const counter = counterModifiers[pattern] ?? counterModifiers["unknown"];
    // Scale intensity by confidence — low data → mostly GTO
    const scaledIntensity = (counter.intensity ?? 0) * confidence;

    // Build full modifier map — same counter applied to all situations
    const modifierMap: ProfileModifierMap = {} as ProfileModifierMap;
    for (const key of ALL_SITUATION_KEYS) {
      modifierMap[key] = {
        base: {
          foldScale: counter.foldScale ?? 1.0,
          aggressionScale: counter.aggressionScale ?? 1.0,
          raiseVsCallBias: counter.raiseVsCallBias ?? 0.0,
          sizingBias: 0,
          intensity: scaledIntensity,
        },
        context: {
          handStrengthSensitivity: 0.3,
          textureSensitivity: 0.2,
          potOddsSensitivity: 0.2,
          positionSensitivity: 0.3,
          foldEquitySensitivity: 0.2,
          sprSensitivity: 0.1,
          drawSensitivity: 0.2,
        },
        deviationReason: `Adapting to ${pattern} pattern (confidence: ${(confidence * 100).toFixed(0)}%)`,
      };
    }

    return modifierMap;
  }

  /** Reset all memory. */
  reset(): void {
    this.villains.clear();
    this.handsCompleted = 0;
  }
}
