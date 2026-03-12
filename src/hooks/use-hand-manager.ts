"use client";

/**
 * Unified hand manager — single hook replacing useGameEngine + useCardSelection + useTableSetup.
 *
 * Thin React wrapper around HandSession (pure TS orchestration class).
 * The state machine always runs. Cards are always dealt to everyone.
 * All villain seats auto-play using their assigned profile.
 * Villain cards exist on a visibility spectrum: hidden / assigned / revealed.
 */
import { useState, useCallback, useMemo, useRef } from "react";
import type { CardIndex, Street, Position } from "../../convex/lib/types/cards";
import type { BlindStructure } from "../../convex/lib/types/game";
import type { GameContext, AnalysisContext } from "../../convex/lib/types/analysis";
import type {
  GameState,
  LegalActions,
  PotState,
  ActionType,
  PlayerState,
  CardVisibility,
  CardOverride,
} from "../../convex/lib/state/game-state";
import type { OpponentProfile, PlayerAction } from "../../convex/lib/types/opponents";
import {
  currentLegalActions,
  gameContextFromState,
  analysisContextFromState,
} from "../../convex/lib/state/state-machine";
import type { AnalysisBridgeConfig } from "../../convex/lib/state/state-machine";
import {
  applyCardOverrides,
  applyCommunityOverride,
  setCardVisibility,
} from "../../convex/lib/state/card-overrides";
import type { AutoPlayDecision } from "../../convex/lib/opponents/autoPlay";
import {
  positionForSeat,
  positionDisplayName,
  seatToPositionMap,
} from "../../convex/lib/primitives/position";
import type { HandRecord } from "../../convex/lib/audit/types";
import type { AnalysisResult } from "../../convex/lib/types/analysis";
import { HandSession } from "../../convex/lib/session";

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
  // State machine data
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

const EMPTY_POT: PotState = {
  mainPot: 0,
  sidePots: [],
  total: 0,
  explanation: "",
};

// ═══════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════

