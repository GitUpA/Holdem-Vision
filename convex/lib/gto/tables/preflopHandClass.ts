/**
 * Preflop Hand Class Types
 *
 * Previously contained a full frequency table registry and lookup system.
 * The preflop system now uses range classifications (preflopClassification.ts)
 * instead. Only the types that are still referenced by other modules are kept.
 *
 * Pure TypeScript, zero Convex imports.
 */

// ═══════════════════════════════════════════════════════
// TYPES (still used by frequencyLookup, dataConfidence, coachingLens, drillPipeline, UI)
// ═══════════════════════════════════════════════════════

export type ConfidenceLevel = "reliable" | "good" | "approximate";

export interface PreflopConfidence {
  level: ConfidenceLevel;
  sampleCount: number;
  /** Plain-language explanation for the UI */
  label: string;
  /** Slightly longer explanation */
  detail: string;
}
