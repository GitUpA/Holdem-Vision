/**
 * GTO module — archetype classification, hand categorization, and frequency table lookups.
 *
 * Pure TypeScript, zero Convex imports.
 */
export {
  classifyArchetype,
  contextFromGameState,
  derivePotType,
  deriveIsAggressor,
  deriveIsInPosition,
  ALL_ARCHETYPE_IDS,
  type ArchetypeId,
  type ArchetypeCategory,
  type ArchetypeClassification,
  type ClassificationContext,
  type PotType,
  type ActionSummary,
} from "./archetypeClassifier";

export {
  categorizeHand,
  closestCategory,
  categoryStrength,
  type HandCategory,
  type HandCategorization,
} from "./handCategorizer";

export {
  registerTable,
  getTable,
  hasTable,
  hasAnyTableForStreet,
  registeredArchetypes,
  tableCount,
  clearTables,
  lookupFrequencies,
  getPositionFrequencies,
  solverOutputToTable,
  type FrequencyTable,
  type PositionFrequencies,
  type ActionFrequencies,
  type GtoAction,
  type FrequencyLookup,
  type SolverOutput,
} from "./tables";

export {
  scoreAction,
  normalizeToGtoAction,
  type ActionScore,
  type Verdict,
} from "./evScoring";

export {
  explainArchetype,
} from "./archetypeExplainer";

export {
  dealForArchetype,
  type DrillConstraints,
  type ConstrainedDeal,
} from "./constrainedDealer";

export {
  gtoActionToGameAction,
  gtoActionLabel,
  type GameActionResult,
} from "./actionMapping";

export {
  getPrototype,
  getAllPrototypes,
  getPrototypeHands,
  getTeachingContent,
  type ArchetypePrototype,
  type BoardConstraint,
  type DerivativeShift,
} from "./archetypePrototypes";
