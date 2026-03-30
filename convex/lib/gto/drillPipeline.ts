/**
 * Drill Pipeline — pure TS orchestration for deal → solve → advance → remap.
 *
 * This is the **single source of truth** for the drill engine pipeline.
 * Both the React hook (use-drill-session) and tests import from here,
 * ensuring that what the user sees in the UI is exactly what tests verify.
 *
 * The architecture is designed so that every card, action, and decision
 * is auditable: the same pipeline produces identical output regardless of
 * whether it runs in a browser or in a test harness.
 *
 * Pure TypeScript, zero React imports, zero Convex imports.
 */
import type { CardIndex } from "../types/cards";
import type { GameState } from "../state/gameState";
import type { ExplanationNode } from "../types/analysis";
import type { ArchetypeId } from "./archetypeClassifier";
import type {
  GtoAction,
  ActionFrequencies,
  ActionFrequencyBands,
  ArchetypeAccuracy,
  AccuracyImpact,
} from "./tables/types";
import type { ConstrainedDeal, DrillConstraints } from "./constrainedDealer";
import { classifyPreflopHand, classificationToFrequencies } from "./preflopClassification";
import { comboToHandClass, cardsToCombo } from "../opponents/combos";
import type { HandSessionConfig } from "../session/types";

import { HandSession } from "../session/handSession";
import { PRESET_PROFILES } from "../opponents/presets";
import { currentLegalActions } from "../state/stateMachine";
import { dealForArchetype } from "./constrainedDealer";
import { remapFrequenciesToLegal } from "./actionMapping";
import {
  lookupFrequencies,
  getTable,
  getAccuracy,
} from "./tables/tableRegistry";
import { explainArchetype } from "./archetypeExplainer";
import { analyzeBoard } from "../opponents/engines/boardTexture";
import {
  estimateBoardAccuracy,
  scoreBoardTypicality,
  boardToFeatures,
  computeTopActionGap,
} from "./tables/types";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

/**
 * Full GTO solution for the current spot — computed at deal time.
 * The UI decides when/what to reveal (learn mode vs quiz mode).
 */
export interface SpotSolution {
  /** GTO frequency distribution for this hand category + position */
  frequencies: ActionFrequencies;
  /** The highest-frequency GTO action */
  optimalAction: GtoAction;
  /** How often GTO takes the optimal action */
  optimalFrequency: number;
  /** Available actions for this position */
  availableActions: GtoAction[];
  /** Teaching explanation (archetype + hand + position + why) */
  explanation: ExplanationNode;
  /** Whether the lookup was an exact category match */
  isExactMatch: boolean;
  /** Fallback category used (if not exact) */
  resolvedCategory: string;
  /** Frequency bands — range across solved boards (if solver data available) */
  bands?: ActionFrequencyBands;
  /** Archetype-level accuracy metrics (if available) */
  archetypeAccuracy?: ArchetypeAccuracy;
  /** Board-specific accuracy impact — the "within X BB" number */
  accuracyImpact?: AccuracyImpact;
  /** Preflop confidence based on solver scenario sample count */
  preflopConfidence?: import("./tables").PreflopConfidence;
}

/**
 * Complete result of dealing and advancing a drill hand.
 * Contains everything needed to render the UI or verify in tests.
 */
export interface DrillDealResult {
  /** The constrained deal output (cards, archetype, hand category) */
  deal: ConstrainedDeal;
  /** The HandSession after deal + auto-advance */
  session: HandSession;
  /** The game state at hero's decision point */
  state: GameState;
  /** Full GTO solution (remapped to match legal actions) */
  solution: SpotSolution | null;
}

// ═══════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════

const DEFAULT_BLINDS = { small: 1, big: 2 };
const DEFAULT_STACK_BB = 100;

const STREET_ORDER = ["preflop", "flop", "turn", "river"] as const;

// ═══════════════════════════════════════════════════════
// PIPELINE FUNCTIONS
// ═══════════════════════════════════════════════════════

/**
 * Derive the street from a community card count.
 */
export function streetFromCommunityCount(
  count: number,
): "preflop" | "flop" | "turn" | "river" {
  if (count <= 0) return "preflop";
  if (count <= 3) return "flop";
  if (count === 4) return "turn";
  return "river";
}

/**
 * Compute the full GTO solution for a deal.
 *
 * This is a pure function — no side effects, no React, no session state.
 * Returns null if no frequency data exists for this archetype/category.
 */
