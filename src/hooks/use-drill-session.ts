"use client";

/**
 * useDrillSession — orchestrates GTO drill mode.
 *
 * Flow: select archetype → constrained deal → compute full GTO solution →
 * user picks GtoAction (or studies solution) → score → next hand.
 *
 * KEY DESIGN: The GTO solution (frequencies, bands, accuracy, explanation)
 * is computed at DEAL TIME and held in state. The UI decides when to reveal
 * it — "learn mode" shows everything immediately, "quiz mode" hides until
 * after the user acts. This is a UI concern, not a hook concern.
 *
 * Wraps HandSession for state machine / auto-play / audit.
 */
import { useState, useCallback, useRef } from "react";
import type { GameState } from "../../convex/lib/state/game-state";
import { currentLegalActions } from "../../convex/lib/state/state-machine";
import { HandSession } from "../../convex/lib/session/handSession";
import { PRESET_PROFILES } from "../../convex/lib/opponents/presets";
import type { ArchetypeId } from "../../convex/lib/gto/archetypeClassifier";
import type { ExplanationNode } from "../../convex/lib/types/analysis";
import type {
  GtoAction,
  ActionFrequencies,
  ActionFrequencyBands,
  ArchetypeAccuracy,
  AccuracyImpact,
} from "../../convex/lib/gto/tables/types";
import {
  estimateBoardAccuracy,
  scoreBoardTypicality,
  boardToFeatures,
  computeTopActionGap,
} from "../../convex/lib/gto/tables/types";
import {
  dealForArchetype,
  type ConstrainedDeal,
  type DrillConstraints,
} from "../../convex/lib/gto/constrainedDealer";
import {
  gtoActionToGameAction,
} from "../../convex/lib/gto/actionMapping";
import {
  scoreAction,
  type ActionScore,
} from "../../convex/lib/gto/evScoring";
import {
  getTable,
  lookupFrequencies,
  getAccuracy,
} from "../../convex/lib/gto/tables/tableRegistry";
import { explainArchetype } from "../../convex/lib/gto/archetypeExplainer";
import { analyzeBoard } from "../../convex/lib/opponents/engines/boardTexture";
import type { CardIndex } from "../../convex/lib/types/cards";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export type DrillPhase = "idle" | "dealing" | "ready" | "acted" | "summary";

export interface DrillProgress {
  optimal: number;
  acceptable: number;
  mistake: number;
  blunder: number;
}

/**
 * Full GTO solution for the current spot — computed at deal time.
 * The UI decides when/what to reveal.
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
}

export interface DrillSessionState {
  phase: DrillPhase;
  archetypeId: ArchetypeId | null;
  handsPlayed: number;
  handsTarget: number;
  scores: ActionScore[];
  currentScore: ActionScore | null;
  currentDeal: ConstrainedDeal | null;
  gameState: GameState | null;
  /** Full GTO solution — available from the moment the hand is dealt */
  solution: SpotSolution | null;
  progress: DrillProgress;
}

export interface DrillSessionActions {
  startDrill: (archetypeId: ArchetypeId, handsTarget?: number) => void;
  act: (gtoAction: GtoAction) => void;
  nextHand: () => void;
  resetDrill: () => void;
}

// ═══════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════

const DEFAULT_BLINDS = { small: 1, big: 2 };
const DEFAULT_STACK_BB = 100;

