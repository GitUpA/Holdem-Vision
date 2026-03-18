"use client";

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useHandManager } from "@/hooks/use-hand-manager";
import { useAnalysis } from "@/hooks/use-analysis";
import { useDeckVision } from "@/hooks/use-deck-vision";
import { BoardDisplay } from "./board-display";
// StreetControls removed — streets auto-advance via state machine
import { ActionPanel } from "./action-panel";
import { PotDisplay } from "./pot-display";
import { GameSetupPanel } from "./game-setup-panel";
import { GuideDrawer } from "./guide-drawer";
import { LensSelector } from "./lens-selector";
import { CardSelector, type SelectionMode } from "../cards/card-selector";
import { VisualRenderer } from "../analysis/visual-renderer";
import { ExplanationTree } from "../analysis/explanation-tree";
import { CoachingPanel } from "../analysis/coaching-panel";
import type { CoachingAdvice } from "../../../convex/lib/analysis/coachingLens";
import { PlayerList } from "../table/player-list";
import { TableControls } from "../table/table-controls";
import { OpponentDetail } from "../table/opponent-detail";
import { HandReplayer } from "../replay/hand-replayer";
import type { HandRecord } from "../../../convex/lib/audit/types";
import type { OpponentReadValue } from "../../../convex/lib/analysis/opponentRead";
import type { SelectionTarget } from "@/hooks/use-hand-manager";
import { evaluateHand, compareHandRanks } from "../../../convex/lib/primitives/handEvaluator";
import type { EvaluatedHand } from "../../../convex/lib/primitives/handEvaluator";
import type { CardIndex } from "../../../convex/lib/types/cards";

// ── SVG icon helpers (matches lens-selector style) ──

function SvgIcon({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shrink-0", className)}
    >
      {children}
    </svg>
  );
}

/** Trophy — hero win */
function TrophyIcon({ className }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 22V8a6 6 0 0 0 12 0V2H6v6a6 6 0 0 0 4 5.66V22" />
      <path d="M14 22V13.66A6 6 0 0 0 18 8" />
    </SvgIcon>
  );
}

/** Skull/X — villain win */
function DefeatIcon({ className }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </SvgIcon>
  );
}

/** Crown — winner marker in list */
function CrownIcon({ className }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z" />
      <path d="M5 16h14v2H5z" />
    </SvgIcon>
  );
}

/** Map SelectionTarget from hand manager → SelectionMode for card grid UI */
function mapTargetToMode(target: SelectionTarget): SelectionMode {
  if (target === "hero") return "hero";
  if (target === "community") return "community";
  // villain-N targets use the grid in hero mode (cards route to villain buffer internally)
  return "hero";
}