/**
 * Compute preflop solution using validated GTO ranges.
 * Same data as coaching + engine — DRY.
 */
function computePreflopSolution(deal: ConstrainedDeal): SpotSolution | null {
  const heroCards = deal.heroCards;
  if (heroCards.length < 2) return null;

  const combo = cardsToCombo(heroCards[0], heroCards[1]);
  const handClass = comboToHandClass(combo);
  const archId = deal.archetype.archetypeId;
  const position = deal.heroPosition;

  const classification = classifyPreflopHand(handClass, archId, position);
  // Always return a solution for preflop — the classification IS the answer

  const frequencies = classificationToFrequencies(classification, archId);

  let optimalAction: GtoAction = "fold";
  let optimalFrequency = 0;
  for (const [action, freq] of Object.entries(frequencies)) {
    if ((freq ?? 0) > optimalFrequency) {
      optimalFrequency = freq ?? 0;
      optimalAction = action as GtoAction;
    }
  }

  const explanation = explainArchetype(deal.archetype, deal.handCategory, deal.isInPosition, undefined, "preflop");

  return {
    frequencies,
    optimalAction,
    optimalFrequency,
    availableActions: Object.keys(frequencies).filter(a => (frequencies[a as GtoAction] ?? 0) > 0.001) as GtoAction[],
    explanation,
    isExactMatch: true,
    resolvedCategory: deal.handCategory.category,
  };
}

export function computeSolution(deal: ConstrainedDeal): SpotSolution | null {
  const lookupId = deal.archetype.textureArchetypeId ?? deal.archetype.archetypeId;
  const street = streetFromCommunityCount(deal.communityCards.length);

  // For preflop: use validated GTO ranges (same as coaching + engine)
  if (street === "preflop") {
    return computePreflopSolution(deal);
  }

  // For postflop: use solver tables (real TexasSolver data)
  const lookup = lookupFrequencies(lookupId, deal.handCategory.category, deal.isInPosition, street);
  if (!lookup) return null;

  const table = getTable(lookupId, street);

  // Find optimal action
  let optimalAction: GtoAction = "check";
  let optimalFrequency = 0;
  for (const [action, freq] of Object.entries(lookup.frequencies)) {
    if ((freq ?? 0) > optimalFrequency) {
      optimalFrequency = freq ?? 0;
      optimalAction = action as GtoAction;
    }
  }

  // Available actions for this position
  const availableActions = deal.isInPosition
    ? (table?.actionsIp ?? [])
    : (table?.actionsOop ?? []);

  // Teaching explanation (without user action — pure "what GTO does and why")
  const explanation = explainArchetype(deal.archetype, deal.handCategory, deal.isInPosition, undefined, street);

  // Accuracy impact — compute "within X BB" number
  let accuracyImpact: AccuracyImpact | undefined;
  const archetypeAccuracy = getAccuracy(lookupId, street);
  if (archetypeAccuracy && deal.communityCards.length >= 3) {
    const boardTexture = analyzeBoard(deal.communityCards as CardIndex[]);
    const features = boardToFeatures(boardTexture);
    const typicality = scoreBoardTypicality(lookupId, features);
    const topGap = computeTopActionGap(lookup.frequencies);
    const potBB = 7; // conservative SRP estimate
    accuracyImpact = estimateBoardAccuracy(archetypeAccuracy, typicality, potBB, topGap);
  }

  return {
    frequencies: lookup.frequencies,
    optimalAction,
    optimalFrequency,
    availableActions,
    explanation,
    isExactMatch: lookup.isExact,
    resolvedCategory: lookup.handCategory,
    bands: lookup.bands,
    archetypeAccuracy: lookup.archetypeAccuracy,
    accuracyImpact,
  };
}

/**
 * Auto-advance hero through earlier streets until the target street.
 *
 * For postflop drills, hero needs to check/call through preflop
 * to reach the street where the real decision happens.
 */
export function autoAdvanceToTargetStreet(
  session: HandSession,
  targetStreet: "preflop" | "flop" | "turn" | "river",
): void {
  const targetIdx = STREET_ORDER.indexOf(targetStreet);

  let safety = 0;
  while (safety < 20) {
    safety++;
    const state = session.state;
    if (!state || state.phase === "complete" || state.phase === "showdown") break;

    const currentIdx = STREET_ORDER.indexOf(state.currentStreet);
    if (currentIdx >= targetIdx) break;

    if (state.activePlayerIndex === null) break;
    const activePlayer = state.players[state.activePlayerIndex];
    if (activePlayer.seatIndex !== session.heroSeatIndex) break;

    const legal = currentLegalActions(state);
    if (!legal) break;

    if (legal.canCheck) {
      session.act("check");
    } else if (legal.canCall) {
      session.act("call");
    } else {
      break;
    }
  }
}

