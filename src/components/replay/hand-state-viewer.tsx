"use client";

/**
 * HandStateViewer — renders a GameState snapshot using existing PlayerList + BoardDisplay + PotDisplay.
 *
 * Thin mapper: builds UnifiedSeatConfig[] from GameState, then composes existing components.
 * Reusable for both Replay (Phase C) and Drill Mode (Phase D).
 */
import { useMemo } from "react";
import type { GameState } from "../../../convex/lib/state/game-state";
import type { SeatSetupEntry } from "../../../convex/lib/audit/types";
import type { DecisionSnapshot } from "../../../convex/lib/audit/types";
import type { UnifiedSeatConfig } from "@/hooks/use-hand-manager";
import type { AutoPlayDecision } from "../../../convex/lib/opponents/autoPlay";
import {
  positionForSeat,
  positionDisplayName,
} from "../../../convex/lib/primitives/position";
import { PlayerList } from "../table/player-list";
import { BoardDisplay } from "../workspace/board-display";
import { PotDisplay } from "../workspace/pot-display";

export interface HandStateViewerProps {
  gameState: GameState;
  heroSeatIndex: number;
  bigBlind: number;
  /** Seat setup from HandRecord — provides profile names and card visibility */
  seatSetup?: SeatSetupEntry[];
  /** Engine decisions for current snapshot (keyed by seatIndex) */
  decisions?: Map<number, AutoPlayDecision>;
  /** Show all hole cards regardless of visibility */
  showAllCards?: boolean;
}

export function HandStateViewer({
  gameState,
  heroSeatIndex,
  bigBlind,
  seatSetup,
  decisions,
  showAllCards = false,
}: HandStateViewerProps) {
  const seats: UnifiedSeatConfig[] = useMemo(() => {
    const setupMap = new Map(seatSetup?.map((s) => [s.seatIndex, s]));
    const numPlayers = gameState.players.length;
    const dealerSeat = gameState.dealerSeatIndex;

    return gameState.players.map((p) => {
      const setup = setupMap.get(p.seatIndex);
      const position = positionForSeat(p.seatIndex, dealerSeat, numPlayers);
      const isHero = p.seatIndex === heroSeatIndex;
      const visibility = showAllCards
        ? "revealed"
        : setup?.cardVisibility ?? p.cardVisibility;

      return {
        seatIndex: p.seatIndex,
        position,
        positionDisplay: positionDisplayName(position),
        isHero,
        profile: setup?.profileName
          ? { id: setup.profileId ?? "", name: setup.profileName } as UnifiedSeatConfig["profile"]
          : undefined,
        status: p.status,
        stack: p.currentStack,
        startingStack: p.startingStack,
        holeCards: isHero || visibility !== "hidden" ? p.holeCards : [],
        cardVisibility: visibility,
        streetCommitted: p.streetCommitted,
        totalCommitted: p.totalCommitted,
        actions: gameState.actionHistory
          .filter((a) => a.seatIndex === p.seatIndex)
          .map((a) => ({
            street: a.street,
            actionType: a.actionType,
            amount: a.amount,
          })),
        label: isHero ? "Hero" : setup?.profileName ?? `Seat ${p.seatIndex}`,
      };
    });
  }, [gameState, heroSeatIndex, seatSetup, showAllCards]);

  const heroCards = useMemo(() => {
    const hero = gameState.players.find((p) => p.seatIndex === heroSeatIndex);
    return hero?.holeCards ?? [];
  }, [gameState, heroSeatIndex]);

  const activePlayerSeat = gameState.activePlayerIndex !== null
    ? gameState.players[gameState.activePlayerIndex]?.seatIndex ?? null
    : null;

  return (
    <div className="space-y-4">
      <PlayerList
        seats={seats}
        selectedSeat={null}
        onSeatClick={() => {}}
        bigBlind={bigBlind}
        activePlayerSeat={activePlayerSeat}
        decisions={decisions}
      />

      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
        <div className="p-4 relative">
          {gameState.pot.total > 0 && (
            <div className="absolute top-2 left-3">
              <PotDisplay
                pot={gameState.pot}
                blinds={{ small: bigBlind / 2, big: bigBlind }}
              />
            </div>
          )}
          <BoardDisplay
            heroCards={heroCards}
            communityCards={gameState.communityCards}
            onCardClick={() => {}}
          />
        </div>
      </div>
    </div>
  );
}
