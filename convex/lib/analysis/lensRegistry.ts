/**
 * Lens Registry — manages and runs analysis lenses.
 *
 * Lenses register themselves; the workspace tells the registry which
 * lenses are active and gives it an AnalysisContext. The registry
 * runs all active lenses and returns their results.
 */
import type { AnalysisLens, AnalysisContext, AnalysisResult } from "../types/analysis";
import { rawEquityLens } from "./rawEquity";
import { threatLens } from "./threats";
import { outsLens } from "./outs";
import { drawLens } from "./draws";
import { opponentReadLens } from "./opponentRead";
import { monteCarloLens } from "./monteCarloLens";
import { coachingLens } from "./coachingLens";

const registry = new Map<string, AnalysisLens>();

/**
 * Register a lens in the global registry.
 */
export function registerLens(lens: AnalysisLens): void {
  registry.set(lens.id, lens);
}

/**
 * Get a lens by ID.
 */
export function getLens(id: string): AnalysisLens | undefined {
  return registry.get(id);
}

/**
 * Get all registered lenses.
 */
export function getAllLenses(): AnalysisLens[] {
  return [...registry.values()];
}

/**
 * Get metadata for all registered lenses (for UI lens selector).
 */
export function getLensInfo(): { id: string; name: string; description: string; heavy?: boolean }[] {
  return getAllLenses().map((l) => ({
    id: l.id,
    name: l.name,
    description: l.description,
    heavy: l.heavy,
  }));
}

/**
 * Check if a lens is marked as heavy (expensive computation).
 */
export function isHeavyLens(id: string): boolean {
  return registry.get(id)?.heavy === true;
}

/**
 * Run specific lenses against a context.
 * Returns a map of lensId → AnalysisResult.
 */
export function runLenses(
  context: AnalysisContext,
  activeLensIds: string[],
): Map<string, AnalysisResult> {
  const results = new Map<string, AnalysisResult>();

  for (const id of activeLensIds) {
    const lens = registry.get(id);
    if (lens) {
      results.set(id, lens.analyze(context));
    }
  }

  return results;
}

/**
 * Run ALL registered lenses against a context.
 */
export function runAllLenses(
  context: AnalysisContext,
): Map<string, AnalysisResult> {
  return runLenses(
    context,
    getAllLenses().map((l) => l.id),
  );
}

// ─── Register built-in lenses ───
registerLens(rawEquityLens);
registerLens(threatLens);
registerLens(outsLens);
registerLens(drawLens);
registerLens(opponentReadLens);
registerLens(monteCarloLens);
registerLens(coachingLens);
