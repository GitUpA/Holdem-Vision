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

export { detectDraws, type DrawInfo, type DrawType } from "./drawDetector";

// ─── Import engines to trigger self-registration ───
export { basicEngine } from "./basicEngine";
export { rangeAwareEngine } from "./rangeAwareEngine";
export { gtoEngine } from "./gtoEngine";
export { lookupGtoEngine } from "./lookupGtoEngine";
