"use client";

/**
 * useWorkspace — unified hook replacing useHandManager + useDrillSession + useAnalysis.
 *
 * Takes a WorkspaceMode and returns a flat WorkspaceState with everything
 * the UI needs. Drill state refs always exist (zero cost when idle).
 * Analysis runs conditionally based on mode.analysis.enabled.
 *
 * This hook does NOT conditionally call other hooks — it inlines their logic
 * to keep the hook call count stable across renders.
 */

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import type { WorkspaceMode } from "@/types/workspace-mode";

// ── Domain imports ──
import type { CardIndex, Street, Position } from "../../convex/lib/types/cards";
import type { BlindStructure } from "../../convex/lib/types/game";
import type { GameContext, AnalysisContext, AnalysisResult, ExplanationNode } from "../../convex/lib/types/analysis";
import type {
  LegalActions,
  PotState,
  ActionType,
  PlayerState,
  CardVisibility,
} from "../../convex/lib/state/gameState";
import type { OpponentProfile, PlayerAction } from "../../convex/lib/types/opponents";
import type { WeightedRange, OpponentContext } from "../../convex/lib/types/opponents";
import type { HandRecord } from "../../convex/lib/audit/types";
import type { ArchetypeId } from "../../convex/lib/gto/archetypeClassifier";
import type { GtoAction } from "../../convex/lib/gto/tables/types";
import type { CardHighlight } from "../../convex/lib/types/visuals";

import {
  currentLegalActions,
  gameContextFromState,
} from "../../convex/lib/state/stateMachine";
import {
  applyCardOverrides,
  applyCommunityOverride,
  setCardVisibility,
} from "../../convex/lib/state/cardOverrides";
import {
  positionForSeat,
  positionDisplayName,
  seatToPositionMap,
} from "../../convex/lib/primitives/position";
import { HandSession } from "../../convex/lib/session";
import { PRESET_PROFILES } from "../../convex/lib/opponents/presets";

// Analysis
import { runLenses, getLensInfo, isHeavyLens } from "../../convex/lib/analysis/lensRegistry";
import { estimateRange } from "../../convex/lib/opponents/rangeEstimator";

// Drill / GTO
import type { ConstrainedDeal } from "../../convex/lib/gto/constrainedDealer";
// gtoActionToGameAction no longer needed — drillAct takes game actions directly
import { scoreAction, normalizeToGtoAction, type ActionScore } from "../../convex/lib/gto/evScoring";
import {
  executeDrillPipeline,
  streetFromCommunityCount,
} from "../../convex/lib/gto/drillPipeline";
import type { NarrativeIntentId } from "../../convex/lib/gto/narrativePrompts";
import { ALL_ARCHETYPE_IDS } from "../../convex/lib/gto/archetypeClassifier";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export type SelectionTarget = "hero" | "community" | `villain-${number}`;

export interface UnifiedSeatConfig {
  seatIndex: number;
  position: Position;
  positionDisplay: string;
  isHero: boolean;
  profile?: OpponentProfile;
  status: PlayerState["status"];
  stack: number;
  startingStack: number;
  holeCards: CardIndex[];
  cardVisibility: CardVisibility;
  streetCommitted: number;
  totalCommitted: number;
  actions: PlayerAction[];
  label: string;
}

// ── Session types ──

export interface SessionProgress {
  optimal: number;
  acceptable: number;
  mistake: number;
  blunder: number;
}

// SpotSolution is defined in the shared pipeline module — single source of truth
import type { SpotSolution } from "../../convex/lib/gto/drillPipeline";
export type { SpotSolution } from "../../convex/lib/gto/drillPipeline";

// ── Deck vision types ──

export type CardStatus = "hero" | "community" | "dead" | "threat" | "out" | "neutral";

export interface DeckVisionCard {
  cardIndex: CardIndex;
  status: CardStatus;
  threatUrgency?: number;
  reason?: string;
}

// ═══════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════

const EMPTY_POT: PotState = { mainPot: 0, sidePots: [], total: 0, explanation: "" };
const LENS_ORDER = ["raw-equity", "monte-carlo", "threats", "outs", "draws", "opponent-read", "coaching"];
const DEFAULT_DRILL_BLINDS: BlindStructure = { small: 1, big: 2 };
const DEFAULT_DRILL_STACK = 100;

/** Special sentinel for interleaved drill mode */
export const INTERLEAVED_SENTINEL = "__interleaved__" as const;

// ═══════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════

