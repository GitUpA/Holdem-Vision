"use client";

/**
 * useDrillSession — React hook orchestrating GTO drill mode.
 *
 * Flow: select archetype → constrained deal → compute full GTO solution →
 * user picks GtoAction (or studies solution) → score → next hand.
 *
 * KEY DESIGN: The pipeline logic (deal → solve → advance → remap) lives in
 * convex/lib/gto/drillPipeline.ts — a pure TS module shared with tests.
 * This ensures that what the user sees in the UI is identical to what
 * tests verify. The hook is a thin React wrapper over that pipeline.
 *
 * The GTO solution is computed at DEAL TIME and held in state. The UI decides
 * when to reveal it — "learn mode" shows everything immediately, "quiz mode"
 * hides until after the user acts. This is a UI concern, not a hook concern.
 */
import { useState, useCallback, useRef } from "react";
import type { GameState } from "../../convex/lib/state/game-state";
import { currentLegalActions } from "../../convex/lib/state/state-machine";
import { HandSession } from "../../convex/lib/session/handSession";
import { PRESET_PROFILES } from "../../convex/lib/opponents/presets";
import type { ArchetypeId } from "../../convex/lib/gto/archetypeClassifier";
import type { GtoAction } from "../../convex/lib/gto/tables/types";
import type { ConstrainedDeal } from "../../convex/lib/gto/constrainedDealer";
import { gtoActionToGameAction } from "../../convex/lib/gto/actionMapping";
import {
  scoreAction,
  type ActionScore,
} from "../../convex/lib/gto/evScoring";
import type { NarrativeIntentId } from "../../convex/lib/gto/narrativePrompts";
import {
  executeDrillPipeline,
  streetFromCommunityCount,
  type SpotSolution,
} from "../../convex/lib/gto/drillPipeline";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export type DrillPhase = "idle" | "dealing" | "ready" | "acted" | "summary";

// Re-export SpotSolution from the shared pipeline module
export type { SpotSolution } from "../../convex/lib/gto/drillPipeline";

export interface DrillProgress {
  optimal: number;
  acceptable: number;
  mistake: number;
  blunder: number;
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
  /** User's narrative choice (quiz mode) — null if not yet chosen */
  narrativeChoice: NarrativeIntentId | null;
}

export interface DrillSessionActions {
  startDrill: (archetypeId: ArchetypeId, handsTarget?: number) => void;
  act: (gtoAction: GtoAction) => void;
  nextHand: () => void;
  resetDrill: () => void;
  /** Set the user's narrative intent before acting */
  setNarrativeChoice: (id: NarrativeIntentId) => void;
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
  const narrativeChoiceRef = useRef<NarrativeIntentId | null>(null);

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

  // ── Deal a single hand (delegates to shared pipeline) ──

  const dealNextHand = useCallback(() => {
    const archId = archetypeRef.current;
    if (!archId || !sessionRef.current) return;

    phaseRef.current = "dealing";
    rerender();

    // Execute the canonical pipeline — same code path as tests
    const result = executeDrillPipeline(
      archId,
      rngRef.current,
      sessionRef.current,
    );

    currentDealRef.current = result.deal;
    currentScoreRef.current = null;
    narrativeChoiceRef.current = null;
    solutionRef.current = result.solution;

    phaseRef.current = "ready";
    rerender();
  }, [rerender]);

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

      // Score against GTO — use shared street derivation
      const drillStreet = streetFromCommunityCount(deal.communityCards.length);
      const score = scoreAction(
        deal.archetype,
        deal.handCategory,
        gtoAction,
        state.pot.total / DEFAULT_BLINDS.big, // pot in BB
        deal.isInPosition,
        drillStreet,
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
    narrativeChoice: narrativeChoiceRef.current,
    startDrill,
    act,
    nextHand,
    resetDrill,
    setNarrativeChoice: (id: NarrativeIntentId) => {
      narrativeChoiceRef.current = id;
      rerender();
    },
  };
}
