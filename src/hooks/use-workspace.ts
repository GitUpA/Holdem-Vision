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
} from "../../convex/lib/state/game-state";
import type { OpponentProfile, PlayerAction } from "../../convex/lib/types/opponents";
import type { WeightedRange, OpponentContext } from "../../convex/lib/types/opponents";
import type { HandRecord } from "../../convex/lib/audit/types";
import type { ArchetypeId } from "../../convex/lib/gto/archetypeClassifier";
import type {
  GtoAction,
  ActionFrequencies,
  ActionFrequencyBands,
  ArchetypeAccuracy,
  AccuracyImpact,
} from "../../convex/lib/gto/tables/types";
import type { CardHighlight } from "../../convex/lib/types/visuals";

import {
  currentLegalActions,
  gameContextFromState,
} from "../../convex/lib/state/state-machine";
import {
  applyCardOverrides,
  applyCommunityOverride,
  setCardVisibility,
} from "../../convex/lib/state/card-overrides";
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
import type { ConstrainedDeal, DrillConstraints } from "../../convex/lib/gto/constrainedDealer";
import { dealForArchetype } from "../../convex/lib/gto/constrainedDealer";
import { gtoActionToGameAction } from "../../convex/lib/gto/actionMapping";
import { scoreAction, type ActionScore } from "../../convex/lib/gto/evScoring";
import { getTable, lookupFrequencies, getAccuracy } from "../../convex/lib/gto/tables/tableRegistry";
import { explainArchetype } from "../../convex/lib/gto/archetypeExplainer";
import { analyzeBoard } from "../../convex/lib/opponents/engines/boardTexture";
import {
  estimateBoardAccuracy,
  scoreBoardTypicality,
  boardToFeatures,
  computeTopActionGap,
} from "../../convex/lib/gto/tables/types";

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

// ── Drill types ──

export type DrillPhase = "idle" | "dealing" | "ready" | "acted" | "summary";

export interface DrillProgress {
  optimal: number;
  acceptable: number;
  mistake: number;
  blunder: number;
}

