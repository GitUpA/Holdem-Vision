/**
 * Narrative Engine type contracts.
 *
 * The narrative engine transforms profile modifier parameters into
 * character-coherent stories. Instead of "foldScale=2.1 → fold",
 * it produces "The NIT folded because the board got scary and they
 * don't fight for marginal spots."
 *
 * Three-stage pipeline:
 * 1. deriveTraits(modifier) → NarrativeTrait[] (personality from numbers)
 * 2. interpretSituation(profile, factors, action) → SituationInterpretation
 * 3. renderNarrative(interpretation) → RenderedNarrative
 *
 * Pure TypeScript, zero Convex imports.
 */
import type { ExplanationNode } from "../../types/analysis";
import type { ActionType } from "../../state/game-state";
import type { SituationKey } from "../../types/opponents";
import type { Street } from "../../types/cards";

// ═══════════════════════════════════════════════════════
// NARRATIVE TRAITS — personality dimensions from numbers
// ═══════════════════════════════════════════════════════

/**
 * A single personality dimension derived from modifier parameters.
 * Traits are the bridge between numbers and stories.
 */
export interface NarrativeTrait {
  /** Machine-readable ID: "cautious", "aggressive", "price-sensitive" */
  id: TraitId;
  /** Human-readable label for UI display */
  label: string;
  /** How strongly this trait manifests, 0-1 */
  strength: number;
  /** Which modifier parameter(s) this trait comes from */
  source: TraitSource;
}

/** All possible trait IDs. */
export type TraitId =
  | "cautious"
  | "sticky"
  | "aggressive"
  | "passive"
  | "raise-happy"
  | "call-heavy"
  | "big-bettor"
  | "small-bettor"
  | "hand-reader"
  | "price-sensitive"
  | "positional"
  | "fold-equity-exploiter"
  | "draw-chaser"
  | "texture-reader"
  | "spr-aware"
  | "balanced"
  | "extreme";

/** Where a trait comes from — enables composability. */
export type TraitSource =
  | { type: "fold"; foldScale: number }
  | { type: "aggression"; aggressionScale: number }
  | { type: "callBias"; raiseVsCallBias: number }
  | { type: "sizing"; sizingBias: number }
  | { type: "sensitivity"; factor: string; value: number }
  | { type: "intensity"; intensity: number };

// ═══════════════════════════════════════════════════════
// NARRATIVE PROFILE — cached personality fingerprint
// ═══════════════════════════════════════════════════════

/**
 * The personality fingerprint derived from a ProfileModifierMap.
 * Computed once per profile, cached. Drives all narrative generation.
 */
export interface NarrativeProfile {
  /** Profile ID (e.g., "nit", "fish", "tag") */
  profileId: string;
  /** Dominant personality traits, sorted by strength descending */
  traits: NarrativeTrait[];
  /** Overall character archetype: "The Rock", "The Loose Cannon" */
  characterLabel: string;
  /** One-sentence character summary */
  characterSummary: string;
}

// ═══════════════════════════════════════════════════════
// SITUATION INTERPRETATION — structured reasoning
// ═══════════════════════════════════════════════════════

/**
 * How the profile perceives a specific game situation.
 * This is the "internal monologue" that drives both action and story.
 */
export interface NarrativePerception {
  /** How the profile sees hand strength: "strong enough", "not confident" */
  handAssessment: string;
  /** How the profile sees the board: "scary", "perfect for my hand" */
  boardAssessment: string;
  /** How the profile sees the price: "too expensive", "great odds" */
  priceAssessment: string;
  /** How the profile sees position: "safe to act", "vulnerable" */
  positionAssessment: string;
  /** How the profile sees opponents: "likely to fold", "sticky" */
  opponentAssessment: string;
}

/**
 * A trait that actively influenced the decision, with explanation.
 */
export interface ActiveTrait {
  trait: NarrativeTrait;
  /** How this trait influenced the action */
  influence: string;
  /** Was this trait attenuated by context? If so, why */
  attenuation?: { factor: string; reason: string };
}

/**
 * The profile's complete interpretation of a specific situation.
 */