export function useHandManager(initialPlayers = 6) {
  // ─── Re-render counter — bumped by HandSession's onStateChange callback ───
  const [, setRenderCounter] = useState(0);
  const forceRender = useCallback(() => setRenderCounter((n) => n + 1), []);

  // ─── Table config (UI state — used to construct/update session) ───
  const [numPlayers, setNumPlayersRaw] = useState(
    Math.min(Math.max(initialPlayers, 2), 10),
  );
  const [dealerSeatIndex, setDealerSeatIndex] = useState(0);
  const [heroSeatIndex, setHeroSeatIndex] = useState(0);
  const [blinds, setBlinds] = useState<BlindStructure>({ small: 0.5, big: 1 });
  const [startingStack, setStartingStack] = useState(100); // in BB (BB is always 1)

  // ─── Seat labels (UI-only) ───
  const [seatLabels, setSeatLabels] = useState<Map<number, string>>(new Map());

  // ─── Card selection (UI-only) ───
  const [selectionTarget, setSelectionTarget] = useState<SelectionTarget>("hero");
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);

  // ─── Partial villain card assignment tracking (UI-only) ───
  const [villainCardBuffer, setVillainCardBuffer] = useState<Map<number, CardIndex[]>>(new Map());

  // ─── Audit file save (fire-and-forget POST to API route) ───
  const saveAuditRecord = useCallback((record: HandRecord) => {
    fetch("/api/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    }).catch((err) => console.error("[audit] Failed to save:", err));
  }, []);

  // ─── HandSession — owns all orchestration ───
  const sessionRef = useRef<HandSession | null>(null);

  // Lazy-init session on first access
  const getSession = useCallback((): HandSession => {
    if (!sessionRef.current) {
      sessionRef.current = new HandSession(
        {
          numPlayers,
          dealerSeatIndex,
          heroSeatIndex,
          blinds,
          startingStack,
          seatProfiles: new Map(),
          seed: Date.now(),
        },
        {
          onStateChange: forceRender,
          onHandComplete: saveAuditRecord,
        },
      );
    }
    return sessionRef.current;
  }, []); // stable ref — config synced via updateConfig

  // ─── Derived state from session ───

  const session = getSession();
  const gameState = session.state;

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

  const activePlayerSeat: number | null = useMemo(
    () => {
      if (!gameState || gameState.activePlayerIndex === null) return null;
      return gameState.players[gameState.activePlayerIndex]?.seatIndex ?? null;
    },
    [gameState],
  );

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
    gameState.phase !== "complete" &&
    gameState.phase !== "showdown";

  const isHandOver = gameState !== null &&
    (gameState.phase === "complete" || gameState.phase === "showdown");

  // ─── All used cards (for deck vision) ───

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

  // ─── Seat profiles (read from session) ───
  const seatProfiles = session.profiles;

  // ─── Build unified seat configs ───

  const seats: UnifiedSeatConfig[] = useMemo(() => {
    const result: UnifiedSeatConfig[] = [];
    for (let i = 0; i < numPlayers; i++) {
      const position = positionMap.get(i)!;
      const isHero = i === heroSeatIndex;
      const player = gameState?.players[i];

      const seatActions: PlayerAction[] = gameState
        ? gameState.actionHistory
            .filter((a) => a.seatIndex === i)
            .map((a) => ({
              street: a.street,
              actionType: a.actionType,
              amount: a.amount,
            }))
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
  }, [numPlayers, positionMap, heroSeatIndex, gameState, seatProfiles, seatLabels, startingStack]);

  // ─── Build opponents for analysis ───

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
  // ACTIONS — delegate to HandSession
  // ═══════════════════════════════════════════════════════

  // ─── Start hand ───

  const startHand = useCallback((customStacks?: number[]) => {
    // Guard: React onClick passes MouseEvent as first arg — ignore non-arrays
    const stacks = Array.isArray(customStacks) ? customStacks : undefined;
    session.startHand(stacks);
    setSelectionTarget("hero");
  }, [session]);

  /** Deal next hand: auto-rotates dealer, carries stacks forward. */
  const startNextHand = useCallback(() => {
    session.dealNext();
    // Sync React state with session's rotated dealer
    setDealerSeatIndex(session.dealerSeatIndex);
    setSelectionTarget("hero");
    setVillainCardBuffer(new Map());
  }, [session]);

  // ─── Hero acts ───

  const act = useCallback(
    (actionType: ActionType, amount?: number) => {
      session.act(actionType, amount);
    },
    [session],
  );

  // ─── New hand ───

  const newHand = useCallback(() => {
    session.resetHand();
    setSelectionTarget("hero");
    setVillainCardBuffer(new Map());
  }, [session]);

  // ─── Card overrides (UI concern — modify game state directly) ───

  const overrideHeroCards = useCallback(
    (cards: CardIndex[]) => {
      if (!gameState || cards.length !== 2) return;
      try {
        const newState = applyCardOverrides(gameState, [
          { seatIndex: heroSeatIndex, cards, visibility: "revealed" },
        ]);
        session.setGameState(newState);
      } catch (e) {
        console.error("Card override error:", e);
      }
    },
    [gameState, heroSeatIndex, session],
  );

  const overrideVillainCards = useCallback(
    (seatIndex: number, cards: CardIndex[], visibility: CardVisibility = "assigned") => {
      if (!gameState || cards.length !== 2) return;
      try {
        const newState = applyCardOverrides(gameState, [
          { seatIndex, cards, visibility },
        ]);
        session.setGameState(newState);
      } catch (e) {
        console.error("Card override error:", e);
      }
    },
    [gameState, session],
  );

  const overrideCommunityCards = useCallback(
    (cards: CardIndex[]) => {
      if (!gameState || cards.length < 3 || cards.length > 5) return;
      try {
        const newState = applyCommunityOverride(gameState, cards);
        session.setGameState(newState);
      } catch (e) {
        console.error("Community override error:", e);
      }
    },
    [gameState, session],
  );

  // ─── Reveal / hide villain cards ───

  const revealVillainCards = useCallback(
    (seatIndex: number) => {
      if (!gameState) return;
      const newState = setCardVisibility(gameState, seatIndex, "revealed");
      session.setGameState(newState);
    },
    [gameState, session],
  );

  const hideVillainCards = useCallback(
    (seatIndex: number) => {
      if (!gameState) return;
      const newState = setCardVisibility(gameState, seatIndex, "hidden");
      session.setGameState(newState);
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

  // ─── Context-aware card toggle (click a card in the grid) ───

  const toggleCard = useCallback(
    (card: CardIndex) => {
      if (!gameState) return;
      if (allUsedCards.has(card)) return;

      const hero = gameState.players.find((p) => p.seatIndex === heroSeatIndex);

      if (selectionTarget === "hero" && hero) {
        const newCards: CardIndex[] = hero.holeCards.length >= 2
          ? [hero.holeCards[1], card]
          : [...hero.holeCards, card];
        if (newCards.length === 2) {
          overrideHeroCards(newCards);
        }
      } else if (selectionTarget === "community") {
        const current = [...gameState.communityCards];
        if (current.length < 5) {
          const next = [...current, card];
          if (next.length >= 3) {
            overrideCommunityCards(next);
          }
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

  // ─── Seat management — delegate to session ───

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

  // ─── Audit history — delegate to session ───

  const exportHandHistory = useCallback((): string => {
    return session.exportHandHistory();
  }, [session]);

  const clearHandHistory = useCallback(() => {
    session.clearHandHistory();
  }, [session]);

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
    // Hand lifecycle
    startHand,
    startNextHand,
    newHand,

    // Hero actions
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

    // Engine decisions (for UI display)
    lastDecisions: session.decisions,

    // Audit history
    handHistory: session.history,
    exportHandHistory,
    clearHandHistory,
    recordLensSnapshot,
  };
}
