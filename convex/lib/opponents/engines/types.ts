/**
 * Decision Engine type contracts.
 *
 * A DecisionEngine is a pluggable strategy for choosing actions.
 * Each engine implements the same interface but uses different
 * reasoning: basic (sample from behavioral %), range-aware
 * (pot odds + board texture), or GTO (future).
 *
 * Engines MUST be stateless, deterministic (given same PRNG seed),
 * and pure (no side effects, no Convex imports).
 */
import type { GameState, LegalActions, ActionType } from "../../state/gameState";
import type {
  OpponentProfile,
  SituationKey,
  BehavioralParams,
} from "../../types/opponents";
import type { ExplanationNode } from "../../types/analysis";
import type { CardIndex } from "../../types/cards";
import type { NarrativeArcTracker, RenderedNarrative } from "./narrativeTypes";

// ═══════════════════════════════════════════════════════
// DECISION CONTEXT — immutable snapshot for engine input
// ═══════════════════════════════════════════════════════

/**
 * Everything an engine needs to make a decision.
 * Constructed by chooseActionFromProfile and passed to engine.decide().
 */
export interface DecisionContext {
  /** Full game state snapshot. */
  state: GameState;
  /** The seat making the decision. */
  seatIndex: number;
  /** The profile driving this seat. */
  profile: OpponentProfile;
  /** Fully resolved situation map (all 11 keys populated). */
  resolvedParams: Record<SituationKey, BehavioralParams>;
  /** The classified situation for this decision point. */
  situationKey: SituationKey;
  /** The specific BehavioralParams for the current situation. */
  params: BehavioralParams;
  /** Legal actions available. */
  legal: LegalActions;
  /** Current pot size (total). */
  potSize: number;
  /** Hole cards for this seat (may be undefined if hidden). */
  holeCards: CardIndex[] | undefined;
  /** Lookup function for base profiles (inheritance resolution). */
  getBase: (id: string) => OpponentProfile | undefined;
  /** Deterministic PRNG — engines MUST use this, not Math.random. */
  random: () => number;
  /** Map of seatIndex → OpponentProfile for table opponents (for fold equity). */
  opponentProfiles?: Map<number, OpponentProfile>;
  /** Narrative arc tracker for multi-street story coherence (optional). */
  narrativeArc?: NarrativeArcTracker;
}

// ═══════════════════════════════════════════════════════
// ENGINE DECISION — rich output with teaching explanation
// ═══════════════════════════════════════════════════════

/**
 * The result of an engine's decide() call.
 * Richer than AutoPlayDecision — includes a full ExplanationNode tree.
 */
export interface EngineDecision {
  actionType: ActionType;
  amount?: number;
  situationKey: SituationKey;
  /** Multi-level explanation tree suitable for coaching UI. */
  explanation: ExplanationNode;
  /** Which engine produced this decision. */
  engineId: string;
  /** Optional structured reasoning data (engine-specific). */
  reasoning?: Record<string, unknown>;
  /** Structured narrative for UI display (optional, present when narrative engine is active). */
  narrative?: RenderedNarrative;
}

// ═══════════════════════════════════════════════════════
// DECISION ENGINE — the pluggable interface
// ═══════════════════════════════════════════════════════

/**
 * A decision engine chooses actions for a seat given game state + profile.
 *
 * Engines MUST be:
 * - Stateless (no instance variables between calls)
 * - Deterministic (given same PRNG seed)
 * - Pure (no side effects, no Convex imports)
 */
export interface DecisionEngine {
  id: string;
  name: string;
  description: string;
  decide(ctx: DecisionContext): EngineDecision;
}

/** Human-readable labels for SituationKey values (engine-layer, no React). */
const SITUATION_LABELS: Record<string, string> = {
  "preflop.open":            "Open Raise",
  "preflop.facing_raise":    "vs Raise",
  "preflop.facing_3bet":     "vs 3-Bet",
  "preflop.facing_4bet":     "vs 4-Bet+",
  "postflop.aggressor.ip":   "C-Bet IP",
  "postflop.aggressor.oop":  "C-Bet OOP",
  "postflop.caller.ip":      "Probe IP",
  "postflop.caller.oop":     "Check / Donk OOP",
  "postflop.facing_bet":     "vs Bet",
  "postflop.facing_raise":   "vs Raise / X-R",
  "postflop.facing_allin":   "vs All-In",
};

/** Format a SituationKey into a poker-friendly label for explanation text. */
export function formatSituation(key: string): string {
  return SITUATION_LABELS[key] ?? key;
}