export function useWorkspace(mode: WorkspaceMode) {
  // ─── Re-render trigger ───
  const [, setRenderCounter] = useState(0);
  const forceRender = useCallback(() => setRenderCounter((n) => n + 1), []);

  // ─── Table config (UI state) ───
  const [numPlayers, setNumPlayersRaw] = useState(6);
  const [dealerSeatIndex, setDealerSeatIndex] = useState(0);
  const [heroSeatIndex, setHeroSeatIndex] = useState(0);
  const [blinds, setBlinds] = useState<BlindStructure>({ small: 0.5, big: 1 });
  const [startingStack, setStartingStack] = useState(100);

  // ─── Card selection (UI-only) ───
  const [selectionTarget, setSelectionTarget] = useState<SelectionTarget>("hero");
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [villainCardBuffer, setVillainCardBuffer] = useState<Map<number, CardIndex[]>>(new Map());
  const [seatLabels] = useState<Map<number, string>>(new Map());

  // ─── Audit file save ───
  const saveAuditRecord = useCallback((record: HandRecord) => {
    fetch("/api/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    }).catch((err) => console.error("[audit] Failed to save:", err));
  }, []);

  // ─── HandSession ───
  const sessionRef = useRef<HandSession | null>(null);

  const getSession = useCallback((): HandSession => {
    if (!sessionRef.current) {
      const profiles = new Map<number, OpponentProfile>();
      // Default: GTO villains (user can change via Profiles dropdown)
      for (let i = 1; i < 6; i++) {
        profiles.set(i, PRESET_PROFILES.gto);
      }
      sessionRef.current = new HandSession(
        {
          numPlayers: 6,
          dealerSeatIndex: 0,
          heroSeatIndex: 0,
          blinds: { small: 0.5, big: 1 },
          startingStack: 100,
          seatProfiles: profiles,
          seed: Date.now(),
        },
        {
          onStateChange: forceRender,
          onHandComplete: mode.deal.style === "manual" ? saveAuditRecord : undefined,
        },
      );
    }
    return sessionRef.current;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- lazy initializer
  }, []);

  const session = getSession();
  const gameState = session.state;

  // ─── Session state (always exists, idle when scoring disabled) ───
  const drillArchetypeRef = useRef<ArchetypeId | null>(null);
  const sessionHandsRef = useRef(0);
  const drillHandsTargetRef = useRef(10);
  const sessionScoresRef = useRef<ActionScore[]>([]);
  const lastScoreRef = useRef<ActionScore | null>(null);
  const drillDealRef = useRef<ConstrainedDeal | null>(null);
  const drillSolutionRef = useRef<SpotSolution | null>(null);
  const drillRngRef = useRef(() => Math.random());
  const drillNarrativeChoiceRef = useRef<NarrativeIntentId | null>(null);
  const drillInterleavedRef = useRef(false);
  const drillArchetypePoolRef = useRef<ArchetypeId[]>([]);

  // ─── Derived state ───

  const positionMap = useMemo(
    () => seatToPositionMap(dealerSeatIndex, numPlayers),
    [dealerSeatIndex, numPlayers],
  );

  const heroPosition = useMemo(
    () => positionForSeat(heroSeatIndex, dealerSeatIndex, numPlayers),
    [heroSeatIndex, dealerSeatIndex, numPlayers],
  );

  const legalActions: LegalActions | null = useMemo(
    () => (gameState ? currentLegalActions(gameState) : null),
    [gameState],
  );

  const activePlayerSeat: number | null = useMemo(() => {
    if (!gameState || gameState.activePlayerIndex === null) return null;
    return gameState.players[gameState.activePlayerIndex]?.seatIndex ?? null;
  }, [gameState]);

  const isHeroTurn = activePlayerSeat === heroSeatIndex;
  const pot: PotState = gameState?.pot ?? EMPTY_POT;

  const heroCards: CardIndex[] = useMemo(() => {
    if (!gameState) return [];
    const hero = gameState.players.find((p) => p.seatIndex === heroSeatIndex);
    return hero ? [...hero.holeCards] : [];
  }, [gameState, heroSeatIndex]);

  const communityCards: CardIndex[] = useMemo(
    () => (gameState ? [...gameState.communityCards] : []),
    [gameState],
  );

  const street: Street = gameState?.currentStreet ?? "preflop";

  const gameContext: GameContext | undefined = useMemo(
    () => (gameState ? gameContextFromState(gameState) : undefined),
    [gameState],
  );

  const handNumber = session.currentHandNumber;

  const isHandActive = gameState !== null &&
    gameState.phase !== "complete" && gameState.phase !== "showdown";

  const isHandOver = gameState !== null &&
    (gameState.phase === "complete" || gameState.phase === "showdown");

  // ─── All used cards ───
  const allUsedCards = useMemo(() => {
    if (!gameState) return new Set<CardIndex>();
    const used = new Set<CardIndex>();
    const hero = gameState.players.find((p) => p.seatIndex === heroSeatIndex);
    if (hero) for (const c of hero.holeCards) used.add(c);
    for (const c of gameState.communityCards) used.add(c);
    for (const p of gameState.players) {
      if (p.seatIndex === heroSeatIndex) continue;
      if (p.cardVisibility !== "hidden") {
        for (const c of p.holeCards) used.add(c);
      }
    }
    return used;
  }, [gameState, heroSeatIndex]);

  const isCardUsed = useCallback(
    (card: CardIndex) => allUsedCards.has(card),
    [allUsedCards],
  );

  // ─── Dead cards for analysis ───
  const deadCards: CardIndex[] = useMemo(() => {
    if (!gameState) return [];
    const dead: CardIndex[] = [];
    for (const p of gameState.players) {
      if (p.seatIndex === heroSeatIndex) continue;
      if (p.cardVisibility !== "hidden" && p.holeCards.length === 2) {
        dead.push(...p.holeCards);
      }
    }
    return dead;
  }, [gameState, heroSeatIndex]);

  const seatProfiles = session.profiles;

  // ─── Seats ───
  const seats: UnifiedSeatConfig[] = useMemo(() => {
    const result: UnifiedSeatConfig[] = [];
    for (let i = 0; i < numPlayers; i++) {
      const position = positionMap.get(i)!;
      const isHero = i === heroSeatIndex;
      const player = gameState?.players[i];

      const seatActions: PlayerAction[] = gameState
        ? gameState.actionHistory
            .filter((a) => a.seatIndex === i)
            .map((a) => ({ street: a.street, actionType: a.actionType, amount: a.amount }))
        : [];

      result.push({
        seatIndex: i,
        position,
        positionDisplay: positionDisplayName(position),
        isHero,
        profile: seatProfiles.get(i),
        status: player?.status ?? "active",
        stack: player?.currentStack ?? startingStack * blinds.big,
        startingStack: player?.startingStack ?? startingStack * blinds.big,
        holeCards: player?.holeCards ?? [],
        cardVisibility: player?.cardVisibility ?? (isHero ? "revealed" : "hidden"),
        streetCommitted: player?.streetCommitted ?? 0,
        totalCommitted: player?.totalCommitted ?? 0,
        actions: seatActions,
        label: isHero ? "Hero" : (seatLabels.get(i) ?? `V${i + 1}`),
      });
    }
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- blinds.big stable after setup
  }, [numPlayers, positionMap, heroSeatIndex, gameState, seatProfiles, seatLabels, startingStack]);

  const opponents = useMemo(() => {
    return seats
      .filter((s) => !s.isHero && s.status !== "folded")
      .map((s) => ({
        seatIndex: s.seatIndex,
        label: s.label,
        position: s.position,
        actions: s.actions,
        profile: s.profile,
      }));
  }, [seats]);

  // ═══════════════════════════════════════════════════════
  // ANALYSIS (inlined from useAnalysis — conditional on mode)
  // ═══════════════════════════════════════════════════════

  const [activeLensIds, setActiveLensIds] = useState<string[]>(
    mode.analysis.enabled
      ? ["raw-equity", "threats", "outs", "draws", "coaching"]
      : [],
  );
  const availableLenses = useMemo(() => getLensInfo(), []);

  const analysisContext: AnalysisContext | null = useMemo(() => {
    if (!mode.analysis.enabled) return null;
    if (heroCards.length < 2) return null;

    const knownCards = [...heroCards, ...communityCards, ...deadCards];
    const opps: OpponentContext[] = opponents.map((opp) => {
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
      opponents: opps,
      gameContext,
      heroSeatIndex,
      gameState: gameState ?? undefined,
    };
  }, [mode.analysis.enabled, heroCards, communityCards, deadCards, street, opponents, heroPosition, numPlayers, gameContext, gameState, heroSeatIndex]);

  // Split lenses into instant and heavy
  const { instantIds, heavyIds } = useMemo(() => {
    if (!mode.analysis.enabled) return { instantIds: [] as string[], heavyIds: [] as string[] };
    const instant: string[] = [];
    const heavy: string[] = [];
    for (const id of activeLensIds) {
      if (isHeavyLens(id)) heavy.push(id);
      else instant.push(id);
    }
    return { instantIds: instant, heavyIds: heavy };
  }, [mode.analysis.enabled, activeLensIds]);

  const instantResults: Map<string, AnalysisResult> = useMemo(() => {
    if (!analysisContext) return new Map();
    return runLenses(analysisContext, instantIds);
  }, [analysisContext, instantIds]);

  const [heavyComputing, setHeavyComputing] = useState<Set<string>>(new Set());
  const [heavyResults, setHeavyResults] = useState<Map<string, AnalysisResult>>(new Map());
  const contextRef = useRef(analysisContext);
  contextRef.current = analysisContext;

  useEffect(() => {
    if (!analysisContext || heavyIds.length === 0) {
      setHeavyComputing(new Set());
      setHeavyResults(new Map());
      return;
    }
    setHeavyComputing(new Set(heavyIds));
    const capturedContext = analysisContext;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const rafId = requestAnimationFrame(() => {
      if (cancelled) return;
      timeoutId = setTimeout(() => {
        if (cancelled) return;
        const results = runLenses(capturedContext, heavyIds);
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
  }, [analysisContext, heavyIds]);

  const analysisResults: Map<string, AnalysisResult> = useMemo(() => {
    const merged = new Map<string, AnalysisResult>();
    for (const id of activeLensIds) {
      const r = instantResults.get(id) ?? heavyResults.get(id);
      if (r) merged.set(id, r);
    }
    return merged;
  }, [activeLensIds, instantResults, heavyResults]);

  const toggleLens = useCallback((id: string) => {
    setActiveLensIds((prev) => {
      if (prev.includes(id)) return prev.filter((l) => l !== id);
      const next = [...prev, id];
      next.sort((a, b) => {
        const ai = LENS_ORDER.indexOf(a);
        const bi = LENS_ORDER.indexOf(b);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      });
      return next;
    });
  }, []);

  // Snapshot lens results to audit recorder
  const lastLensStreetRef = useRef<string | null>(null);
  useEffect(() => {
    if (!mode.analysis.enabled || !isHandActive || analysisResults.size === 0) return;
    const key = `${street}-${handNumber}`;
    if (lastLensStreetRef.current === key) return;
    lastLensStreetRef.current = key;
    session.recordLensSnapshot(street, analysisResults);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only triggers on street/handNumber changes
  }, [mode.analysis.enabled, isHandActive, street, handNumber, analysisResults]);

  // ─── Deck vision ───
  const deckVisionCards: DeckVisionCard[] = useMemo(() => {
    const heroSet = new Set(heroCards);
    const communitySet = new Set(communityCards);
    const deadSet = new Set(deadCards);

    const threatMap = new Map<number, { urgency: number; reason: string }>();
    const outSet = new Set<number>();

    if (mode.analysis.enabled) {
      for (const [, result] of analysisResults) {
        for (const visual of result.visuals) {
          if (visual.type === "threat_map") {
            const highlights = (visual.data as { highlights?: CardHighlight[] }).highlights ?? [];
            for (const h of highlights) {
              const existing = threatMap.get(h.cardIndex);
              if (!existing || h.urgency > existing.urgency) {
                threatMap.set(h.cardIndex, { urgency: h.urgency, reason: h.reason });
              }
            }
          }
          if (visual.type === "outs_display") {
            const highlights = (visual.data as { highlights?: CardHighlight[] }).highlights ?? [];
            for (const h of highlights) outSet.add(h.cardIndex);
          }
        }
      }
    }

    const cards: DeckVisionCard[] = [];
    for (let i = 0; i < 52; i++) {
      if (heroSet.has(i)) cards.push({ cardIndex: i, status: "hero" });
      else if (communitySet.has(i)) cards.push({ cardIndex: i, status: "community" });
      else if (deadSet.has(i)) cards.push({ cardIndex: i, status: "dead" });
      else if (threatMap.has(i)) {
        const t = threatMap.get(i)!;
        cards.push({ cardIndex: i, status: "threat", threatUrgency: t.urgency, reason: t.reason });
      } else if (outSet.has(i)) cards.push({ cardIndex: i, status: "out", reason: "Improves hand" });
      else cards.push({ cardIndex: i, status: "neutral" });
    }
    return cards;
  }, [heroCards, communityCards, deadCards, mode.analysis.enabled, analysisResults]);

  // ═══════════════════════════════════════════════════════
  // DRILL LOGIC (inlined from useDrillSession)
  // ═══════════════════════════════════════════════════════

  const getSessionProgress = useCallback((): SessionProgress => {
    const scores = sessionScoresRef.current;
    return {
      optimal: scores.filter((s) => s.verdict === "optimal").length,
      acceptable: scores.filter((s) => s.verdict === "acceptable").length,
      mistake: scores.filter((s) => s.verdict === "mistake").length,
      blunder: scores.filter((s) => s.verdict === "blunder").length,
    };
  }, []);

  const dealNextDrillHand = useCallback(() => {
    let archId = drillArchetypeRef.current;

    // Interleaved mode: pick a random archetype from the pool each hand
    if (drillInterleavedRef.current && drillArchetypePoolRef.current.length > 0) {
      const pool = drillArchetypePoolRef.current;
      archId = pool[Math.floor(drillRngRef.current() * pool.length)];
      drillArchetypeRef.current = archId;
    }

    if (!archId || !sessionRef.current) return;

    // Execute the canonical pipeline — same code path as tests
    const result = executeDrillPipeline(
      archId,
      drillRngRef.current,
      sessionRef.current,
    );

    drillDealRef.current = result.deal;
    lastScoreRef.current = null;
    drillNarrativeChoiceRef.current = null;
    drillSolutionRef.current = result.solution;

    // Sync React state so seats/positions/hero derivations update
    setHeroSeatIndex(result.deal.heroSeatIndex);
    setDealerSeatIndex(result.deal.dealerSeatIndex);
    setNumPlayers(result.deal.numPlayers);

    forceRender();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- setNumPlayers defined later in hook; stable setState wrapper called at invocation time
  }, [forceRender]);

  // ═══════════════════════════════════════════════════════
  // ACTIONS
  // ═══════════════════════════════════════════════════════

  // ── Hand lifecycle (vision mode) ──

  const startHand = useCallback((customStacks?: number[]) => {
    const stacks = Array.isArray(customStacks) ? customStacks : undefined;
    session.startHand(stacks);
    setSelectionTarget("hero");
  }, [session]);

  const startNextHand = useCallback(() => {
    session.dealNext();
    setDealerSeatIndex(session.dealerSeatIndex);
    setSelectionTarget("hero");
    setVillainCardBuffer(new Map());
  }, [session]);

  const newHand = useCallback(() => {
    session.resetHand();
    setSelectionTarget("hero");
    setVillainCardBuffer(new Map());
  }, [session]);

  // ── Hero acts (vision mode — game actions) ──

  const act = useCallback(
    (actionType: ActionType, amount?: number) => {
      const gs = session.state;
      if (!gs) return;

      // Capture coaching snapshot + score for audit
      const coachingResult = analysisResults.get("coaching");
      let coachingSnapshot: import("../../convex/lib/audit/types").HandEvent["coachingSnapshot"];
      let scoreSnapshot: import("../../convex/lib/audit/types").HandEvent["score"];

      const deal = drillDealRef.current;
      const heroGtoAction = normalizeToGtoAction(actionType, amount, gs.pot.total);

      if (deal) {
        // Archetype mode: use drill pipeline scoring (precise solver-based scoring)
        const drillStreet = streetFromCommunityCount(deal.communityCards.length);
        const score = scoreAction(
          deal.archetype,
          deal.handCategory,
          heroGtoAction,
          gs.pot.total / (session.blinds?.big ?? 2),
          deal.isInPosition,
          drillStreet,
          drillSolutionRef.current?.frequencies,
        );

        // Build coaching snapshot from analysis results
        if (coachingResult?.value) {
          const cv = coachingResult.value as { advices?: Array<{ profileId: string; actionType: string; amount?: number }> };
          if (cv.advices) {
            const gtoAdvice = cv.advices.find((a) => a.profileId === "gto");
            coachingSnapshot = {
              gtoAction: gtoAdvice?.actionType ?? "unknown",
              gtoAmount: gtoAdvice?.amount,
              profileActions: cv.advices.map((a) => ({
                profileId: a.profileId,
                action: a.actionType,
                amount: a.amount,
              })),
            };
          }
        }

        const gtoAdvice = (coachingResult?.value as any)?.advices?.find((a: any) => a.profileId === "gto");
        scoreSnapshot = score ? {
          verdict: score.verdict,
          gtoAction: gtoAdvice?.actionType ?? heroGtoAction,
          heroAction: heroGtoAction,
          evLoss: score.evLoss,
        } : undefined;

        session.act(actionType, amount, coachingSnapshot, scoreSnapshot);

        // Clear stale solution and score — next decision point gets fresh data
        drillSolutionRef.current = null;
        // Score persists briefly for feedback, then clears when coaching updates
        // (the score is already captured in audit for permanent record)

        // Track session scores
        lastScoreRef.current = score;
        if (score) sessionScoresRef.current = [...sessionScoresRef.current, score];
        sessionHandsRef.current++;
        forceRender();
      } else {
        // Free play mode: score against coaching advice
        if (coachingResult?.value) {
          const cv = coachingResult.value as { advices?: Array<{ profileId: string; actionType: string; amount?: number; solverData?: any }> };
          if (cv.advices) {
            const gtoAdvice = cv.advices.find((a) => a.profileId === "gto");
            coachingSnapshot = {
              gtoAction: gtoAdvice?.actionType ?? "unknown",
              gtoAmount: gtoAdvice?.amount,
              profileActions: cv.advices.map((a) => ({
                profileId: a.profileId,
                action: a.actionType,
                amount: a.amount,
              })),
            };
            // Score hero's action against GTO
            if (gtoAdvice) {
              const gtoAction = gtoAdvice.actionType;
              const isMatch = heroGtoAction === gtoAction ||
                (heroGtoAction.startsWith("bet") && gtoAction.startsWith("bet")) ||
                (heroGtoAction.startsWith("raise") && gtoAction.startsWith("raise"));
              const isClose = heroGtoAction !== "fold" && gtoAction !== "fold";
              scoreSnapshot = {
                verdict: isMatch ? "optimal" : isClose ? "acceptable" : "mistake",
                gtoAction,
                heroAction: heroGtoAction,
              };
            }
          }
        }
        session.act(actionType, amount, coachingSnapshot, scoreSnapshot);
      }
    },
    [session, analysisResults, forceRender],
  );

  // ── Drill actions ──

  const startDrill = useCallback(
    (archetypeId: ArchetypeId | typeof INTERLEAVED_SENTINEL, handsTarget = 10) => {
      // Interleaved mode: rotate through all archetypes
      if (archetypeId === INTERLEAVED_SENTINEL) {
        drillInterleavedRef.current = true;
        drillArchetypePoolRef.current = [...ALL_ARCHETYPE_IDS];
        drillArchetypeRef.current = drillArchetypePoolRef.current[
          Math.floor(Math.random() * drillArchetypePoolRef.current.length)
        ];
      } else {
        drillInterleavedRef.current = false;
        drillArchetypePoolRef.current = [];
        drillArchetypeRef.current = archetypeId;
      }

      drillHandsTargetRef.current = handsTarget;
      sessionHandsRef.current = 0;
      sessionScoresRef.current = [];
      lastScoreRef.current = null;
      drillSolutionRef.current = null;
      drillNarrativeChoiceRef.current = null;

      // Re-create session with TAG villains for drill
      const profiles = new Map<number, OpponentProfile>();
      for (let i = 1; i < 6; i++) {
        profiles.set(i, PRESET_PROFILES.tag);
      }
      sessionRef.current = new HandSession(
        {
          numPlayers: 6,
          dealerSeatIndex: 0,
          heroSeatIndex: 0,
          blinds: DEFAULT_DRILL_BLINDS,
          startingStack: DEFAULT_DRILL_STACK,
          seatProfiles: profiles,
        },
        { onStateChange: forceRender },
      );

      dealNextDrillHand();
    },
    [dealNextDrillHand, forceRender],
  );

  const drillNextHand = useCallback(() => {
    // Allow next hand when we have a score and the hand is over
    if (lastScoreRef.current && sessionHandsRef.current < drillHandsTargetRef.current) {
      dealNextDrillHand();
    }
  }, [dealNextDrillHand]);

  const resetSession = useCallback(() => {
    drillArchetypeRef.current = null;
    sessionHandsRef.current = 0;
    drillHandsTargetRef.current = 10;
    sessionScoresRef.current = [];
    lastScoreRef.current = null;
    drillDealRef.current = null;
    drillSolutionRef.current = null;
    drillNarrativeChoiceRef.current = null;
    drillInterleavedRef.current = false;
    drillArchetypePoolRef.current = [];
    // Clear the table so board/players reset
    session.resetHand();
    setSelectionTarget("hero");
    setVillainCardBuffer(new Map());
    forceRender();
  }, [session, forceRender]);

  // ── Card overrides (vision mode) ──

  const overrideHeroCards = useCallback(
    (cards: CardIndex[]) => {
      if (!gameState || cards.length !== 2) return;
      try {
        const newState = applyCardOverrides(gameState, [
          { seatIndex: heroSeatIndex, cards, visibility: "revealed" },
        ]);
        session.setGameState(newState);
      } catch (e) { console.error("Card override error:", e); }
    },
    [gameState, heroSeatIndex, session],
  );

  const overrideVillainCards = useCallback(
    (seatIndex: number, cards: CardIndex[], visibility: CardVisibility = "assigned") => {
      if (!gameState || cards.length !== 2) return;
      try {
        const newState = applyCardOverrides(gameState, [{ seatIndex, cards, visibility }]);
        session.setGameState(newState);
      } catch (e) { console.error("Card override error:", e); }
    },
    [gameState, session],
  );

  const overrideCommunityCards = useCallback(
    (cards: CardIndex[]) => {
      if (!gameState || cards.length < 3 || cards.length > 5) return;
      try {
        const newState = applyCommunityOverride(gameState, cards);
        session.setGameState(newState);
      } catch (e) { console.error("Community override error:", e); }
    },
    [gameState, session],
  );

  const revealVillainCards = useCallback(
    (seatIndex: number) => {
      if (!gameState) return;
      session.setGameState(setCardVisibility(gameState, seatIndex, "revealed"));
    },
    [gameState, session],
  );

  const hideVillainCards = useCallback(
    (seatIndex: number) => {
      if (!gameState) return;
      session.setGameState(setCardVisibility(gameState, seatIndex, "hidden"));
    },
    [gameState, session],
  );

  const revealAllVillains = useCallback(() => {
    if (!gameState) return;
    let s = gameState;
    for (const p of s.players) {
      if (p.seatIndex === heroSeatIndex) continue;
      if (p.cardVisibility === "hidden") {
        s = setCardVisibility(s, p.seatIndex, "revealed");
      }
    }
    session.setGameState(s);
  }, [gameState, heroSeatIndex, session]);

  // ── Card toggle (grid click) ──

  const toggleCard = useCallback(
    (card: CardIndex) => {
      if (!gameState || allUsedCards.has(card)) return;
      const hero = gameState.players.find((p) => p.seatIndex === heroSeatIndex);

      if (selectionTarget === "hero" && hero) {
        const newCards: CardIndex[] = hero.holeCards.length >= 2
          ? [hero.holeCards[1], card] : [...hero.holeCards, card];
        if (newCards.length === 2) overrideHeroCards(newCards);
      } else if (selectionTarget === "community") {
        const current = [...gameState.communityCards];
        if (current.length < 5) {
          const next = [...current, card];
          if (next.length >= 3) overrideCommunityCards(next);
        }
      } else if (selectionTarget.startsWith("villain-")) {
        const seatIdx = parseInt(selectionTarget.split("-")[1], 10);
        const currentBuffer = villainCardBuffer.get(seatIdx) ?? [];
        if (currentBuffer.length < 2) {
          const next = [...currentBuffer, card];
          const newBuffer = new Map(villainCardBuffer);
          newBuffer.set(seatIdx, next);
          setVillainCardBuffer(newBuffer);
          if (next.length === 2) {
            overrideVillainCards(seatIdx, next, "assigned");
            const cleared = new Map(newBuffer);
            cleared.delete(seatIdx);
            setVillainCardBuffer(cleared);
          }
        }
      }
    },
    [gameState, heroSeatIndex, selectionTarget, allUsedCards, villainCardBuffer, overrideHeroCards, overrideCommunityCards, overrideVillainCards],
  );

  // ── Seat management ──

  const assignProfile = useCallback(
    (seatIndex: number, profile: OpponentProfile | undefined) => {
      session.assignProfile(seatIndex, profile);
    },
    [session],
  );

  const randomizeProfiles = useCallback(() => {
    session.randomizeProfiles();
  }, [session]);

  const setAllProfiles = useCallback(
    (profileId: string) => {
      session.setAllProfiles(profileId);
    },
    [session],
  );

  const setNumPlayers = useCallback(
    (n: number) => {
      const clamped = Math.min(Math.max(n, 2), 10);
      setNumPlayersRaw(clamped);
      setDealerSeatIndex((prev) => prev % clamped);
      setHeroSeatIndex((prev) => prev % clamped);
      session.updateConfig({ numPlayers: clamped });
    },
    [session],
  );

  const moveDealer = useCallback(
    (newSeat: number) => {
      const clamped = ((newSeat % numPlayers) + numPlayers) % numPlayers;
      setDealerSeatIndex(clamped);
      session.updateConfig({ dealerSeatIndex: clamped });
    },
    [numPlayers, session],
  );

  const moveHero = useCallback(
    (newSeat: number) => {
      const clamped = ((newSeat % numPlayers) + numPlayers) % numPlayers;
      setHeroSeatIndex(clamped);
      session.updateConfig({ heroSeatIndex: clamped });
    },
    [numPlayers, session],
  );

  const setBlindsWrapped = useCallback(
    (newBlinds: BlindStructure) => {
      setBlinds(newBlinds);
      session.updateConfig({ blinds: newBlinds });
    },
    [session],
  );

  const setStartingStackWrapped = useCallback(
    (newStack: number) => {
      setStartingStack(newStack);
      session.updateConfig({ startingStack: newStack });
    },
    [session],
  );

  // ── Audit ──

  const exportHandHistory = useCallback((): string => session.exportHandHistory(), [session]);
  const clearHandHistory = useCallback(() => session.clearHandHistory(), [session]);
  const recordLensSnapshot = useCallback(
    (currentStreet: Street, results: Map<string, AnalysisResult>) => {
      session.recordLensSnapshot(currentStreet, results);
    },
    [session],
  );

  // ═══════════════════════════════════════════════════════
  // RETURN
  // ═══════════════════════════════════════════════════════

  return {
    // Mode
    mode,

    // Hand lifecycle
    startHand,
    startNextHand,
    newHand,

    // Hero actions (game-style)
    act,
    legalActions,
    isHeroTurn,

    // Card overrides
    overrideHeroCards,
    overrideVillainCards,
    overrideCommunityCards,
    revealVillainCards,
    hideVillainCards,
    revealAllVillains,
    toggleCard,
    villainCardBuffer,
    selectionTarget,
    setSelectionTarget,

    // Seat management
    seats,
    assignProfile,
    randomizeProfiles,
    setAllProfiles,
    selectedSeat,
    setSelectedSeat,

    // For analysis pipeline
    heroCards,
    communityCards,
    deadCards,
    street,
    gameContext,
    opponents,
    heroPosition,

    // Config
    numPlayers,
    setNumPlayers,
    dealerSeatIndex,
    moveDealer,
    heroSeatIndex,
    moveHero,
    blinds,
    setBlinds: setBlindsWrapped,
    startingStack,
    setStartingStack: setStartingStackWrapped,

    // Game state
    gameState,
    pot,
    isHandActive,
    isHandOver,
    activePlayerSeat,
    handNumber,
    allUsedCards,
    isCardUsed,

    // Engine decisions
    lastDecisions: session.decisions,

    // Audit history
    handHistory: session.history,
    exportHandHistory,
    clearHandHistory,
    recordLensSnapshot,

    // Analysis
    analysisResults,
    activeLensIds,
    availableLenses,
    toggleLens,
    heavyComputing,
    deckVisionCards,

    // Session tracking (universal)
    sessionHands: sessionHandsRef.current,
    sessionScores: sessionScoresRef.current,
    lastScore: lastScoreRef.current,
    sessionProgress: getSessionProgress(),

    // Archetype-specific
    drillArchetypeId: drillArchetypeRef.current,
    drillHandsTarget: drillHandsTargetRef.current,
    drillCurrentDeal: drillDealRef.current,
    drillSolution: drillSolutionRef.current ?? deriveSolutionFromCoaching(analysisResults),
    drillNarrativeChoice: drillNarrativeChoiceRef.current,
    setDrillNarrativeChoice: (id: NarrativeIntentId) => {
      drillNarrativeChoiceRef.current = id;
      forceRender();
    },
    drillIsInterleaved: drillInterleavedRef.current,
    startDrill,
    drillNextHand,
    resetSession,
  };
}

/** Return type of useWorkspace for use in component props */
export type WorkspaceState = ReturnType<typeof useWorkspace>;

/**
 * Derive a SpotSolution from coaching results (Free Play mode).
 * In Archetype mode, the drill pipeline computes this at deal time.
 * In Free Play, we extract it from the GTO coaching advice.
 */
function deriveSolutionFromCoaching(
  results: Map<string, import("../../convex/lib/types/analysis").AnalysisResult>,
): SpotSolution | null {
  const cr = results.get("coaching");
  if (!cr?.value) return null;
  const cv = cr.value as { advices?: Array<{ profileId: string; actionType: string; amount?: number; solverData?: any; explanation?: any }> };
  if (!cv.advices) return null;
  const gto = cv.advices.find((a) => a.profileId === "gto");
  if (!gto?.solverData) return null;

  const sd = gto.solverData;
  return {
    frequencies: sd.frequencies,
    optimalAction: sd.optimalAction,
    optimalFrequency: sd.optimalFrequency,
    availableActions: sd.availableActions,
    explanation: gto.explanation ?? { summary: "GTO solution", children: [] },
    isExactMatch: sd.isExactMatch ?? false,
    resolvedCategory: sd.resolvedCategory ?? "unknown",
    bands: sd.bands,
    archetypeAccuracy: sd.archetypeAccuracy,
    accuracyImpact: sd.accuracyImpact,
    preflopConfidence: sd.preflopConfidence,
  };
}
