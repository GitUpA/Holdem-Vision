/**
 * Postflop Per-Hand-Class Frequency Tables (PokerBench)
 *
 * Fallback layer for postflop decisions when solver per-hand-class data
 * isn't available for the specific hand class. Aggregated from PokerBench
 * 500k solver-optimal postflop decisions.
 *
 * Lookup: (archetype, handClass, IP/OOP, street) → fold/check/call/raise frequencies.
 *
 * Pure TypeScript, zero Convex imports.
 */

import type { ActionFrequencies } from "./types";
import type { ArchetypeId } from "../archetypeClassifier";
import type { Street } from "../../types/cards";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export interface PostflopHandClassFrequency {
  fold: number;
  check: number;
  call: number;
  raise: number;
  sampleCount: number;
}

export interface PostflopHandClassTable {
  archetypeId: string;
  source: string;
  totalRows: number;
  /** street → ip/oop → handClass → frequencies */
  streets: Partial<Record<string, Partial<Record<string, Record<string, PostflopHandClassFrequency>>>>>;
}

// ═══════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════

const registry = new Map<string, PostflopHandClassTable>();

const MIN_SAMPLE_THRESHOLD = 3;

export function registerPostflopHandClassTable(table: PostflopHandClassTable): void {
  registry.set(table.archetypeId, table);
}

export function lookupPostflopHandClass(
  archetypeId: ArchetypeId | string,
  handClass: string,
  isInPosition: boolean,
  street: Street | string,
): PostflopHandClassFrequency | null {
  const table = registry.get(archetypeId);
  if (!table) return null;

  const streetData = table.streets[street.toLowerCase()];
  if (!streetData) return null;

  const posKey = isInPosition ? "ip" : "oop";
  const posData = streetData[posKey];
  if (!posData) return null;

  const freq = posData[handClass];
  if (!freq) return null;
  if (freq.sampleCount < MIN_SAMPLE_THRESHOLD) return null;

  return freq;
}

export function hasPostflopHandClassData(archetypeId: ArchetypeId | string): boolean {
  return registry.has(archetypeId);
}

// ═══════════════════════════════════════════════════════
// ACTION MAPPING
// ═══════════════════════════════════════════════════════

/** Map postflop fold/check/call/raise to ActionFrequencies with GTO action keys. */
export function postflopHandClassToActionFrequencies(
  freq: PostflopHandClassFrequency,
): ActionFrequencies {
  // Map "raise" to bet_medium (most common postflop sizing)
  const result: ActionFrequencies = {};
  if (freq.fold > 0.001) result.fold = freq.fold;
  if (freq.check > 0.001) result.check = freq.check;
  if (freq.call > 0.001) result.call = freq.call;
  if (freq.raise > 0.001) result.bet_medium = freq.raise;
  return result;
}
