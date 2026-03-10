/**
 * Decision Engines barrel export.
 *
 * Importing this module ensures all built-in engines are registered.
 */
export type { DecisionEngine, DecisionContext, EngineDecision } from "./types";
export {
  registerEngine,
  getEngine,
  getAllEngines,
  getEngineOrDefault,
} from "./engineRegistry";

// ─── Import engines to trigger self-registration ───
export { basicEngine } from "./basicEngine";
export { rangeAwareEngine } from "./rangeAwareEngine";
