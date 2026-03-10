/**
 * Engine Registry — manages decision engine implementations.
 *
 * Follows the same pattern as lensRegistry.ts:
 * engines register themselves at module scope, the dispatcher
 * looks them up by ID at decision time.
 */
import type { DecisionEngine } from "./types";

const registry = new Map<string, DecisionEngine>();

/**
 * Register a decision engine in the global registry.
 */
export function registerEngine(engine: DecisionEngine): void {
  registry.set(engine.id, engine);
}

/**
 * Get a decision engine by ID.
 */
export function getEngine(id: string): DecisionEngine | undefined {
  return registry.get(id);
}

/**
 * Get all registered engines.
 */
export function getAllEngines(): DecisionEngine[] {
  return [...registry.values()];
}

/**
 * Get an engine by ID, falling back to "basic" if the ID is
 * missing or not found. Throws if "basic" isn't registered.
 */
export function getEngineOrDefault(id?: string): DecisionEngine {
  if (id) {
    const engine = registry.get(id);
    if (engine) return engine;
  }
  const basic = registry.get("basic");
  if (!basic) {
    throw new Error(
      `Engine "${id ?? "basic"}" not found and no "basic" fallback registered. ` +
      `Did you import the engine module?`,
    );
  }
  return basic;
}
