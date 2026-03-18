/**
 * Preflop Per-Hand-Class Frequency Tables
 *
 * Parallel lookup layer for preflop decisions keyed by hand class (e.g., "AKs", "A2o")
 * instead of coarse HandCategory. Aggregated from PokerBench 60k solver-optimal decisions.
 *
 * Position-aware: frequencies vary by opener position (e.g., defending BB vs UTG ≠ vs BTN).
 * Falls back to aggregate "any" opener when specific opener data is missing.
 *
 * Pure TypeScript, zero Convex imports.
 */

import type { Position } from "../../types/cards";
import type { ActionFrequencies } from "./types";
import type { ArchetypeId } from "../archetypeClassifier";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export interface HandClassFrequency {
  fold: number;
  call: number;
  raise: number;
  sampleCount: number;
}

export type ConfidenceLevel = "reliable" | "good" | "approximate";

export interface PreflopConfidence {
  level: ConfidenceLevel;
  sampleCount: number;
  /** Plain-language explanation for the UI */
  label: string;
  /** Slightly longer explanation */
  detail: string;
}

export interface PreflopHandClassTable {
  archetypeId: string;
  source: string;
  totalRows: number;
  /** Keyed by opener position (e.g., "utg", "btn") + "any" for aggregate fallback */
  openers: Partial<Record<string, Partial<Record<string, Record<string, HandClassFrequency>>>>>;
  /** Legacy: flat positions map (backward compat, not used if openers exists) */
  positions?: Partial<Record<string, Record<string, HandClassFrequency>>>;
}

// ═══════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════

const registry = new Map<string, PreflopHandClassTable>();

/** Minimum observations required to trust a hand class frequency. */
const MIN_SAMPLE_THRESHOLD = 3;

/** Register a preflop hand class table. */
export function registerPreflopHandClassTable(table: PreflopHandClassTable): void {
  registry.set(table.archetypeId, table);
}

/**
 * Look up per-hand-class frequencies for a preflop scenario.
 *
 * @param archetypeId - Preflop archetype (rfi_opening, bb_defense_vs_rfi, etc.)
 * @param position - Hero's position (bb, sb, btn, etc.)
 * @param handClass - Hand class (AKs, A2o, TT, etc.)
 * @param openerPosition - Optional: who opened (for position-aware lookup)
 */
export function lookupPreflopHandClass(
  archetypeId: ArchetypeId | string,
  position: Position | string,
  handClass: string,
  openerPosition?: Position | string,
): HandClassFrequency | null {
  const table = registry.get(archetypeId);
  if (!table) return null;

  const pos = position.toLowerCase();
  const opener = openerPosition?.toLowerCase();

  // Try opener-specific lookup first, then "any" aggregate fallback
  if (table.openers) {
    // 1. Try specific opener
    if (opener) {
      const result = lookupInOpener(table.openers[opener], pos, handClass);
      if (result) return result;
    }

    // 2. Fall back to "any" (aggregate across all openers)
    const result = lookupInOpener(table.openers["any"], pos, handClass);
    if (result) return result;
  }

  // 3. Legacy: flat positions map (backward compat)
  if (table.positions) {
    const posData = table.positions[pos];
    if (posData) {
      const freq = posData[handClass];
      if (freq && freq.sampleCount >= MIN_SAMPLE_THRESHOLD) return freq;
    }
  }

  return null;
}

function lookupInOpener(
  openerData: Partial<Record<string, Record<string, HandClassFrequency>>> | undefined,
  position: string,
  handClass: string,
): HandClassFrequency | null {
  if (!openerData) return null;
  const posData = openerData[position];
  if (!posData) return null;
  const freq = posData[handClass];
  if (!freq) return null;
  if (freq.sampleCount < MIN_SAMPLE_THRESHOLD) return null;
  return freq;
}

/** Check if per-hand-class data exists for an archetype. */
export function hasPreflopHandClassData(archetypeId: ArchetypeId | string): boolean {
  return registry.has(archetypeId);
}

/** Get a plain-language confidence assessment for a preflop frequency lookup. */
export function getPreflopConfidence(freq: HandClassFrequency): PreflopConfidence {
  const n = freq.sampleCount;

  if (n >= 30) {
    return {
      level: "reliable",
      sampleCount: n,
      label: "Reliable",
      detail: `Based on ${n} solver scenarios — these percentages closely match what a solver would recommend.`,
    };
  }

  if (n >= 10) {
    return {
      level: "good",
      sampleCount: n,
      label: "Good estimate",
      detail: `Based on ${n} solver scenarios — a solid estimate, but the exact percentages could shift a few points with more data.`,
    };
  }

  return {
    level: "approximate",
    sampleCount: n,
    label: "Rough guide",
    detail: `Based on only ${n} solver scenarios — the general direction (fold vs play) is right, but the exact percentages are approximate.`,
  };
}

// ═══════════════════════════════════════════════════════
// ACTION MAPPING
// ═══════════════════════════════════════════════════════

/** Map the generic fold/call/raise frequencies to ActionFrequencies with proper GTO action keys. */
export function handClassToActionFrequencies(
  freq: HandClassFrequency,
  archetypeId: string,
): ActionFrequencies {
  const raiseAction = getRaiseAction(archetypeId);
  return {
    fold: freq.fold,
    call: freq.call,
    [raiseAction]: freq.raise,
  };
}

/** Get the appropriate raise action key for an archetype. */
function getRaiseAction(archetypeId: string): string {
  switch (archetypeId) {
    case "rfi_opening":
    case "blind_vs_blind":
      return "bet_medium"; // Standard open raise
    case "bb_defense_vs_rfi":
    case "three_bet_pots":
    case "four_bet_five_bet":
      return "bet_large"; // 3-bet+ sizing
    default:
      return "bet_medium";
  }
}