export function useDrillSession(): DrillSessionState & DrillSessionActions {
  const [, forceUpdate] = useState(0);
  const rerender = useCallback(() => forceUpdate((n) => n + 1), []);

  // Refs for mutable state (avoids stale closures)
  const sessionRef = useRef<HandSession | null>(null);
  const phaseRef = useRef<DrillPhase>("idle");
  const archetypeRef = useRef<ArchetypeId | null>(null);
  const handsPlayedRef = useRef(0);
  const handsTargetRef = useRef(10);
  const scoresRef = useRef<ActionScore[]>([]);
  const currentScoreRef = useRef<ActionScore | null>(null);
  const currentDealRef = useRef<ConstrainedDeal | null>(null);
  const solutionRef = useRef<SpotSolution | null>(null);
  const rngRef = useRef(() => Math.random());

  // ── Derived state ──

  const getProgress = useCallback((): DrillProgress => {
    const scores = scoresRef.current;
    return {
      optimal: scores.filter((s) => s.verdict === "optimal").length,
      acceptable: scores.filter((s) => s.verdict === "acceptable").length,
      mistake: scores.filter((s) => s.verdict === "mistake").length,
      blunder: scores.filter((s) => s.verdict === "blunder").length,
    };
  }, []);

  // ── Compute the full GTO solution for a deal ──

  const computeSolution = useCallback((deal: ConstrainedDeal): SpotSolution | null => {
    const archId = deal.archetype.archetypeId;

    // Look up frequencies (with bands if available)
    const lookup = lookupFrequencies(archId, deal.handCategory.category, deal.isInPosition);
    if (!lookup) return null;

    const table = getTable(archId);

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
    const explanation = explainArchetype(deal.archetype, deal.handCategory, deal.isInPosition);

    // Accuracy impact — compute "within X BB" number
    let accuracyImpact: AccuracyImpact | undefined;
    const archetypeAccuracy = getAccuracy(archId);
    if (archetypeAccuracy && deal.communityCards.length >= 3) {
      // Compute board typicality from community cards
      const boardTexture = analyzeBoard(deal.communityCards as CardIndex[]);
      const features = boardToFeatures(boardTexture);
      const typicality = scoreBoardTypicality(archId, features);

      // Top action gap for precise impact assessment
      const topGap = computeTopActionGap(lookup.frequencies);

      // Estimate pot size in BB (at flop, typically ~6-7 BB in SRP)
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
  }, []);

  // ── Deal a single hand ──

  const dealNextHand = useCallback(() => {
    const archId = archetypeRef.current;
    if (!archId || !sessionRef.current) return;

    phaseRef.current = "dealing";
    rerender();

    // Generate constrained deal
    const deal = dealForArchetype(
      { archetypeId: archId } as DrillConstraints,
      rngRef.current,
    );
    currentDealRef.current = deal;
    currentScoreRef.current = null;

    // Compute full GTO solution at deal time
    solutionRef.current = computeSolution(deal);

    // Update session config for this deal's seats
    const session = sessionRef.current;
    session.updateConfig({
      heroSeatIndex: deal.heroSeatIndex,
      dealerSeatIndex: deal.dealerSeatIndex,
      numPlayers: deal.numPlayers,
    });

    // Start hand with card overrides + community cards
    session.startHand(undefined, deal.cardOverrides, deal.communityCards);

    phaseRef.current = "ready";
    rerender();
  }, [rerender, computeSolution]);

  // ── Public API ──

  const startDrill = useCallback(
    (archetypeId: ArchetypeId, handsTarget = 10) => {
      archetypeRef.current = archetypeId;
      handsTargetRef.current = handsTarget;
      handsPlayedRef.current = 0;
      scoresRef.current = [];
      currentScoreRef.current = null;
      solutionRef.current = null;

      // Create a new HandSession with TAG villains
      const profiles = new Map<number, (typeof PRESET_PROFILES)[keyof typeof PRESET_PROFILES]>();
      for (let i = 0; i < 6; i++) {
        if (i === 0) continue; // hero placeholder — will be updated per deal
        profiles.set(i, PRESET_PROFILES.tag);
      }

      sessionRef.current = new HandSession(
        {
          numPlayers: 6,
          dealerSeatIndex: 0,
          heroSeatIndex: 0,
          blinds: DEFAULT_BLINDS,
          startingStack: DEFAULT_STACK_BB,
          seatProfiles: profiles,
        },
        { onStateChange: rerender },
      );

      dealNextHand();
    },
    [dealNextHand, rerender],
  );

  const act = useCallback(
    (gtoAction: GtoAction) => {
      const session = sessionRef.current;
      const deal = currentDealRef.current;
      const state = session?.state;
      if (!session || !deal || !state || phaseRef.current !== "ready") return;

      // Map GtoAction to game action
      const legal = currentLegalActions(state);
      if (!legal) return;

      const { actionType, amount } = gtoActionToGameAction(
        gtoAction,
        legal,
        state.pot.total,
      );

      // Apply action
      session.act(actionType, amount);

      // Score against GTO
      const score = scoreAction(
        deal.archetype,
        deal.handCategory,
        gtoAction,
        state.pot.total / DEFAULT_BLINDS.big, // pot in BB
        deal.isInPosition,
      );

      currentScoreRef.current = score;
      if (score) scoresRef.current = [...scoresRef.current, score];
      handsPlayedRef.current++;

      // Check if drill is done
      if (handsPlayedRef.current >= handsTargetRef.current) {
        phaseRef.current = "summary";
      } else {
        phaseRef.current = "acted";
      }

      rerender();
    },
    [rerender],
  );

  const nextHand = useCallback(() => {
    if (phaseRef.current === "acted") {
      dealNextHand();
    }
  }, [dealNextHand]);

  const resetDrill = useCallback(() => {
    sessionRef.current = null;
    phaseRef.current = "idle";
    archetypeRef.current = null;
    handsPlayedRef.current = 0;
    handsTargetRef.current = 10;
    scoresRef.current = [];
    currentScoreRef.current = null;
    currentDealRef.current = null;
    solutionRef.current = null;
    rerender();
  }, [rerender]);

  return {
    phase: phaseRef.current,
    archetypeId: archetypeRef.current,
    handsPlayed: handsPlayedRef.current,
    handsTarget: handsTargetRef.current,
    scores: scoresRef.current,
    currentScore: currentScoreRef.current,
    currentDeal: currentDealRef.current,
    gameState: sessionRef.current?.state ?? null,
    solution: solutionRef.current,
    progress: getProgress(),
    startDrill,
    act,
    nextHand,
    resetDrill,
  };
}
