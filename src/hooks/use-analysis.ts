"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import type { CardIndex, Street, Position } from "../../convex/lib/types/cards";
import type { AnalysisContext, AnalysisResult, GameContext, ExplanationNode } from "../../convex/lib/types/analysis";
import type { OpponentContext, WeightedRange, OpponentProfile } from "../../convex/lib/types/opponents";
import type { GameState } from "../../convex/lib/state/gameState";
import { runLenses, getLensInfo, isHeavyLens } from "../../convex/lib/analysis/lensRegistry";
import { estimateRange } from "../../convex/lib/opponents/rangeEstimator";

interface OpponentInput {
  seatIndex: number;
  label: string;
  position: Position;
  actions: import("../../convex/lib/types/opponents").PlayerAction[];
  profile?: OpponentProfile;
}

export function useAnalysis(
  heroCards: CardIndex[],
  communityCards: CardIndex[],
  deadCards: CardIndex[],
  street: Street,
  opponentInputs: OpponentInput[] = [],
  heroPosition?: Position,
  numPlayers: number = 2,
  gameContext?: GameContext,
  gameState?: GameState | null,
  heroSeatIndex?: number,
) {
  const [activeLensIds, setActiveLensIds] = useState<string[]>([
    "raw-equity",
    "threats",
    "outs",
    "draws",
    "coaching",
  ]);

  const availableLenses = useMemo(() => getLensInfo(), []);

  const context: AnalysisContext | null = useMemo(() => {
    if (heroCards.length < 2) return null;

    const knownCards = [...heroCards, ...communityCards, ...deadCards];

    // Build full OpponentContext objects from inputs
    const opponents: OpponentContext[] = opponentInputs.map((opp) => {
      const profile = opp.profile;
      let impliedRange: WeightedRange = new Map();
      let rangeDerivation: ExplanationNode = { summary: "No profile assigned", sentiment: "neutral" };

      if (profile) {
        const estimation = estimateRange(profile, opp.actions, knownCards, opp.position);
        impliedRange = estimation.range;
        rangeDerivation = estimation.explanation;
      }

      return {
        seatIndex: opp.seatIndex,
        label: opp.label,
        position: opp.position,
        actions: opp.actions,
        impliedRange,
        rangeDerivation,
        profile,
      };
    });

    return {
      heroCards,
      communityCards,
      deadCards,
      street,
      position: heroPosition,
      numPlayers,
      opponents,
      gameContext,
      heroSeatIndex: heroSeatIndex ?? 0,
      gameState: gameState ?? undefined,
    };
  }, [heroCards, communityCards, deadCards, street, opponentInputs, heroPosition, numPlayers, gameContext, gameState, heroSeatIndex]);

  // Split active lenses into instant (synchronous) and heavy (deferred)
  const { instantIds, heavyIds } = useMemo(() => {
    const instant: string[] = [];
    const heavy: string[] = [];
    for (const id of activeLensIds) {
      if (isHeavyLens(id)) heavy.push(id);
      else instant.push(id);
    }
    return { instantIds: instant, heavyIds: heavy };
  }, [activeLensIds]);

  // Run instant lenses synchronously — no lag
  const instantResults: Map<string, AnalysisResult> = useMemo(() => {
    if (!context) return new Map();
    return runLenses(context, instantIds);
  }, [context, instantIds]);

  // Track which heavy lenses are currently computing
  const [heavyComputing, setHeavyComputing] = useState<Set<string>>(new Set());
  const [heavyResults, setHeavyResults] = useState<Map<string, AnalysisResult>>(new Map());

  // Ref to track the current context for stale-check
  const contextRef = useRef(context);
  contextRef.current = context;

  // Run heavy lenses deferred — ensure the browser paints new cards BEFORE
  // the Monte Carlo computation blocks the main thread.
  // Pattern: requestAnimationFrame → setTimeout(0) guarantees a paint cycle
  // completes first, so cards render instantly and the spinner shows while
  // equity is computed.
  useEffect(() => {
    if (!context || heavyIds.length === 0) {
      setHeavyComputing(new Set());
      setHeavyResults(new Map());
      return;
    }

    // Mark heavy lenses as computing (shows spinner in UI)
    setHeavyComputing(new Set(heavyIds));

    const capturedContext = context;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    // rAF fires just before the next browser paint. The setTimeout(0)
    // inside it queues a macrotask that runs AFTER the paint, ensuring
    // the card animations and spinner are already visible.
    const rafId = requestAnimationFrame(() => {
      if (cancelled) return;
      timeoutId = setTimeout(() => {
        if (cancelled) return;
        const results = runLenses(capturedContext, heavyIds);
        // Only apply if context hasn't changed while we were computing
        if (!cancelled && contextRef.current === capturedContext) {
          setHeavyResults(results);
          setHeavyComputing(new Set());
        }
      }, 0);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [context, heavyIds]);

  // Merge instant + heavy results in activeLensIds order
  const results: Map<string, AnalysisResult> = useMemo(() => {
    const merged = new Map<string, AnalysisResult>();
    for (const id of activeLensIds) {
      const r = instantResults.get(id) ?? heavyResults.get(id);
      if (r) merged.set(id, r);
    }
    return merged;
  }, [activeLensIds, instantResults, heavyResults]);

  // Canonical ordering for display — controls panel order in the UI
  const LENS_ORDER = ["raw-equity", "monte-carlo", "threats", "outs", "draws", "opponent-read", "coaching"];

  const toggleLens = (id: string) => {
    setActiveLensIds((prev) => {
      if (prev.includes(id)) return prev.filter((l) => l !== id);
      // Insert in canonical order
      const next = [...prev, id];
      next.sort((a, b) => {
        const ai = LENS_ORDER.indexOf(a);
        const bi = LENS_ORDER.indexOf(b);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      });
      return next;
    });
  };

  return {
    context,
    results,
    activeLensIds,
    availableLenses,
    toggleLens,
    heavyComputing,
  };
}