/**
 * Remap a SpotSolution's frequencies so action labels match
 * what's actually legal for hero (check↔call, bet↔raise).
 *
 * Returns a new SpotSolution with remapped frequencies,
 * recomputed optimal action, and filtered available actions.
 */
export function remapSolutionToLegal(
  solution: SpotSolution,
  state: GameState,
): SpotSolution {
  const legal = currentLegalActions(state);
  if (!legal) return solution;

  const remapped = remapFrequenciesToLegal(solution.frequencies, legal);

  // Recompute optimal after remapping
  let remappedOptimal: GtoAction = "check";
  let remappedOptimalFreq = 0;
  for (const [action, freq] of Object.entries(remapped)) {
    if ((freq ?? 0) > remappedOptimalFreq) {
      remappedOptimalFreq = freq ?? 0;
      remappedOptimal = action as GtoAction;
    }
  }

  // Update available actions to match remapped keys
  const remappedAvailable = Object.keys(remapped).filter(
    (a) => (remapped[a as GtoAction] ?? 0) > 0.001,
  ) as GtoAction[];

  return {
    ...solution,
    frequencies: remapped,
    optimalAction: remappedOptimal,
    optimalFrequency: remappedOptimalFreq,
    availableActions: remappedAvailable,
  };
}

/**
 * Create a HandSession configured for drill mode.
 *
 * All villains get TAG profiles. The session is ready
 * for startHand() with card overrides.
 */
export function createDrillSession(
  deal: ConstrainedDeal,
  overrides?: Partial<Pick<HandSessionConfig, "blinds" | "startingStack">>,
): HandSession {
  const profiles = new Map<number, (typeof PRESET_PROFILES)[keyof typeof PRESET_PROFILES]>();
  for (let i = 0; i < deal.numPlayers; i++) {
    if (i === deal.heroSeatIndex) continue;
    profiles.set(i, PRESET_PROFILES.tag);
  }

  return new HandSession(
    {
      numPlayers: deal.numPlayers,
      dealerSeatIndex: deal.dealerSeatIndex,
      heroSeatIndex: deal.heroSeatIndex,
      blinds: overrides?.blinds ?? DEFAULT_BLINDS,
      startingStack: overrides?.startingStack ?? DEFAULT_STACK_BB,
      seatProfiles: profiles,
    },
    {},
  );
}

/**
 * Full drill pipeline: deal → session → advance → solve → remap.
 *
 * This is the **canonical pipeline** that produces identical output
 * whether called from the React hook or from a test. If you change
 * this function, both the UI and tests update together.
 *
 * @param archetypeId - Which archetype to drill
 * @param rng - Seeded random function for deterministic output
 * @param existingSession - Optionally reuse a session (for consecutive hands)
 * @returns Complete deal result ready for UI rendering or test verification
 */
export function executeDrillPipeline(
  archetypeId: ArchetypeId,
  rng: () => number,
  existingSession?: HandSession,
): DrillDealResult {
  // 1. Generate constrained deal
  const deal = dealForArchetype({ archetypeId } as DrillConstraints, rng);

  // 2. Create or reconfigure session
  const session = existingSession ?? createDrillSession(deal);
  if (existingSession) {
    session.updateConfig({
      heroSeatIndex: deal.heroSeatIndex,
      dealerSeatIndex: deal.dealerSeatIndex,
      numPlayers: deal.numPlayers,
    });
  }

  // 3. Compute solution at deal time (before session touches cards)
  let solution = computeSolution(deal);

  // 4. Start hand with card overrides + community cards
  session.startHand(undefined, deal.cardOverrides, deal.communityCards);

  // 5. Auto-advance hero through earlier streets
  const targetStreet = streetFromCommunityCount(deal.communityCards.length);
  autoAdvanceToTargetStreet(session, targetStreet);

  // 6. Remap solution frequencies to match legal actions
  if (solution && session.state) {
    solution = remapSolutionToLegal(solution, session.state);
  }

  const state = session.state;
  if (!state) throw new Error(`HandSession state is null for ${archetypeId}`);

  return { deal, session, state, solution };
}