export function VisionWorkspace() {
  const hand = useHandManager();
  const [guideOpen, setGuideOpen] = useState(false);
  const [replayRecord, setReplayRecord] = useState<HandRecord | null>(null);

  // Expose audit export to browser console for testing
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    w.__exportHandHistory = hand.exportHandHistory;
    w.__handHistory = hand.handHistory;
  }, [hand.exportHandHistory, hand.handHistory]);

  const {
    results,
    activeLensIds,
    availableLenses,
    toggleLens,
    heavyComputing,
  } = useAnalysis(
    hand.heroCards,
    hand.communityCards,
    hand.deadCards,
    hand.street,
    hand.opponents,
    hand.heroPosition,
    hand.numPlayers,
    hand.gameContext,
    hand.gameState,
    hand.heroSeatIndex,
  );

  // Snapshot lens results to audit recorder once per street
  const lastLensStreetRef = useRef<string | null>(null);
  useEffect(() => {
    if (!hand.isHandActive || results.size === 0) return;
    const key = `${hand.street}-${hand.handNumber}`;
    if (lastLensStreetRef.current === key) return;
    lastLensStreetRef.current = key;
    hand.recordLensSnapshot(hand.street, results);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally excludes `hand` object; only triggers on street/handNumber changes
  }, [hand.isHandActive, hand.street, hand.handNumber, results, hand.recordLensSnapshot]);

  const deckVisionCards = useDeckVision(hand.heroCards, hand.communityCards, hand.deadCards, results);

  // Hero stack for ActionPanel
  const heroStack = useMemo(() => {
    if (!hand.gameState) return 0;
    const hero = hand.seats.find((s) => s.isHero);
    return hero?.stack ?? 0;
  }, [hand.gameState, hand.seats]);

  // Extract opponent analysis for the selected seat
  const selectedSeatAnalysis = useMemo(() => {
    if (hand.selectedSeat === null) return undefined;
    const oppReadResult = results.get("opponent-read");
    if (!oppReadResult) return undefined;
    const value = oppReadResult.value as OpponentReadValue;
    const seat = hand.seats.find((s) => s.seatIndex === hand.selectedSeat);
    if (!seat) return undefined;
    return value.opponents.find((o) => o.label === seat.label);
  }, [hand.selectedSeat, hand.seats, results]);

  const selectedSeat = hand.selectedSeat !== null
    ? hand.seats.find((s) => s.seatIndex === hand.selectedSeat)
    : undefined;

  // Derive the card-grid selection mode from the hand manager's selection target
  const cardGridMode = mapTargetToMode(hand.selectionTarget);

  const handleModeChange = useCallback(
    (mode: SelectionMode) => {
      hand.setSelectionTarget(mode === "hero" ? "hero" : mode === "community" ? "community" : "hero");
    },
    [hand],
  );

  // ── Showdown result computation ──
  const showdownResult = useMemo(() => {
    if (!hand.isHandOver || !hand.gameState) return null;
    const gs = hand.gameState;
    const community = gs.communityCards;

    // Find players still in hand (active or all_in)
    const inHand = gs.players.filter(
      (p) => p.status === "active" || p.status === "all_in",
    );

    // Win by fold — only one player left
    if (inHand.length === 1) {
      const winner = inHand[0];
      const seat = hand.seats.find((s) => s.seatIndex === winner.seatIndex);
      return {
        type: "fold" as const,
        winnerSeatIndex: winner.seatIndex,
        winnerLabel: seat?.label ?? `Seat ${winner.seatIndex}`,
        winnerIsHero: seat?.isHero ?? false,
        potWon: gs.pot.total,
      };
    }

    // Showdown — evaluate all hands (need 5+ community cards for full eval)
    if (community.length < 5) {
      // Not enough community cards for full evaluation — just show who's in
      return null;
    }

    const evaluations: {
      seatIndex: number;
      label: string;
      isHero: boolean;
      holeCards: CardIndex[];
      evaluated: EvaluatedHand;
      status: string;
    }[] = [];

    for (const p of gs.players) {
      if (p.holeCards.length < 2) continue;
      const seat = hand.seats.find((s) => s.seatIndex === p.seatIndex);
      if (!seat) continue;

      // Only evaluate players still in hand OR folded players with revealed cards
      const isInHand = p.status === "active" || p.status === "all_in";
      const isRevealed = p.cardVisibility !== "hidden";
      if (!isInHand && !isRevealed) continue;

      try {
        const allCards = [...p.holeCards, ...community];
        const evaluated = evaluateHand(allCards);
        evaluations.push({
          seatIndex: p.seatIndex,
          label: seat.label,
          isHero: seat.isHero,
          holeCards: p.holeCards,
          evaluated,
          status: p.status,
        });
      } catch {
        // Skip if evaluation fails (shouldn't happen with valid cards)
      }
    }

    if (evaluations.length === 0) return null;

    // Find winner among players still in hand only
    const inHandEvals = evaluations.filter(
      (e) => e.status === "active" || e.status === "all_in",
    );
    let winnerEval = inHandEvals[0];
    for (const e of inHandEvals.slice(1)) {
      if (compareHandRanks(e.evaluated.rank, winnerEval.evaluated.rank) > 0) {
        winnerEval = e;
      }
    }

    return {
      type: "showdown" as const,
      winnerSeatIndex: winnerEval.seatIndex,
      winnerLabel: winnerEval.label,
      winnerIsHero: winnerEval.isHero,
      winnerHand: winnerEval.evaluated.rank.name,
      potWon: gs.pot.total,
      evaluations,
    };
  }, [hand.isHandOver, hand.gameState, hand.seats]);

  const handleSeatClick = (seatIndex: number) => {
    const seat = hand.seats.find((s) => s.seatIndex === seatIndex);
    if (seat?.isHero) return;
    hand.setSelectedSeat(
      hand.selectedSeat === seatIndex ? null : seatIndex,
    );
  };

  return (
    <div className="min-h-[calc(100vh-65px)] felt-bg">
      <div className="max-w-[1600px] mx-auto px-4 py-4">
        {/* Main content: 2-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_auto_1fr] gap-4">
          {/* Left column: Replay or Board + Players + Actions + Card Grid */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="space-y-4"
          >
            {replayRecord ? (
              <HandReplayer
                record={replayRecord}
                onClose={() => setReplayRecord(null)}
              />
            ) : (
            <>
            {/* Player list — always visible, top of left column */}
            <PlayerList
              seats={hand.seats}
              selectedSeat={hand.selectedSeat}
              onSeatClick={handleSeatClick}
              bigBlind={hand.blinds.big}
              activePlayerSeat={hand.activePlayerSeat}
              decisions={hand.lastDecisions}
            />

            {/* Opponent detail panel (when a seat is selected) */}
            <AnimatePresence>
              {selectedSeat && !selectedSeat.isHero && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <OpponentDetail
                    seat={selectedSeat}
                    analysis={selectedSeatAnalysis}
                    decision={hand.lastDecisions.get(selectedSeat.seatIndex)}
                    onAssignProfile={(profile) =>
                      hand.assignProfile(selectedSeat.seatIndex, profile)
                    }
                    onClose={() => hand.setSelectedSeat(null)}
                    onReveal={() => hand.revealVillainCards(selectedSeat.seatIndex)}
                    onHide={() => hand.hideVillainCards(selectedSeat.seatIndex)}
                    onStartCardAssign={() =>
                      hand.setSelectionTarget(`villain-${selectedSeat.seatIndex}`)
                    }
                    selectionTarget={hand.selectionTarget}
                    villainCardBuffer={hand.villainCardBuffer.get(selectedSeat.seatIndex)}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Game setup (before deal) or hand-over result — same width as board */}
            {!hand.isHandActive && !hand.isHandOver && (
              <GameSetupPanel
                blinds={hand.blinds}
                startingStack={hand.startingStack}
                onBlindsChange={hand.setBlinds}
                onStackChange={hand.setStartingStack}
                onStart={hand.startHand}
              />
            )}

            {!hand.isHandActive && hand.isHandOver && (
              <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
                {/* Winner banner */}
                {showdownResult && (
                  <div className={cn(
                    "px-4 py-3 text-center border-b border-[var(--border)]",
                    showdownResult.winnerIsHero
                      ? "bg-[var(--gold)]/15"
                      : "bg-red-500/10",
                  )}>
                    <div className="flex items-center justify-center gap-2">
                      {showdownResult.winnerIsHero
                        ? <TrophyIcon className="text-[var(--gold)]" />
                        : <DefeatIcon className="text-red-400" />}
                      <span className={cn(
                        "text-sm font-bold uppercase tracking-wider",
                        showdownResult.winnerIsHero
                          ? "text-[var(--gold)]"
                          : "text-red-400",
                      )}>
                        {showdownResult.winnerIsHero ? "You Win!" : `${showdownResult.winnerLabel} Wins`}
                      </span>
                      {showdownResult.winnerIsHero
                        ? <TrophyIcon className="text-[var(--gold)]" />
                        : <DefeatIcon className="text-red-400" />}
                    </div>
                    <p className="text-xs text-[var(--muted-foreground)] mt-1">
                      {showdownResult.type === "fold"
                        ? "All opponents folded"
                        : showdownResult.winnerHand}
                      {" · "}
                      {(showdownResult.potWon / hand.blinds.big).toFixed(1)} BB pot
                    </p>
                  </div>
                )}

                {/* No showdown result (not enough community cards) */}
                {!showdownResult && (
                  <div className="px-4 py-3 text-center border-b border-[var(--border)]">
                    <p className="text-sm font-bold text-[var(--gold)] uppercase tracking-wider">
                      Hand Complete
                    </p>
                    <p className="text-xs text-[var(--muted-foreground)] mt-1">
                      Final pot: {(hand.pot.total / hand.blinds.big).toFixed(1)} BB
                    </p>
                  </div>
                )}

                {/* Hand evaluations for all players with visible cards */}
                {showdownResult?.type === "showdown" && showdownResult.evaluations.length > 0 && (
                  <div className="px-4 py-3 space-y-2">
                    {showdownResult.evaluations
                      .sort((a, b) => compareHandRanks(b.evaluated.rank, a.evaluated.rank))
                      .map((e) => {
                        const isWinner = e.seatIndex === showdownResult.winnerSeatIndex;
                        const isFolded = e.status === "folded";
                        return (
                          <div
                            key={e.seatIndex}
                            className={cn(
                              "flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors",
                              isWinner
                                ? "bg-[var(--gold)]/10 ring-1 ring-[var(--gold)]/40"
                                : "bg-[var(--muted)]/20",
                            )}
                          >
                            {/* Winner indicator */}
                            <span className="w-4 flex items-center justify-center">
                              {isWinner && !isFolded && <CrownIcon className="text-[var(--gold)]" />}
                            </span>

                            {/* Player label */}
                            <span className={cn(
                              "font-semibold min-w-[40px]",
                              e.isHero ? "text-[var(--gold)]" : "text-[var(--foreground)]",
                            )}>
                              {e.label}
                            </span>

                            {/* Hole cards */}
                            <span className="inline-flex gap-1">
                              {e.holeCards.map((c) => (
                                <span
                                  key={c}
                                  className={`font-mono font-bold px-1.5 py-0.5 rounded bg-white/90 ${suitColor(c)}`}
                                >
                                  {cardLabel(c)}
                                </span>
                              ))}
                            </span>

                            {/* Hand name */}
                            <span className={cn(
                              "text-[11px] font-medium",
                              isWinner ? "text-[var(--gold)]" : "text-[var(--muted-foreground)]",
                            )}>
                              {e.evaluated.rank.name}
                            </span>

                            {/* Folded badge */}
                            {isFolded && (
                              <span className="text-[9px] text-[var(--muted-foreground)] ml-auto">
                                folded
                              </span>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}

                {/* Fold-out — just show winner got the pot */}
                {showdownResult?.type === "fold" && (
                  <div className="px-4 py-3">
                    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-[var(--gold)]/10 ring-1 ring-[var(--gold)]/40 text-xs">
                      <CrownIcon className="text-[var(--gold)]" />
                      <span className={cn(
                        "font-semibold",
                        showdownResult.winnerIsHero ? "text-[var(--gold)]" : "text-[var(--foreground)]",
                      )}>
                        {showdownResult.winnerLabel}
                      </span>
                      <span className="text-[var(--muted-foreground)]">
                        wins {(showdownResult.potWon / hand.blinds.big).toFixed(1)} BB uncontested
                      </span>
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="px-4 py-3 flex items-center justify-center gap-2 border-t border-[var(--border)]">
                  <button
                    onClick={hand.revealAllVillains}
                    className="text-[10px] px-3 py-1.5 rounded border border-[var(--gold-dim)]/30 text-[var(--gold-dim)] hover:bg-[var(--gold)]/10 transition-colors"
                  >
                    Reveal All
                  </button>
                  {hand.handHistory.length > 0 && (
                    <button
                      onClick={() => setReplayRecord(hand.handHistory[hand.handHistory.length - 1])}
                      className="text-[10px] px-3 py-1.5 rounded border border-blue-400/30 text-blue-400 hover:bg-blue-400/10 transition-colors"
                    >
                      Replay
                    </button>
                  )}
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={hand.startNextHand}
                    className="px-5 py-2 rounded-lg bg-[var(--felt)] text-[var(--gold)] font-semibold text-sm border border-[var(--gold-dim)]/40 hover:border-[var(--gold)]/60 transition-colors"
                  >
                    Deal Next Hand
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      hand.newHand();
                      hand.startHand();
                    }}
                    className="px-5 py-2 rounded-lg bg-[var(--card)] text-[var(--muted-foreground)] text-sm border border-[var(--border)] hover:border-[var(--gold-dim)]/40 hover:text-[var(--gold-dim)] transition-colors"
                  >
                    Deal Fresh
                  </motion.button>
                </div>
              </div>
            )}

            {/* Board display with header + pot overlay */}
            <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
              {/* Board header: street pills, table controls, guide */}
              <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[var(--border)] bg-[var(--muted)]/20">
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Street indicator pills */}
                  <div className="flex items-center gap-1">
                    {(["preflop", "flop", "turn", "river"] as const).map((s) => (
                      <span
                        key={s}
                        className={cn(
                          "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full transition-colors",
                          s === hand.street
                            ? "bg-[var(--felt)] text-[var(--gold)] border border-[var(--gold-dim)]/40"
                            : "text-[var(--muted-foreground)]/50",
                        )}
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                  <div className="h-4 w-px bg-[var(--border)]" />
                  <TableControls
                    numPlayers={hand.numPlayers}
                    onNumPlayersChange={hand.setNumPlayers}
                    onRotateDealer={() => hand.moveDealer(hand.dealerSeatIndex + 1)}
                    onReset={hand.newHand}
                    isHandActive={hand.isHandActive}
                  />
                </div>
                <button
                  onClick={() => setGuideOpen(true)}
                  className="w-7 h-7 rounded-full border border-[var(--border)] bg-[var(--muted)]/40 text-[var(--muted-foreground)] hover:text-[var(--gold)] hover:border-[var(--gold-dim)]/40 transition-colors flex items-center justify-center text-xs font-bold shrink-0"
                  title="How to use"
                >
                  ?
                </button>
              </div>

              {/* Board content */}
              <div className="p-4 relative">
                {/* Pot info — top-left inside the board area */}
                {hand.isHandActive && hand.pot.total > 0 && (
                  <div className="absolute top-2 left-3">
                    <PotDisplay pot={hand.pot} blinds={hand.blinds} />
                  </div>
                )}
                <BoardDisplay
                  heroCards={hand.heroCards}
                  communityCards={hand.communityCards}
                  onCardClick={() => {}}
                />

                {/* Action panel — below the board inside the card */}
                {hand.isHeroTurn && hand.legalActions && (
                  <div className="mt-4">
                    <ActionPanel
                      legalActions={hand.legalActions}
                      pot={hand.pot}
                      heroStack={heroStack}
                      blinds={hand.blinds}
                      onAct={hand.act}
                    />
                  </div>
                )}
              </div>

              </div>

            {/* Coaching analysis — own card below the board */}
            {(() => {
              const coachingResult = results.get("coaching");
              if (!coachingResult || coachingResult.visuals.length === 0) return null;
              const coachingVisual = coachingResult.visuals.find((v) => v.type === "coaching");
              if (!coachingVisual) return null;
              const { advices } = coachingVisual.data as {
                advices: CoachingAdvice[];
              };
              if (!advices || advices.length === 0) return null;
              return (
                <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
                  <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--muted)]/30">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--gold-dim)]">
                      Coaching
                    </h3>
                  </div>
                  <div className="px-4 py-3">
                    <CoachingPanel advices={advices} />
                  </div>
                </div>
              );
            })()}

            {/* Card selector (52-card grid) */}
            <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-3">
              <CardSelector
                cards={deckVisionCards}
                usedCards={hand.allUsedCards}
                selectionMode={cardGridMode}
                onCardClick={hand.toggleCard}
                onModeChange={handleModeChange}
                readOnly={!hand.isHandActive && !hand.isHandOver}
              />
            </div>
            </>
            )}
          </motion.div>

          {/* Center divider on large screens */}
          <div className="hidden lg:block w-px bg-[var(--border)]" />

          {/* Right column: Analysis header + Opponent detail + Analysis panels */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-4"
          >
            {/* Analysis header: lens toggles + guide button */}
            <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--gold-dim)] shrink-0">
                  Analysis
                </h2>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={hand.randomizeProfiles}
                    className="text-[10px] px-2.5 py-1 rounded border border-[var(--border)] bg-[var(--muted)]/40 text-[var(--muted-foreground)] hover:text-[var(--gold)] hover:border-[var(--gold-dim)]/40 transition-colors font-medium"
                    title="Randomize all villain profiles"
                  >
                    Randomize
                  </button>
                  <button
                    onClick={() => setGuideOpen(true)}
                    className="w-6 h-6 rounded-full border border-[var(--border)] bg-[var(--muted)]/40 text-[var(--muted-foreground)] hover:text-[var(--gold)] hover:border-[var(--gold-dim)]/40 transition-colors flex items-center justify-center text-[10px] font-bold shrink-0"
                    title="How to use"
                  >
                    ?
                  </button>
                </div>
              </div>
              <div className="px-3 pb-2.5">
                <LensSelector
                  availableLenses={availableLenses}
                  activeLensIds={activeLensIds}
                  onToggle={toggleLens}
                />
              </div>
            </div>

            {hand.heroCards.length < 2 ? (
              <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6 text-center">
                <p className="text-lg font-medium text-[var(--muted-foreground)]">
                  Deal a hand to begin
                </p>
                <p className="text-sm text-[var(--muted-foreground)]/60 mt-1">
                  Configure settings above and click Deal Hand
                </p>
              </div>
            ) : (
              <>
                {/* Analysis panels — rendered in activeLensIds order */}
                {activeLensIds.map((lensId) => {
                  // Coaching renders inside the board card, not here
                  if (lensId === "coaching") return null;

                  const lensName = availableLenses.find((l) => l.id === lensId)?.name ?? lensId;
                  const result = results.get(lensId);
                  const isComputing = heavyComputing.has(lensId);

                  if (isComputing && !result) {
                    return (
                      <motion.div
                        key={lensId}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden"
                      >
                        <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--muted)]/30">
                          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--gold-dim)]">
                            {lensName}
                          </h3>
                        </div>
                        <div className="p-4 flex items-center gap-3">
                          <div className="h-4 w-4 rounded-full border-2 border-[var(--gold-dim)] border-t-transparent animate-spin" />
                          <span className="text-sm text-[var(--muted-foreground)]">
                            Calculating...
                          </span>
                        </div>
                      </motion.div>
                    );
                  }

                  if (!result) return null;
                  if (result.visuals.length === 0 && !result.explanation.summary) return null;

                  return (
                    <motion.div
                      key={lensId}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden"
                    >
                      <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--muted)]/30">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--gold-dim)]">
                          {lensName}
                        </h3>
                      </div>
                      <div className="p-4 space-y-3">
                        <VisualRenderer
                          results={new Map([[lensId, result]])}
                          street={hand.street}
                        />
                        {!(lensId === "coaching" && result.visuals.length > 0) && (
                          <div className="border-t border-[var(--border)] pt-3">
                            <ExplanationTree
                              node={result.explanation}
                              defaultOpen={true}
                            />
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </>
            )}
          </motion.div>
        </div>
      </div>

      {/* Guide drawer */}
      <GuideDrawer open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────
// Card encoding: index = rank * 4 + suit
//   rank = Math.floor(card / 4)  → 0=2 … 12=A
//   suit = card % 4              → 0=♣  1=♦  2=♥  3=♠

const RANK_LABELS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
const SUIT_LABELS = ["\u2663", "\u2666", "\u2665", "\u2660"]; // clubs, diamonds, hearts, spades

function cardLabel(card: import("../../../convex/lib/types/cards").CardIndex): string {
  const rank = Math.floor(card / 4);
  const suit = card % 4;
  return `${RANK_LABELS[rank]}${SUIT_LABELS[suit]}`;
}

function suitColor(card: import("../../../convex/lib/types/cards").CardIndex): string {
  const suit = card % 4;
  // clubs=0, diamonds=1, hearts=2, spades=3
  return suit === 1 || suit === 2 ? "text-red-600" : "text-gray-900";
}