export interface SpotSolution {
  frequencies: ActionFrequencies;
  optimalAction: GtoAction;
  optimalFrequency: number;
  availableActions: GtoAction[];
  explanation: ExplanationNode;
  isExactMatch: boolean;
  resolvedCategory: string;
  bands?: ActionFrequencyBands;
  archetypeAccuracy?: ArchetypeAccuracy;
  accuracyImpact?: AccuracyImpact;
}

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
  const [blinds, setBlinds] = useState<BlindStructure>(
    mode.deal.style === "constrained" ? DEFAULT_DRILL_BLINDS : { small: 0.5, big: 1 },
  );
  const [startingStack, setStartingStack] = useState(
    mode.deal.style === "constrained" ? DEFAULT_DRILL_STACK : 100,
  );

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
      if (mode.deal.style === "constrained") {
        // Drill mode: TAG villains
        for (let i = 1; i < 6; i++) {
          profiles.set(i, PRESET_PROFILES.tag);
        }
      }
      sessionRef.current = new HandSession(
        {
          numPlayers: mode.deal.style === "constrained" ? 6 : 6,
          dealerSeatIndex: 0,
          heroSeatIndex: 0,
          blinds: mode.deal.style === "constrained" ? DEFAULT_DRILL_BLINDS : { small: 0.5, big: 1 },
          startingStack: mode.deal.style === "constrained" ? DEFAULT_DRILL_STACK : 100,
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

  // ─── Drill state (always exists, idle when scoring disabled) ───
  const drillPhaseRef = useRef<DrillPhase>("idle");
  const drillArchetypeRef = useRef<ArchetypeId | null>(null);
  const drillHandsPlayedRef = useRef(0);
  const drillHandsTargetRef = useRef(10);
  const drillScoresRef = useRef<ActionScore[]>([]);
  const drillCurrentScoreRef = useRef<ActionScore | null>(null);
  const drillDealRef = useRef<ConstrainedDeal | null>(null);
  const drillSolutionRef = useRef<SpotSolution | null>(null);
  const drillRngRef = useRef(() => Math.random());

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
    mode.analysis.enabled ? ["raw-equity", "threats", "outs", "draws"] : [],
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

  const getDrillProgress = useCallback((): DrillProgress => {
    const scores = drillScoresRef.current;
    return {
      optimal: scores.filter((s) => s.verdict === "optimal").length,
      acceptable: scores.filter((s) => s.verdict === "acceptable").length,
      mistake: scores.filter((s) => s.verdict === "mistake").length,
      blunder: scores.filter((s) => s.verdict === "blunder").length,
    };
  }, []);

  const computeSolution = useCallback((deal: ConstrainedDeal): SpotSolution | null => {
    // For postflop principles, use textureArchetypeId for solver lookup
    const lookupId = deal.archetype.textureArchetypeId ?? deal.archetype.archetypeId;
    // Derive street from community card count
    const street = deal.communityCards.length <= 0 ? "preflop" as const
      : deal.communityCards.length <= 3 ? "flop" as const
      : deal.communityCards.length === 4 ? "turn" as const
      : "river" as const;

    const lookup = lookupFrequencies(lookupId, deal.handCategory.category, deal.isInPosition, street);
    if (!lookup) return null;

    const table = getTable(lookupId, street);
    let optimalAction: GtoAction = "check";
    let optimalFrequency = 0;
    for (const [action, freq] of Object.entries(lookup.frequencies)) {
      if ((freq ?? 0) > optimalFrequency) {
        optimalFrequency = freq ?? 0;
        optimalAction = action as GtoAction;
      }
    }

    const availableActions = deal.isInPosition
      ? (table?.actionsIp ?? [])
      : (table?.actionsOop ?? []);

    const explanation = explainArchetype(deal.archetype, deal.handCategory, deal.isInPosition, undefined, street);

    let accuracyImpact: AccuracyImpact | undefined;
    const archetypeAccuracy = getAccuracy(lookupId, street);
    if (archetypeAccuracy && deal.communityCards.length >= 3) {
      const boardTexture = analyzeBoard(deal.communityCards as CardIndex[]);
      const features = boardToFeatures(boardTexture);
      const typicality = scoreBoardTypicality(lookupId, features);
      const topGap = computeTopActionGap(lookup.frequencies);
      const potBB = 7;
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

  const dealNextDrillHand = useCallback(() => {
    const archId = drillArchetypeRef.current;
    if (!archId || !sessionRef.current) return;

    drillPhaseRef.current = "dealing";
    forceRender();

    const deal = dealForArchetype(
      { archetypeId: archId } as DrillConstraints,
      drillRngRef.current,
    );
    drillDealRef.current = deal;
    drillCurrentScoreRef.current = null;
    drillSolutionRef.current = computeSolution(deal);

    const sess = sessionRef.current;
    sess.updateConfig({
      heroSeatIndex: deal.heroSeatIndex,
      dealerSeatIndex: deal.dealerSeatIndex,
      numPlayers: deal.numPlayers,
    });
    // Sync React state so seats/positions/hero derivations update
    setHeroSeatIndex(deal.heroSeatIndex);
    setDealerSeatIndex(deal.dealerSeatIndex);
    setNumPlayers(deal.numPlayers);

    sess.startHand(undefined, deal.cardOverrides, deal.communityCards);

    // For postflop drills, auto-advance hero through earlier streets
    // until we reach the target street (where the real decision happens).
    const STREET_ORDER = ["preflop", "flop", "turn", "river"] as const;
    const targetStreet = deal.communityCards.length <= 0 ? "preflop"
      : deal.communityCards.length <= 3 ? "flop"
      : deal.communityCards.length === 4 ? "turn"
      : "river";
    const targetIdx = STREET_ORDER.indexOf(targetStreet);

    let safety = 0;
    while (safety < 20) {
      safety++;
      const state = sess.state;
      if (!state || state.phase === "complete" || state.phase === "showdown") break;

      const currentIdx = STREET_ORDER.indexOf(state.currentStreet);
      if (currentIdx >= targetIdx) break; // reached target street

      if (state.activePlayerIndex === null) break;
      const activePlayer = state.players[state.activePlayerIndex];
      if (activePlayer.seatIndex !== sess.heroSeatIndex) break;

      const legal = currentLegalActions(state);
      if (!legal) break;

      if (legal.canCheck) {
        sess.act("check");
      } else if (legal.canCall) {
        sess.act("call");
      } else {
        break;
      }
    }

    drillPhaseRef.current = "ready";
    forceRender();
  }, [forceRender, computeSolution]);

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
      session.act(actionType, amount);
    },
    [session],
  );

  // ── Drill actions ──

  const startDrill = useCallback(
    (archetypeId: ArchetypeId, handsTarget = 10) => {
      drillArchetypeRef.current = archetypeId;
      drillHandsTargetRef.current = handsTarget;
      drillHandsPlayedRef.current = 0;
      drillScoresRef.current = [];
      drillCurrentScoreRef.current = null;
      drillSolutionRef.current = null;

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

  const drillAct = useCallback(
    (gtoAction: GtoAction) => {
      const sess = sessionRef.current;
      const deal = drillDealRef.current;
      const state = sess?.state;
      if (!sess || !deal || !state || drillPhaseRef.current !== "ready") return;

      const legal = currentLegalActions(state);
      if (!legal) return;

      const { actionType, amount } = gtoActionToGameAction(gtoAction, legal, state.pot.total);
      sess.act(actionType, amount);

      const drillStreet = deal.communityCards.length <= 0 ? "preflop" as const
        : deal.communityCards.length <= 3 ? "flop" as const
        : deal.communityCards.length === 4 ? "turn" as const
        : "river" as const;
      const score = scoreAction(
        deal.archetype,
        deal.handCategory,
        gtoAction,
        state.pot.total / DEFAULT_DRILL_BLINDS.big,
        deal.isInPosition,
        drillStreet,
      );

      drillCurrentScoreRef.current = score;
      if (score) drillScoresRef.current = [...drillScoresRef.current, score];
      drillHandsPlayedRef.current++;

      if (drillHandsPlayedRef.current >= drillHandsTargetRef.current) {
        drillPhaseRef.current = "summary";
      } else {
        drillPhaseRef.current = "acted";
      }
      forceRender();
    },
    [forceRender],
  );

  const drillNextHand = useCallback(() => {
    if (drillPhaseRef.current === "acted") {
      dealNextDrillHand();
    }
  }, [dealNextDrillHand]);

  const resetDrill = useCallback(() => {
    drillPhaseRef.current = "idle";
    drillArchetypeRef.current = null;
    drillHandsPlayedRef.current = 0;
    drillHandsTargetRef.current = 10;
    drillScoresRef.current = [];
    drillCurrentScoreRef.current = null;
    drillDealRef.current = null;
    drillSolutionRef.current = null;
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

    // Drill
    drillPhase: drillPhaseRef.current,
    drillArchetypeId: drillArchetypeRef.current,
    drillHandsPlayed: drillHandsPlayedRef.current,
    drillHandsTarget: drillHandsTargetRef.current,
    drillScores: drillScoresRef.current,
    drillCurrentScore: drillCurrentScoreRef.current,
    drillCurrentDeal: drillDealRef.current,
    drillSolution: drillSolutionRef.current,
    drillProgress: getDrillProgress(),
    startDrill,
    drillAct,
    drillNextHand,
    resetDrill,
  };
}

/** Return type of useWorkspace for use in component props */
export type WorkspaceState = ReturnType<typeof useWorkspace>;
