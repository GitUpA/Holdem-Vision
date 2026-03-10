"use client";

/**
 * Unified hand manager — single hook replacing useGameEngine + useCardSelection + useTableSetup.
 *
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
  initializeHand,
  applyAction,
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
import {
  chooseActionFromProfile,
  type AutoPlayDecision,
} from "../../convex/lib/opponents/autoPlay";
import {
  positionForSeat,
  positionDisplayName,
  seatToPositionMap,
} from "../../convex/lib/primitives/position";
import { PRESET_PROFILES, PRESET_IDS } from "../../convex/lib/opponents/presets";

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
  // ─── Table config ───
  const [numPlayers, setNumPlayersRaw] = useState(
    Math.min(Math.max(initialPlayers, 2), 10),
  );
  const [dealerSeatIndex, setDealerSeatIndex] = useState(0);
  const [heroSeatIndex, setHeroSeatIndex] = useState(0);
  const [blinds, setBlinds] = useState<BlindStructure>({ small: 1, big: 2 });
  const [startingStack, setStartingStack] = useState(200);

  // ─── Seat config ───
  const [seatProfiles, setSeatProfiles] = useState<Map<number, OpponentProfile>>(new Map());
  const [seatLabels, setSeatLabels] = useState<Map<number, string>>(new Map());

  // ─── Game state ───
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [handNumber, setHandNumber] = useState(0);

  // ─── Card selection ───
  const [selectionTarget, setSelectionTarget] = useState<SelectionTarget>("hero");
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);

  // Counter ref for random seeding — initialized from timestamp so each
  // session starts with different cards instead of always dealing the same hand.
  const seedRef = useRef(Date.now());

  // Store last opponent decisions for display (engine reasoning)
  const lastDecisionsRef = useRef<Map<number, AutoPlayDecision>>(new Map());

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

  const isHandActive = gameState !== null &&
    gameState.phase !== "complete" &&
    gameState.phase !== "showdown";

  const isHandOver = gameState !== null &&
    (gameState.phase === "complete" || gameState.phase === "showdown");

  // ─── All used cards (for deck vision) ───

  const allUsedCards = useMemo(() => {
    if (!gameState) return new Set<CardIndex>();
    const used = new Set<CardIndex>();
    // Hero cards are always "used"
    const hero = gameState.players.find((p) => p.seatIndex === heroSeatIndex);
    if (hero) for (const c of hero.holeCards) used.add(c);
    // Community cards
    for (const c of gameState.communityCards) used.add(c);
    // Visible villain cards
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

  // ─── Build unified seat configs ───

  const seats: UnifiedSeatConfig[] = useMemo(() => {
    const result: UnifiedSeatConfig[] = [];
    for (let i = 0; i < numPlayers; i++) {
      const position = positionMap.get(i)!;
      const isHero = i === heroSeatIndex;
      const player = gameState?.players[i];

      // Build action history for this seat
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
        stack: player?.currentStack ?? startingStack,
        startingStack: player?.startingStack ?? startingStack,
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

  // ─── Auto-advance opponents ───
  // Accepts profiles map as parameter to avoid stale closure issues
  // when startHand assigns default profiles in the same render cycle.

  const advanceOpponents = useCallback(
    (state: GameState, profiles: Map<number, OpponentProfile>): GameState => {
      let s = state;
      let safety = 0;

      while (safety < 100) {
        safety++;

        if (s.phase === "complete" || s.phase === "showdown") break;
        if (s.activePlayerIndex === null) break;

        const activePlayer = s.players[s.activePlayerIndex];

        // Hero's turn → stop
        if (activePlayer.seatIndex === heroSeatIndex) break;

        const legal = currentLegalActions(s);
        if (!legal) break;

        // Profile-driven auto-play
        const profile = profiles.get(activePlayer.seatIndex);
        let actionType: ActionType;
        let amount: number | undefined;

        if (profile) {
          const decision = chooseActionFromProfile(
            s,
            activePlayer.seatIndex,
            profile,
            legal,
            (id) => PRESET_PROFILES[id],
          );
          actionType = decision.actionType;
          amount = decision.amount;
          // Store decision for UI display
          lastDecisionsRef.current.set(activePlayer.seatIndex, decision);
        } else {
          // Fallback: simple check/call (shouldn't happen — startHand assigns defaults)
          if (legal.canCheck) {
            actionType = "check";
          } else if (legal.canCall) {
            actionType = "call";
          } else {
            actionType = legal.canFold ? "fold" : "check";
          }
        }

        try {
          const result = applyAction(s, activePlayer.seatIndex, actionType, amount);
          s = result.state;
        } catch {
          // Fallback: fold or check
          try {
            s = applyAction(s, activePlayer.seatIndex, legal.canFold ? "fold" : "check").state;
          } catch {
            break;
          }
        }
      }

      return s;
    },
    [heroSeatIndex],
  );

  // ═══════════════════════════════════════════════════════
  // ACTIONS
  // ═══════════════════════════════════════════════════════

  // ─── Start hand ───

  const startHand = useCallback(() => {
    const seed = seedRef.current++;
    const stacks = Array(numPlayers).fill(startingStack);
    lastDecisionsRef.current = new Map();

    // Build card overrides: hero always revealed
    const overrides: CardOverride[] = [];
    // Hero's visibility set via cardVisibility in player creation

    const config = {
      numPlayers,
      dealerSeatIndex,
      blinds,
      startingStacks: stacks,
      handNumber: handNumber + 1,
      seed,
      cardOverrides: overrides.length > 0 ? overrides : undefined,
    };

    const { state } = initializeHand(config);

    // Mark hero as revealed
    let s = state;
    s = {
      ...s,
      players: s.players.map((p) =>
        p.seatIndex === heroSeatIndex
          ? { ...p, cardVisibility: "revealed" as CardVisibility }
          : p,
      ),
    };

    // Ensure every villain has a profile — assign random defaults for any missing
    const profiles = new Map(seatProfiles);
    let profilesChanged = false;
    for (let i = 0; i < numPlayers; i++) {
      if (i === heroSeatIndex) continue;
      if (!profiles.has(i)) {
        const randomId = PRESET_IDS[Math.floor(Math.random() * PRESET_IDS.length)];
        profiles.set(i, PRESET_PROFILES[randomId]);
        profilesChanged = true;
      }
    }
    if (profilesChanged) {
      setSeatProfiles(profiles);
    }

    // Auto-advance opponents (pass profiles directly to avoid stale closure)
    const advanced = advanceOpponents(s, profiles);
    setGameState(advanced);
    setHandNumber((n) => n + 1);
    setSelectionTarget("hero");
  }, [numPlayers, dealerSeatIndex, blinds, startingStack, handNumber, heroSeatIndex, seatProfiles, advanceOpponents]);

  // ─── Hero acts ───

  const act = useCallback(
    (actionType: ActionType, amount?: number) => {
      if (!gameState || !isHeroTurn) return;
      try {
        const { state } = applyAction(gameState, heroSeatIndex, actionType, amount);
        const advanced = advanceOpponents(state, seatProfiles);
        setGameState(advanced);
      } catch (e) {
        console.error("Invalid action:", e);
      }
    },
    [gameState, isHeroTurn, heroSeatIndex, seatProfiles, advanceOpponents],
  );

  // ─── New hand ───

  const newHand = useCallback(() => {
    setGameState(null);
    setSelectionTarget("hero");
    setVillainCardBuffer(new Map());
  }, []);

  // ─── Card overrides ───

  const overrideHeroCards = useCallback(
    (cards: CardIndex[]) => {
      if (!gameState || cards.length !== 2) return;
      try {
        const newState = applyCardOverrides(gameState, [
          { seatIndex: heroSeatIndex, cards, visibility: "revealed" },
        ]);
        setGameState(newState);
      } catch (e) {
        console.error("Card override error:", e);
      }
    },
    [gameState, heroSeatIndex],
  );

  const overrideVillainCards = useCallback(
    (seatIndex: number, cards: CardIndex[], visibility: CardVisibility = "assigned") => {
      if (!gameState || cards.length !== 2) return;
      try {
        const newState = applyCardOverrides(gameState, [
          { seatIndex, cards, visibility },
        ]);
        setGameState(newState);
      } catch (e) {
        console.error("Card override error:", e);
      }
    },
    [gameState],
  );

  const overrideCommunityCards = useCallback(
    (cards: CardIndex[]) => {
      if (!gameState || cards.length < 3 || cards.length > 5) return;
      try {
        const newState = applyCommunityOverride(gameState, cards);
        setGameState(newState);
      } catch (e) {
        console.error("Community override error:", e);
      }
    },
    [gameState],
  );

  // ─── Reveal / hide villain cards ───

  const revealVillainCards = useCallback(
    (seatIndex: number) => {
      if (!gameState) return;
      const newState = setCardVisibility(gameState, seatIndex, "revealed");
      setGameState(newState);
    },
    [gameState],
  );

  const hideVillainCards = useCallback(
    (seatIndex: number) => {
      if (!gameState) return;
      const newState = setCardVisibility(gameState, seatIndex, "hidden");
      setGameState(newState);
    },
    [gameState],
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
    setGameState(s);
  }, [gameState, heroSeatIndex]);

  // ─── Partial villain card assignment tracking ───
  // When user clicks cards in villain mode, we accumulate up to 2 cards
  const [villainCardBuffer, setVillainCardBuffer] = useState<Map<number, CardIndex[]>>(new Map());

  // ─── Context-aware card toggle (click a card in the grid) ───

  const toggleCard = useCallback(
    (card: CardIndex) => {
      if (!gameState) return;

      // Don't allow selecting cards already used elsewhere
      if (allUsedCards.has(card)) return;

      const hero = gameState.players.find((p) => p.seatIndex === heroSeatIndex);

      if (selectionTarget === "hero" && hero) {
        // Hero mode: swap hero's cards
        // Replace first card, then second, cycling
        const newCards: CardIndex[] = hero.holeCards.length >= 2
          ? [hero.holeCards[1], card] // shift: drop oldest, append new
          : [...hero.holeCards, card];

        if (newCards.length === 2) {
          overrideHeroCards(newCards);
        }
      } else if (selectionTarget === "community") {
        // Community mode: build up board cards
        const current = [...gameState.communityCards];
        if (current.length < 5) {
          const next = [...current, card];
          // Need at least 3 cards for a valid override (flop)
          if (next.length >= 3) {
            overrideCommunityCards(next);
          }
        }
      } else if (selectionTarget.startsWith("villain-")) {
        // Villain mode: accumulate cards for this villain
        const seatIdx = parseInt(selectionTarget.split("-")[1], 10);
        const currentBuffer = villainCardBuffer.get(seatIdx) ?? [];

        if (currentBuffer.length < 2) {
          const next = [...currentBuffer, card];
          const newBuffer = new Map(villainCardBuffer);
          newBuffer.set(seatIdx, next);
          setVillainCardBuffer(newBuffer);

          if (next.length === 2) {
            // Both cards selected — apply the override
            overrideVillainCards(seatIdx, next, "assigned");
            // Clear buffer
            const cleared = new Map(newBuffer);
            cleared.delete(seatIdx);
            setVillainCardBuffer(cleared);
          }
        }
      }
    },
    [gameState, heroSeatIndex, selectionTarget, allUsedCards, villainCardBuffer, overrideHeroCards, overrideCommunityCards, overrideVillainCards],
  );

  // ─── Seat management ───

  const assignProfile = useCallback(
    (seatIndex: number, profile: OpponentProfile | undefined) => {
      setSeatProfiles((prev) => {
        const next = new Map(prev);
        if (profile) {
          next.set(seatIndex, profile);
        } else {
          next.delete(seatIndex);
        }
        return next;
      });
    },
    [],
  );

  const randomizeProfiles = useCallback(() => {
    setSeatProfiles((prev) => {
      const next = new Map(prev);
      for (let i = 0; i < numPlayers; i++) {
        if (i === heroSeatIndex) continue;
        const randomId = PRESET_IDS[Math.floor(Math.random() * PRESET_IDS.length)];
        next.set(i, PRESET_PROFILES[randomId]);
      }
      return next;
    });
  }, [numPlayers, heroSeatIndex]);

  const setNumPlayers = useCallback(
    (n: number) => {
      const clamped = Math.min(Math.max(n, 2), 10);
      setNumPlayersRaw(clamped);
      setDealerSeatIndex((prev) => prev % clamped);
      setHeroSeatIndex((prev) => prev % clamped);
      // Clean up stale seat data
      setSeatProfiles((prev) => {
        const next = new Map(prev);
        for (const key of next.keys()) if (key >= clamped) next.delete(key);
        return next;
      });
      // Reset game if players changed
      setGameState(null);
    },
    [],
  );

  const moveDealer = useCallback(
    (newSeat: number) => {
      setDealerSeatIndex(((newSeat % numPlayers) + numPlayers) % numPlayers);
    },
    [numPlayers],
  );

  const moveHero = useCallback(
    (newSeat: number) => {
      setHeroSeatIndex(((newSeat % numPlayers) + numPlayers) % numPlayers);
    },
    [numPlayers],
  );

  // ═══════════════════════════════════════════════════════
  // RETURN
  // ═══════════════════════════════════════════════════════

  return {
    // Hand lifecycle
    startHand,
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
    setBlinds,
    startingStack,
    setStartingStack,

    // Game state
    gameState,
    pot,
    isHandActive,
    isHandOver,
    activePlayerSeat,
    handNumber,
    allUsedCards,
    isCardUsed,

    // Engine decisions (for future UI display)
    lastDecisions: lastDecisionsRef.current,
  };
}
