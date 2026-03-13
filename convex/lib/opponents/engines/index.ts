/**
 * Decision Engines barrel export.
 *
 * Importing this module ensures the unified engine is registered.
 */
export type { DecisionEngine, DecisionContext, EngineDecision } from "./types";
export {
  registerEngine,
  getEngine,
  getAllEngines,
  getEngineOrDefault,
} from "./engineRegistry";

export { detectDraws, type DrawInfo, type DrawType } from "./drawDetector";

// ─── Import engine to trigger self-registration ───
export { modifiedGtoEngine } from "./modifiedGtoEngine";