export interface SituationInterpretation {
  /** What the profile "sees" through its personality lens */
  perception: NarrativePerception;
  /** Which traits are active and how they influenced the decision */
  activeTraits: ActiveTrait[];
  /** The dominant reason for the chosen action */
  primaryReason: string;
  /** Secondary factors that contributed */
  secondaryReasons: string[];
  /** What the profile would say about context overriding default behavior */
  contextOverride?: string;
  /** Reference to previous street decisions for coherence */
  storyArc?: StoryArcReference;
}

// ═══════════════════════════════════════════════════════
// MULTI-STREET COHERENCE
// ═══════════════════════════════════════════════════════

/**
 * A snapshot of what happened on a previous street.
 */
export interface StreetDecisionSummary {
  street: Street;
  action: ActionType;
  /** Was this a value action, bluff, or defensive play? */
  intent: "value" | "bluff" | "defensive" | "unknown";
  /** One-line narrative summary */
  narrativeSummary: string;
}

/**
 * Multi-street story coherence reference.
 */
export interface StoryArcReference {
  /** What happened on previous streets */
  previousActions: StreetDecisionSummary[];
  /** How current action connects to previous */
  continuityNarrative: string;
}

// ═══════════════════════════════════════════════════════
// RENDERED NARRATIVE — final output at multiple fidelities
// ═══════════════════════════════════════════════════════

/**
 * Final rendered narrative at multiple fidelity levels.
 * UI picks the appropriate level for its display context.
 */
export interface RenderedNarrative {
  /** One-line: "Folds — not confident enough to continue" */
  oneLiner: string;
  /** Full paragraph: character reasoning in plain language */
  paragraph: string;
  /** Structured ExplanationNode tree for the coaching UI */
  explanationTree: ExplanationNode;
  /** The full interpretation (for advanced display) */
  interpretation: SituationInterpretation;
  /** Character info (for badges/labels) */
  character: {
    label: string;
    summary: string;
  };
}

// ═══════════════════════════════════════════════════════
// NARRATIVE ARC TRACKER INTERFACE
// ═══════════════════════════════════════════════════════

/**
 * Tracks per-seat, per-street decision narratives for multi-street coherence.
 * Instantiated once per hand, passed through DecisionContext.
 */
export interface NarrativeArcTracker {
  /** Record a decision for a seat on a street */
  recordDecision(
    seatIndex: number,
    street: Street,
    action: ActionType,
    intent: StreetDecisionSummary["intent"],
    narrativeSummary: string,
  ): void;

  /** Get the story arc for a seat up to the current point */
  getArc(seatIndex: number): StoryArcReference | undefined;

  /** Reset for a new hand */
  reset(): void;
}

// ═══════════════════════════════════════════════════════
// NARRATIVE ENGINE INPUT — everything needed to build a narrative
// ═══════════════════════════════════════════════════════

/**
 * Input to the narrative engine orchestrator.
 * Contains everything from the modifier pipeline needed to build a story.
 */
export interface NarrativeInput {
  /** The profile making the decision */
  profileId: string;
  /** Display name of the profile (e.g., "NIT (Ultra-tight)") */
  profileName?: string;
  /** Current situation classification */
  situationKey: SituationKey;
  /** The chosen action */
  action: { actionType: ActionType; amount?: number };
  /** Context factors computed by contextAnalysis */
  factors: import("./modifiedGtoTypes").ContextFactors;
  /** The base (pre-attenuation) situation modifier */
  baseModifier: import("./modifiedGtoTypes").SituationModifier;
  /** The effective (post-attenuation) frequency modifier */
  effectiveModifier: import("./modifiedGtoTypes").FrequencyModifier;
  /** GTO base frequencies (before profile modification) */
  gtoFrequencies: import("../../gto/tables/types").ActionFrequencies;
  /** Modified frequencies (after profile adjustment) */
  modifiedFrequencies: import("../../gto/tables/types").ActionFrequencies;
  /** Whether GTO came from solver or heuristic */
  gtoSource: "solver" | "heuristic" | "equity" | "pokerbench";
  /** Multi-street arc tracker (optional) */
  arc?: NarrativeArcTracker;
}
