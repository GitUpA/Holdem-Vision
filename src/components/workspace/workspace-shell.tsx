"use client";

/**
 * WorkspaceShell — unified workspace that renders ALL panels always.
 *
 * Mode controls what's ENABLED, not what's VISIBLE. Disabled panels
 * show at reduced opacity with a hint overlay via PanelWrapper.
 *
 * Both vision-mode and drill-mode panels render side by side.
 * The mode config determines which are interactive.
 */

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { WorkspaceMode, WorkspaceModeId, BoardSource } from "@/types/workspace-mode";
import { buildMode } from "@/types/workspace-mode";
import { useWorkspace, type WorkspaceState, INTERLEAVED_SENTINEL } from "@/hooks/use-workspace";
import { PanelWrapper } from "@/components/ui/panel-wrapper";

// ── Existing components ──
import { BoardDisplay } from "./board-display";
import { ActionPanel } from "./action-panel";
import { PotDisplay } from "./pot-display";
import { GameSetupPanel } from "./game-setup-panel";
import { GuideDrawer } from "./guide-drawer";
import { LensSelector } from "./lens-selector";
import { CardSelector, type SelectionMode } from "../cards/card-selector";
import { VisualRenderer } from "../analysis/visual-renderer";
import { ExplanationTree } from "../analysis/explanation-tree";
import { CoachingPanel } from "../analysis/coaching-panel";
import { HandGrid } from "../analysis/hand-grid";
import type { CoachingAdvice } from "../../../convex/lib/analysis/coachingLens";
import { PlayerList } from "../table/player-list";
import { TableControls } from "../table/table-controls";
import { OpponentDetail } from "../table/opponent-detail";
import { HandReplayer } from "../replay/hand-replayer";
import type { HandRecord } from "../../../convex/lib/audit/types";
import type { OpponentReadValue } from "../../../convex/lib/analysis/opponentRead";
import type { SelectionTarget } from "@/hooks/use-workspace";
import { evaluateHand, compareHandRanks } from "../../../convex/lib/primitives/handEvaluator";
import type { EvaluatedHand } from "../../../convex/lib/primitives/handEvaluator";
import type { CardIndex } from "../../../convex/lib/types/cards";

// Drill components
import { ScoreDisplay } from "../drill/score-display";
import { DrillGuideDrawer } from "../drill/drill-guide-drawer";
import { ArchetypeTutorialDrawer } from "../drill/archetype-tutorial-drawer";
import { NarrativeBoardContext } from "../drill/narrative-board-context";
// NarrativePrompt removed — narratives now integrated into ActionPanel
import { NarrativeFeedbackDisplay } from "../drill/narrative-feedback";
import { buildNarrativeSummary } from "../../../convex/lib/gto/narrativeSummary";


// Drill archetype data
import type { ArchetypeId, ArchetypeCategory, ArchetypeClassification } from "../../../convex/lib/gto/archetypeClassifier";
import { classifyArchetype, contextFromGameState } from "../../../convex/lib/gto/archetypeClassifier";
import { hasTable, hasAnyTableForStreet } from "../../../convex/lib/gto/tables/tableRegistry";
import { categorizeHand } from "../../../convex/lib/gto/handCategorizer";
import { buildActionStories } from "../../../convex/lib/gto/actionNarratives";
import { commentateHand } from "../../../convex/lib/analysis/handCommentator";

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

function SvgIcon({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn("shrink-0", className)}>
      {children}
    </svg>
  );
}

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

function DefeatIcon({ className }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </SvgIcon>
  );
}

function CrownIcon({ className }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z" />
      <path d="M5 16h14v2H5z" />
    </SvgIcon>
  );
}

function mapTargetToMode(target: SelectionTarget): SelectionMode {
  if (target === "hero") return "hero";
  if (target === "community") return "community";
  return "hero";
}

const RANK_LABELS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
const SUIT_LABELS = ["\u2663", "\u2666", "\u2665", "\u2660"];

function cardLabel(card: CardIndex): string {
  return `${RANK_LABELS[Math.floor(card / 4)]}${SUIT_LABELS[card % 4]}`;
}

function suitColor(card: CardIndex): string {
  const suit = card % 4;
  return suit === 1 || suit === 2 ? "text-red-600" : "text-gray-900";
}

// ── Archetype data for drill selector ──
interface ArchetypeEntry { id: ArchetypeId; label: string; category: ArchetypeCategory; }

const ALL_ARCHETYPES: ArchetypeEntry[] = [
  { id: "rfi_opening", label: "RFI Opening", category: "preflop" },
  { id: "bb_defense_vs_rfi", label: "BB Defense", category: "preflop" },
  { id: "three_bet_pots", label: "3-Bet Pots", category: "preflop" },
  { id: "blind_vs_blind", label: "Blind vs Blind", category: "preflop" },
  { id: "four_bet_five_bet", label: "4-Bet / 5-Bet", category: "preflop" },
  { id: "ace_high_dry_rainbow", label: "Ace-High Dry", category: "flop_texture" },
  { id: "kq_high_dry_rainbow", label: "K/Q-High Dry", category: "flop_texture" },
  { id: "mid_low_dry_rainbow", label: "Mid/Low Dry", category: "flop_texture" },
  { id: "paired_boards", label: "Paired Board", category: "flop_texture" },
  { id: "two_tone_disconnected", label: "Two-Tone Disco", category: "flop_texture" },
  { id: "two_tone_connected", label: "Two-Tone Conn", category: "flop_texture" },
  { id: "monotone", label: "Monotone", category: "flop_texture" },
  { id: "rainbow_connected", label: "Rainbow Conn", category: "flop_texture" },
  { id: "cbet_sizing_frequency", label: "C-Bet Sizing", category: "postflop_principle" },
  { id: "turn_barreling", label: "Turn Barreling", category: "postflop_principle" },
  { id: "river_bluff_catching_mdf", label: "River MDF", category: "postflop_principle" },
  { id: "thin_value_river", label: "Thin Value River", category: "postflop_principle" },
  { id: "overbet_river", label: "Overbet River", category: "postflop_principle" },
  { id: "three_bet_pot_postflop", label: "3-Bet Postflop", category: "postflop_principle" },
  { id: "exploitative_overrides", label: "Exploitative", category: "postflop_principle" },
];

const CATEGORY_LABELS: Record<ArchetypeCategory, string> = {
  preflop: "Preflop Archetypes",
  flop_texture: "Flop Texture Archetypes",
  postflop_principle: "Postflop Archetypes",
};

/** Map postflop principle archetypes to the street they need solver data for */
const POSTFLOP_STREET: Partial<Record<ArchetypeId, "flop" | "turn" | "river">> = {
  cbet_sizing_frequency: "flop",
  three_bet_pot_postflop: "flop",
  turn_barreling: "turn",
  river_bluff_catching_mdf: "river",
  thin_value_river: "river",
  overbet_river: "river",
  exploitative_overrides: "flop",
};

function isArchetypeAvailable(arch: ArchetypeEntry): boolean {
  if (arch.category === "preflop") return hasTable(arch.id, "preflop");
  if (arch.category === "flop_texture") return hasTable(arch.id, "flop");
  const street = POSTFLOP_STREET[arch.id] ?? "flop";
  return hasAnyTableForStreet(street);
}

// Hand count options removed — session runs until user views stats or ends

/** Look up the user-friendly label for an archetype ID */
function archetypeLabel(id: ArchetypeId): string {
  return ALL_ARCHETYPES.find((a) => a.id === id)?.label ?? id.replace(/_/g, " ");
}

/** Category display for an archetype ID */
function archetypeCategoryLabel(id: ArchetypeId): string {
  const cat = ALL_ARCHETYPES.find((a) => a.id === id)?.category;
  if (!cat) return "";
  return CATEGORY_LABELS[cat].replace(" Archetypes", "");
}

export type DrillMode = "learn" | "quiz";

// ═══════════════════════════════════════════════════════
// WORKSPACE SHELL
// ═══════════════════════════════════════════════════════

export interface DrillParams {
  archetype: ArchetypeId;
  hands?: number;
  mode?: DrillMode;
}

export interface VisionParams {
  deal: boolean;
  street?: "preflop" | "flop" | "turn" | "river";
  players?: number;
  dealer?: number;
  lenses?: string[];
}

interface WorkspaceShellProps {
  /** @deprecated Use initialSource instead */
  initialMode?: WorkspaceModeId;
  initialSource?: BoardSource;
  drillParams?: DrillParams;
  visionParams?: VisionParams;
}

const BOARD_SOURCES: { id: BoardSource; label: string }[] = [
  { id: "free_play", label: "Free Play" },
  { id: "archetype", label: "Archetype" },
  { id: "custom", label: "Custom" },
];

export function WorkspaceShell({ initialMode, initialSource, drillParams, visionParams }: WorkspaceShellProps) {
  // Map legacy mode to source for backward compat
  const resolvedSource: BoardSource = initialSource ?? (initialMode === "drill" ? "archetype" : "free_play");
  const [boardSource, setBoardSource] = useState<BoardSource>(resolvedSource);
  const mode = useMemo(() => buildMode(boardSource, { quiz: drillParams?.mode !== "learn" }), [boardSource, drillParams?.mode]);
  // Legacy compat — some components still check modeId
  const modeId: WorkspaceModeId = mode.id;
  const ws = useWorkspace(mode);
  const [guideOpen, setGuideOpen] = useState(false);
  const [drillGuideOpen, setDrillGuideOpen] = useState(false);
  const [tutorialArchetype, setTutorialArchetype] = useState<ArchetypeId | null>(null);
  const [replayRecord, setReplayRecord] = useState<HandRecord | null>(null);
  const [drillQuizMode, setDrillQuizMode] = useState<DrillMode>(drillParams?.mode ?? "quiz");
  const [showSessionStats, setShowSessionStats] = useState(false);

  // Auto-start drill from URL params
  const drillAutoStarted = useRef(false);
  const { startDrill } = ws;
  useEffect(() => {
    if (drillAutoStarted.current || !drillParams?.archetype) return;
    const entry = ALL_ARCHETYPES.find((a) => a.id === drillParams.archetype);
    if (!entry || !isArchetypeAvailable(entry)) return;
    drillAutoStarted.current = true;
    startDrill(drillParams.archetype, drillParams.hands ?? 10);
  }, [drillParams, startDrill]);

  // Auto-setup vision mode from URL params
  const visionAutoStarted = useRef(false);
  useEffect(() => {
    if (visionAutoStarted.current || !visionParams?.deal || boardSource === "archetype") return;
    visionAutoStarted.current = true;

    // Configure table before dealing
    if (visionParams.players) ws.setNumPlayers(visionParams.players);
    if (visionParams.dealer !== undefined) ws.moveDealer(visionParams.dealer);

    // Set active lenses if specified
    if (visionParams.lenses) {
      const desired = new Set(visionParams.lenses);
      // Toggle off defaults not in desired set, toggle on desired not in current
      for (const id of ws.activeLensIds) {
        if (!desired.has(id)) ws.toggleLens(id);
      }
      for (const id of desired) {
        if (!ws.activeLensIds.includes(id)) ws.toggleLens(id);
      }
    }

    // Deal hand — auto-play will advance through streets
    ws.startHand();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time auto-setup from URL params
  }, [visionParams, modeId]);

  // Expose audit export to browser console
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    w.__exportHandHistory = ws.exportHandHistory;
    w.__handHistory = ws.handHistory;
  }, [ws.exportHandHistory, ws.handHistory]);

  const heroStack = useMemo(() => {
    if (!ws.gameState) return 0;
    const hero = ws.seats.find((s) => s.isHero);
    return hero?.stack ?? 0;
  }, [ws.gameState, ws.seats]);

  const selectedSeatAnalysis = useMemo(() => {
    if (ws.selectedSeat === null) return undefined;
    const oppReadResult = ws.analysisResults.get("opponent-read");
    if (!oppReadResult) return undefined;
    const value = oppReadResult.value as OpponentReadValue;
    const seat = ws.seats.find((s) => s.seatIndex === ws.selectedSeat);
    if (!seat) return undefined;
    return value.opponents.find((o) => o.label === seat.label);
  }, [ws.selectedSeat, ws.seats, ws.analysisResults]);

  const selectedSeat = ws.selectedSeat !== null
    ? ws.seats.find((s) => s.seatIndex === ws.selectedSeat)
    : undefined;

  const cardGridMode = mapTargetToMode(ws.selectionTarget);

  const handleModeChange = useCallback(
    (selMode: SelectionMode) => {
      ws.setSelectionTarget(selMode === "hero" ? "hero" : selMode === "community" ? "community" : "hero");
    },
    [ws],
  );

  // ── Showdown result computation ──
  const showdownResult = useMemo(() => {
    if (!ws.isHandOver || !ws.gameState) return null;
    const gs = ws.gameState;
    const community = gs.communityCards;
    const inHand = gs.players.filter((p) => p.status === "active" || p.status === "all_in");

    if (inHand.length === 1) {
      const winner = inHand[0];
      const seat = ws.seats.find((s) => s.seatIndex === winner.seatIndex);
      return {
        type: "fold" as const,
        winnerSeatIndex: winner.seatIndex,
        winnerLabel: seat?.label ?? `Seat ${winner.seatIndex}`,
        winnerIsHero: seat?.isHero ?? false,
        potWon: gs.pot.total,
      };
    }

    if (community.length < 5) return null;

    const evaluations: {
      seatIndex: number; label: string; isHero: boolean;
      holeCards: CardIndex[]; evaluated: EvaluatedHand; status: string;
    }[] = [];

    for (const p of gs.players) {
      if (p.holeCards.length < 2) continue;
      const seat = ws.seats.find((s) => s.seatIndex === p.seatIndex);
      if (!seat) continue;
      const isInHand = p.status === "active" || p.status === "all_in";
      const isRevealed = p.cardVisibility !== "hidden";
      if (!isInHand && !isRevealed) continue;
      try {
        const evaluated = evaluateHand([...p.holeCards, ...community]);
        evaluations.push({
          seatIndex: p.seatIndex, label: seat.label, isHero: seat.isHero,
          holeCards: p.holeCards, evaluated, status: p.status,
        });
      } catch { /* skip */ }
    }

    if (evaluations.length === 0) return null;

    const inHandEvals = evaluations.filter((e) => e.status === "active" || e.status === "all_in");
    let bestEval = inHandEvals[0];
    for (const e of inHandEvals.slice(1)) {
      if (compareHandRanks(e.evaluated.rank, bestEval.evaluated.rank) > 0) bestEval = e;
    }

    // Detect split pot — all players tied with the best hand
    const winners = inHandEvals.filter(
      (e) => compareHandRanks(e.evaluated.rank, bestEval.evaluated.rank) === 0,
    );
    const isSplit = winners.length > 1;
    const heroInSplit = isSplit && winners.some((w) => w.isHero);

    return {
      type: isSplit ? "split" as const : "showdown" as const,
      winnerSeatIndex: bestEval.seatIndex,
      winnerLabel: isSplit
        ? winners.map((w) => w.label).join(" & ")
        : bestEval.label,
      winnerIsHero: isSplit ? heroInSplit : bestEval.isHero,
      winnerHand: bestEval.evaluated.rank.name,
      potWon: gs.pot.total,
      splitCount: isSplit ? winners.length : undefined,
      evaluations,
    };
  }, [ws.isHandOver, ws.gameState, ws.seats]);

  const handleSeatClick = (seatIndex: number) => {
    const seat = ws.seats.find((s) => s.seatIndex === seatIndex);
    if (seat?.isHero) return;
    ws.setSelectedSeat(ws.selectedSeat === seatIndex ? null : seatIndex);
  };

  // ── Drill: show solution based on mode ──
  const showDrillSolution = drillQuizMode === "learn" || ws.lastScore != null;
  // Archetype mode tracks session progress (hand count, scoring).
  // But ALL features are available in ALL modes — no isArchetypeSession gating.
  const isArchetypeSession = boardSource === "archetype" && (ws.isHandActive || ws.isHandOver);

  // ── Extract opponent story from coaching results (DRY — shared with coaching panel + opponent detail) ──
  const coachingOpponentStory = useMemo(() => {
    const cr = ws.analysisResults.get("coaching");
    if (!cr) return undefined;
    const cv = cr.visuals.find((v) => v.type === "coaching");
    if (!cv) return undefined;
    return (cv.data as { opponentStory?: import("../../../convex/lib/analysis/opponentStory").OpponentStory }).opponentStory;
  }, [ws.analysisResults]);

  // ── Action stories (computed here so both ActionPanel and CoachingSection can use them) ──
  const topLevelActionStories = useMemo(() => {
    const gs = ws.gameState;
    const heroCards = ws.seats.find(s => s.isHero)?.holeCards;
    if (!gs || !heroCards || heroCards.length < 2 || !ws.legalActions) return undefined;
    const handCat = categorizeHand(heroCards as CardIndex[], gs.communityCards);
    return buildActionStories(
      heroCards as CardIndex[],
      gs.communityCards,
      ws.legalActions,
      coachingOpponentStory,
      handCat,
      gs.currentStreet,
    );
  }, [ws.gameState, ws.seats, ws.legalActions, coachingOpponentStory]);

  // ── Layout ──
  const isTwoColumn = mode.layout === "two-column";

  return (
    <div className="min-h-[calc(100vh-65px)] felt-bg">
      <div className="max-w-[1600px] mx-auto px-4 py-4">
        {/* ── Board source selector ── */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex rounded-lg border border-[var(--border)] overflow-hidden">
            {BOARD_SOURCES.map(({ id, label }, i) => (
              <button
                key={id}
                onClick={() => setBoardSource(id)}
                className={cn(
                  "px-4 py-1.5 text-xs font-medium transition-colors",
                  i > 0 && "border-l border-[var(--border)]",
                  boardSource === id
                    ? "bg-[var(--gold)]/15 text-[var(--gold)]"
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className={cn(
          "grid gap-4",
          isTwoColumn
            ? "grid-cols-1 lg:grid-cols-[2fr_auto_1fr]"
            : "grid-cols-1 max-w-2xl mx-auto",
        )}>

          {/* ═══ LEFT COLUMN ═══ */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="space-y-4"
          >
            {replayRecord ? (
              <HandReplayer record={replayRecord} onClose={() => setReplayRecord(null)} />
            ) : (
            <>
              {/* ── Drill: Archetype selector / active / summary (TOP in drill mode) ── */}
              {mode.deal.archetypeSelector && (
                <>
                  {boardSource === "archetype" && !ws.isHandActive && !ws.isHandOver && (
                    <ArchetypeSelector
                      onStart={(id) => { setTutorialArchetype(null); setShowSessionStats(false); ws.startDrill(id); }}
                      drillMode={drillQuizMode}
                      onModeChange={setDrillQuizMode}
                      onOpenGuide={() => setDrillGuideOpen(true)}
                      onArchetypeSelect={setTutorialArchetype}
                    />
                  )}

                  {(ws.isHandActive || ws.isHandOver) && !showSessionStats && (
                    <ActiveDrill ws={ws} drillQuizMode={drillQuizMode}
                      onOpenGuide={() => setDrillGuideOpen(true)}
                      onViewStats={() => setShowSessionStats(true)} />
                  )}

                  {showSessionStats && (
                    <DrillSummary ws={ws} onNewDrill={() => { setShowSessionStats(false); ws.resetSession(); }} />
                  )}
                </>
              )}

              {/* ── Player list ── */}
              <PlayerList
                seats={ws.seats}
                selectedSeat={ws.selectedSeat}
                onSeatClick={handleSeatClick}
                bigBlind={ws.blinds.big}
                activePlayerSeat={ws.activePlayerSeat}
                decisions={ws.lastDecisions}
                onSetAllProfiles={mode.opponents.randomizable ? ws.setAllProfiles : undefined}
                onRandomizeProfiles={mode.opponents.randomizable ? ws.randomizeProfiles : undefined}
              />

              <>
              {/* ── Opponent detail panel ── */}
              <PanelWrapper enabled={true}>
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
                        decision={ws.lastDecisions.get(selectedSeat.seatIndex)}
                        onAssignProfile={(profile) => ws.assignProfile(selectedSeat.seatIndex, profile)}
                        onClose={() => ws.setSelectedSeat(null)}
                        onReveal={() => ws.revealVillainCards(selectedSeat.seatIndex)}
                        onHide={() => ws.hideVillainCards(selectedSeat.seatIndex)}
                        onStartCardAssign={() => ws.setSelectionTarget(`villain-${selectedSeat.seatIndex}`)}
                        selectionTarget={ws.selectionTarget}
                        villainCardBuffer={ws.villainCardBuffer.get(selectedSeat.seatIndex)}
                        readOnly={isArchetypeSession}
                        heroCards={ws.heroCards}
                        communityCards={ws.communityCards}
                        street={ws.street}
                        potBB={ws.pot.total}
                        precomputedStory={coachingOpponentStory}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </PanelWrapper>

              {/* ── Game setup panel ── */}
              <PanelWrapper enabled={mode.setup.enabled}>
                {!ws.isHandActive && !ws.isHandOver && (
                  <GameSetupPanel
                    blinds={ws.blinds}
                    startingStack={ws.startingStack}
                    onBlindsChange={ws.setBlinds}
                    onStackChange={ws.setStartingStack}
                    onStart={ws.startHand}
                  />
                )}
              </PanelWrapper>

              {/* ── Hand-over result ── */}
              <PanelWrapper enabled={mode.postHand.dealNext || mode.postHand.revealAll}>
                {!ws.isHandActive && ws.isHandOver && (
                  <HandOverPanel
                    ws={ws}
                    mode={mode}
                    showdownResult={showdownResult}
                    onReplay={(record) => setReplayRecord(record)}
                    boardSource={boardSource}
                  />
                )}
              </PanelWrapper>

              {/* ── Board display ── */}
              <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
                {/* Board header */}
                <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[var(--border)] bg-[var(--muted)]/20">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-1">
                      {(["preflop", "flop", "turn", "river"] as const).map((s) => (
                        <span
                          key={s}
                          className={cn(
                            "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full transition-colors",
                            s === ws.street
                              ? "bg-[var(--felt)] text-[var(--gold)] border border-[var(--gold-dim)]/40"
                              : "text-[var(--muted-foreground)]/50",
                          )}
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                    <div className="h-4 w-px bg-[var(--border)]" />
                    <PanelWrapper enabled={mode.setup.enabled}>
                      <TableControls
                        numPlayers={ws.numPlayers}
                        onNumPlayersChange={ws.setNumPlayers}
                        onRotateDealer={() => ws.moveDealer(ws.dealerSeatIndex + 1)}
                        onReset={ws.newHand}
                        isHandActive={ws.isHandActive}
                      />
                    </PanelWrapper>
                  </div>
                  <button
                    onClick={() => setGuideOpen(true)}
                    className="w-7 h-7 rounded-full border border-[var(--border)] bg-[var(--muted)]/40 text-[var(--muted-foreground)] hover:text-[var(--gold)] hover:border-[var(--gold-dim)]/40 transition-colors flex items-center justify-center text-xs font-bold shrink-0"
                    title="How to use"
                  >
                    ?
                  </button>
                </div>

                <div className="p-4 relative">
                  {ws.isHandActive && ws.pot.total > 0 && (
                    <div className="absolute top-2 left-3">
                      <PotDisplay pot={ws.pot} blinds={ws.blinds} />
                    </div>
                  )}
                  <BoardDisplay
                    heroCards={ws.heroCards}
                    communityCards={ws.communityCards}
                    onCardClick={() => {}}
                  />

                  {/* Action buttons with integrated narratives */}
                  {ws.isHeroTurn && ws.legalActions && (
                    <div className="mt-4">
                      <ActionPanel
                        legalActions={ws.legalActions}
                        pot={ws.pot}
                        heroStack={heroStack}
                        blinds={ws.blinds}
                        onAct={ws.act}
                        actionStories={topLevelActionStories}
                      />
                    </div>
                  )}
                </div>
              </div>
              </>

              {/* ── Hand Grid (13x13) ── */}
              {ws.heroCards.length >= 2 && (
                <HandGrid heroCards={ws.heroCards} communityCards={ws.communityCards} />
              )}

              {/* ── Coaching + Solution (unified in drill mode) ── */}
              <CoachingSection
                results={ws.analysisResults}
                drillSolution={showDrillSolution && ws.drillSolution ? ws.drillSolution : undefined}
                drillScore={ws.isHeroTurn ? undefined : (ws.lastScore ?? undefined)}
                isDrill={true} /* converged: scoring always available */
                gameState={ws.gameState}
                heroSeatIndex={ws.heroSeatIndex}
                onArchetypeClick={setTutorialArchetype}
                legalActions={ws.legalActions}
                heroCards={ws.heroCards}
              />

              {/* ── Score feedback + next hand ── */}
              {ws.lastScore != null && ws.lastScore && (
                <ScoreDisplay
                  score={ws.lastScore}
                />
              )}

              {/* ── Narrative feedback (quiz mode, after acting) ── */}
              {ws.lastScore != null && drillQuizMode === "quiz" && ws.lastScore && ws.drillSolution && (
                <NarrativeFeedbackDisplay
                  userAction={ws.lastScore.userAction}
                  narrativeChoice={ws.drillNarrativeChoice}
                  optimalAction={ws.drillSolution.optimalAction}
                  optimalFrequency={ws.drillSolution.optimalFrequency}
                  frequencies={ws.drillSolution.frequencies}
                  archetypeId={ws.drillArchetypeId ?? undefined}
                />
              )}

              {/* ── Card selector (52-card grid) ── */}
              <PanelWrapper enabled={true}>
                <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-3">
                  <CardSelector
                    cards={ws.deckVisionCards}
                    usedCards={ws.allUsedCards}
                    selectionMode={cardGridMode}
                    onCardClick={ws.toggleCard}
                    onModeChange={handleModeChange}
                    readOnly={isArchetypeSession || (!ws.isHandActive && !ws.isHandOver)}
                  />
                </div>
              </PanelWrapper>

              {/* Drill preview removed — mode toggle at top replaces it */}
            </>
            )}
          </motion.div>

          {/* ═══ CENTER DIVIDER ═══ */}
          {isTwoColumn && <div className="hidden lg:block w-px bg-[var(--border)]" />}

          {/* ═══ RIGHT COLUMN (analysis) ═══ */}
          {isTwoColumn && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="space-y-4"
            >
              <PanelWrapper enabled={mode.analysis.enabled}>
                {/* Analysis header */}
                <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
                  <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--gold-dim)] shrink-0">
                      Analysis
                    </h2>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setGuideOpen(true)}
                        className="w-6 h-6 rounded-full border border-[var(--border)] bg-[var(--muted)]/40 text-[var(--muted-foreground)] hover:text-[var(--gold)] hover:border-[var(--gold-dim)]/40 transition-colors flex items-center justify-center text-[10px] font-bold shrink-0"
                        title="How to use"
                      >
                        ?
                      </button>
                    </div>
                  </div>
                  <PanelWrapper enabled={mode.analysis.lensSelector}>
                    <div className="px-3 pb-2.5">
                      <LensSelector
                        availableLenses={ws.availableLenses}
                        activeLensIds={ws.activeLensIds}
                        onToggle={ws.toggleLens}
                      />
                    </div>
                  </PanelWrapper>
                </div>

                {ws.heroCards.length < 2 ? (
                  <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6 text-center mt-4">
                    <p className="text-lg font-medium text-[var(--muted-foreground)]">
                      Deal a hand to begin
                    </p>
                    <p className="text-sm text-[var(--muted-foreground)]/60 mt-1">
                      Configure settings above and click Deal Hand
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 mt-4">
                    <AnalysisPanels ws={ws} />
                  </div>
                )}
              </PanelWrapper>
            </motion.div>
          )}
        </div>
      </div>

      {/* Guide drawers */}
      <GuideDrawer open={guideOpen} onClose={() => setGuideOpen(false)} />
      <DrillGuideDrawer open={drillGuideOpen} onClose={() => setDrillGuideOpen(false)} />
      <ArchetypeTutorialDrawer
        open={!!tutorialArchetype}
        archetypeId={tutorialArchetype}
        label={tutorialArchetype ? archetypeLabel(tutorialArchetype) : undefined}
        category={tutorialArchetype ? ALL_ARCHETYPES.find((a) => a.id === tutorialArchetype)?.category : undefined}
        onClose={() => setTutorialArchetype(null)}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// SUB-COMPONENTS (extracted for readability)
// ═══════════════════════════════════════════════════════

/** Coaching panel — unified with drill solution in drill mode */
function CoachingSection({ results, drillSolution, drillScore, isDrill, gameState, heroSeatIndex, onArchetypeClick, legalActions, heroCards }: {
  results: Map<string, import("../../../convex/lib/types/analysis").AnalysisResult>;
  drillSolution?: import("@/hooks/use-workspace").SpotSolution;
  drillScore?: import("../../../convex/lib/gto/evScoring").ActionScore | null;
  isDrill?: boolean;
  gameState?: import("../../../convex/lib/state/gameState").GameState | null;
  heroSeatIndex?: number;
  onArchetypeClick?: (id: ArchetypeId) => void;
  legalActions?: import("../../../convex/lib/state/gameState").LegalActions | null;
  heroCards?: import("../../../convex/lib/types/cards").CardIndex[];
}) {
  const coachingResult = results.get("coaching");
  if (!coachingResult || coachingResult.visuals.length === 0) return null;
  const coachingVisual = coachingResult.visuals.find((v) => v.type === "coaching");
  if (!coachingVisual) return null;
  const { advices, opponentStory } = coachingVisual.data as {
    advices: CoachingAdvice[];
    opponentStory?: import("../../../convex/lib/analysis/opponentStory").OpponentStory;
  };
  if (!advices || advices.length === 0) return null;

  // ── Cached computations (each computed ONCE per decision point) ──

  // 1. Archetype — classify the current spot
  const archetype = useMemo<ArchetypeClassification | null>(() => {
    if (!gameState || heroSeatIndex === undefined) return null;
    return classifyArchetype(contextFromGameState(gameState, heroSeatIndex));
  }, [gameState, heroSeatIndex]);

  // 2. Hand category — assess hero's hand
  const handCat = useMemo(() => {
    if (!heroCards || heroCards.length < 2 || !gameState) return undefined;
    return categorizeHand(heroCards, gameState.communityCards);
  }, [heroCards, gameState]);

  // 3. Action stories — what each action tells opponents
  const actionStories = useMemo(() => {
    if (!legalActions || !gameState || !heroCards || heroCards.length < 2 || !handCat) return undefined;
    return buildActionStories(
      heroCards,
      gameState.communityCards,
      legalActions,
      opponentStory,
      handCat,
      gameState.currentStreet,
    );
  }, [legalActions, gameState, heroCards, opponentStory, handCat]);

  // 4. Hand commentary — the coach's voice (composes everything above)
  const commentary = useMemo(() => {
    if (!gameState || !heroCards || heroCards.length < 2 || heroSeatIndex === undefined || !legalActions) return undefined;
    const gtoAdvice = advices.find((a: CoachingAdvice) => a.profileId === "gto");
    return commentateHand({
      heroCards,
      communityCards: gameState.communityCards,
      gameState,
      heroSeat: heroSeatIndex,
      legal: legalActions,
      handCat,
      archetype: archetype ?? undefined,
      opponentStories: opponentStory ? [opponentStory] : undefined,
      actionStories,
      gtoFrequencies: gtoAdvice?.solverData?.frequencies,
      gtoOptimalAction: gtoAdvice?.solverData?.optimalAction,
    });
  }, [gameState, heroCards, heroSeatIndex, legalActions, handCat, archetype, opponentStory, actionStories, advices]);

  return (
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
      <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--muted)]/30">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--gold-dim)]">
          Coaching
        </h3>
      </div>
      {/* Hand Commentary — the coach's voice */}
      {commentary && (
        <div className="px-4 py-3 border-b border-[var(--border)]/50">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--gold)]">
              Coach
            </span>
            <span className={cn(
              "text-[9px] px-1.5 py-0.5 rounded",
              commentary.confidence === "clear" ? "bg-green-500/15 text-green-400" :
              commentary.confidence === "leaning" ? "bg-yellow-500/15 text-yellow-400" :
              "bg-orange-500/15 text-orange-400",
            )}>
              {commentary.confidence === "clear" ? "Clear" : commentary.confidence === "leaning" ? "Leaning" : "Close spot"}
            </span>
          </div>
          <p className="text-[11px] text-[var(--foreground)]/80 leading-relaxed">
            {commentary.narrative}
          </p>
        </div>
      )}
      <div className="px-4 py-3">
        <CoachingPanel
          advices={advices}
          drillSolution={drillSolution}
          drillScore={drillScore}
          autoExpandGto={isDrill}
          archetype={archetype}
          onArchetypeClick={onArchetypeClick}
          archetypeLabel={archetypeLabel}
          opponentStory={opponentStory}
          actionStories={actionStories}
        />
      </div>
    </div>
  );
}

/** Analysis lens panels */
function AnalysisPanels({ ws }: { ws: WorkspaceState }) {
  return (
    <>
      {ws.activeLensIds.map((lensId) => {
        if (lensId === "coaching") return null;
        const lensName = ws.availableLenses.find((l) => l.id === lensId)?.name ?? lensId;
        const result = ws.analysisResults.get(lensId);
        const isComputing = ws.heavyComputing.has(lensId);

        if (isComputing && !result) {
          return (
            <motion.div key={lensId} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
              <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--muted)]/30">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--gold-dim)]">{lensName}</h3>
              </div>
              <div className="p-4 flex items-center gap-3">
                <div className="h-4 w-4 rounded-full border-2 border-[var(--gold-dim)] border-t-transparent animate-spin" />
                <span className="text-sm text-[var(--muted-foreground)]">Calculating...</span>
              </div>
            </motion.div>
          );
        }

        if (!result) return null;
        if (result.visuals.length === 0 && !result.explanation.summary) return null;

        return (
          <motion.div key={lensId} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
            <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--muted)]/30">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--gold-dim)]">{lensName}</h3>
            </div>
            <div className="p-4 space-y-3">
              <VisualRenderer results={new Map([[lensId, result]])} street={ws.street} />
              {!(lensId === "coaching" && result.visuals.length > 0) && (
                <div className="border-t border-[var(--border)] pt-3">
                  <ExplanationTree node={result.explanation} defaultOpen={lensId !== "threats" && lensId !== "outs"} />
                </div>
              )}
            </div>
          </motion.div>
        );
      })}
    </>
  );
}

/** Hand-over panel with showdown results and action buttons */
function HandOverPanel({
  ws,
  mode,
  showdownResult,
  onReplay,
  boardSource,
}: {
  ws: WorkspaceState;
  mode: WorkspaceMode;
  showdownResult: ReturnType<typeof Object> | null;
  boardSource: BoardSource;
  onReplay: (record: HandRecord) => void;
}) {
  // Type the showdown result properly
  const result = showdownResult as {
    type: "fold" | "showdown" | "split";
    winnerSeatIndex: number;
    winnerLabel: string;
    winnerIsHero: boolean;
    potWon: number;
    winnerHand?: string;
    splitCount?: number;
    evaluations?: {
      seatIndex: number; label: string; isHero: boolean;
      holeCards: CardIndex[]; evaluated: EvaluatedHand; status: string;
    }[];
  } | null;

  return (
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
      {/* Winner banner */}
      {result && (
        <div className={cn(
          "px-4 py-3 text-center border-b border-[var(--border)]",
          result.type === "split" ? "bg-blue-500/10"
            : result.winnerIsHero ? "bg-[var(--gold)]/15"
            : "bg-red-500/10",
        )}>
          <div className="flex items-center justify-center gap-2">
            {result.type === "split"
              ? <TrophyIcon className="text-blue-400" />
              : result.winnerIsHero ? <TrophyIcon className="text-[var(--gold)]" /> : <DefeatIcon className="text-red-400" />}
            <span className={cn(
              "text-sm font-bold uppercase tracking-wider",
              result.type === "split" ? "text-blue-400"
                : result.winnerIsHero ? "text-[var(--gold)]"
                : "text-red-400",
            )}>
              {result.type === "split"
                ? `Split Pot — ${result.winnerLabel}`
                : result.winnerIsHero ? "You Win!" : `${result.winnerLabel} Wins`}
            </span>
            {result.type === "split"
              ? <TrophyIcon className="text-blue-400" />
              : result.winnerIsHero ? <TrophyIcon className="text-[var(--gold)]" /> : <DefeatIcon className="text-red-400" />}
          </div>
          <p className="text-xs text-[var(--muted-foreground)] mt-1">
            {result.type === "fold" ? "All opponents folded"
              : result.type === "split" ? `${result.winnerHand} — each gets ${(result.potWon / (result.splitCount ?? 2) / ws.blinds.big).toFixed(1)} BB`
              : result.winnerHand}
            {result.type !== "split" && ` · ${(result.potWon / ws.blinds.big).toFixed(1)} BB pot`}
          </p>
        </div>
      )}

      {!result && (
        <div className="px-4 py-3 text-center border-b border-[var(--border)]">
          <p className="text-sm font-bold text-[var(--gold)] uppercase tracking-wider">Hand Complete</p>
          <p className="text-xs text-[var(--muted-foreground)] mt-1">
            Final pot: {(ws.pot.total / ws.blinds.big).toFixed(1)} BB
          </p>
        </div>
      )}

      {/* Evaluations list */}
      {result?.type === "showdown" && result.evaluations && result.evaluations.length > 0 && (
        <div className="px-4 py-3 space-y-2">
          {result.evaluations
            .sort((a, b) => compareHandRanks(b.evaluated.rank, a.evaluated.rank))
            .map((e) => {
              const isWinner = e.seatIndex === result.winnerSeatIndex;
              const isFolded = e.status === "folded";
              return (
                <div key={e.seatIndex} className={cn(
                  "flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors",
                  isWinner ? "bg-[var(--gold)]/10 ring-1 ring-[var(--gold)]/40" : "bg-[var(--muted)]/20",
                )}>
                  <span className="w-4 flex items-center justify-center">
                    {isWinner && !isFolded && <CrownIcon className="text-[var(--gold)]" />}
                  </span>
                  <span className={cn("font-semibold min-w-[40px]", e.isHero ? "text-[var(--gold)]" : "text-[var(--foreground)]")}>
                    {e.label}
                  </span>
                  <span className="inline-flex gap-1">
                    {e.holeCards.map((c) => (
                      <span key={c} className={`font-mono font-bold px-1.5 py-0.5 rounded bg-white/90 ${suitColor(c)}`}>
                        {cardLabel(c)}
                      </span>
                    ))}
                  </span>
                  <span className={cn("text-[11px] font-medium", isWinner ? "text-[var(--gold)]" : "text-[var(--muted-foreground)]")}>
                    {e.evaluated.rank.name}
                  </span>
                  {isFolded && <span className="text-[9px] text-[var(--muted-foreground)] ml-auto">folded</span>}
                </div>
              );
            })}
        </div>
      )}

      {result?.type === "fold" && (
        <div className="px-4 py-3">
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-[var(--gold)]/10 ring-1 ring-[var(--gold)]/40 text-xs">
            <CrownIcon className="text-[var(--gold)]" />
            <span className={cn("font-semibold", result.winnerIsHero ? "text-[var(--gold)]" : "text-[var(--foreground)]")}>
              {result.winnerLabel}
            </span>
            <span className="text-[var(--muted-foreground)]">
              wins {(result.potWon / ws.blinds.big).toFixed(1)} BB uncontested
            </span>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="px-4 py-3 flex items-center justify-center gap-2 border-t border-[var(--border)]">
        {mode.postHand.revealAll && (
          <button onClick={ws.revealAllVillains}
            className="text-[10px] px-3 py-1.5 rounded border border-[var(--gold-dim)]/30 text-[var(--gold-dim)] hover:bg-[var(--gold)]/10 transition-colors">
            Reveal All
          </button>
        )}
        {mode.postHand.replay && ws.handHistory.length > 0 && (
          <button onClick={() => onReplay(ws.handHistory[ws.handHistory.length - 1])}
            className="text-[10px] px-3 py-1.5 rounded border border-blue-400/30 text-blue-400 hover:bg-blue-400/10 transition-colors">
            Replay
          </button>
        )}
        {mode.postHand.dealNext && (
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            onClick={boardSource === "archetype" ? ws.drillNextHand : ws.startNextHand}
            className="px-5 py-2 rounded-lg bg-[var(--felt)] text-[var(--gold)] font-semibold text-sm border border-[var(--gold-dim)]/40 hover:border-[var(--gold)]/60 transition-colors">
            Deal Next Hand
          </motion.button>
        )}
        {mode.postHand.dealNext && (
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            onClick={() => { ws.newHand(); ws.startHand(); }}
            className="px-5 py-2 rounded-lg bg-[var(--card)] text-[var(--muted-foreground)] text-sm border border-[var(--border)] hover:border-[var(--gold-dim)]/40 hover:text-[var(--gold-dim)] transition-colors">
            Deal Fresh
          </motion.button>
        )}
      </div>
    </div>
  );
}

/** Archetype selector for drill mode */
function ArchetypeSelector({
  onStart,
  drillMode,
  onModeChange,
  onOpenGuide,
  onArchetypeSelect,
}: {
  onStart: (id: ArchetypeId | typeof INTERLEAVED_SENTINEL) => void;
  drillMode: DrillMode;
  onModeChange: (mode: DrillMode) => void;
  onOpenGuide: () => void;
  onArchetypeSelect?: (id: ArchetypeId) => void;
}) {
  const [selected, setSelected] = useState<ArchetypeId | typeof INTERLEAVED_SENTINEL | null>(null);
  const categories: ArchetypeCategory[] = ["preflop", "flop_texture", "postflop_principle"];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold text-[var(--foreground)]">GTO Drill Mode</h2>
          <p className="text-xs text-[var(--muted-foreground)] mt-1">
            Practice GTO decisions against solver-computed archetypes. Select an archetype to begin.
          </p>
        </div>
        <button onClick={onOpenGuide}
          className="w-7 h-7 rounded-full border border-[var(--border)] flex items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--gold)] hover:border-[var(--gold-dim)] transition-colors shrink-0"
          title="How to use Drill Mode">
          <span className="text-xs font-bold">?</span>
        </button>
      </div>

      {/* Interleaved option */}
      <button
        onClick={() => setSelected(INTERLEAVED_SENTINEL)}
        className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-all ${
          selected === INTERLEAVED_SENTINEL
            ? "border-[var(--gold)] bg-[var(--gold)]/10 text-[var(--gold)]"
            : "border-[var(--border)] text-[var(--foreground)] hover:border-[var(--gold-dim)]"
        }`}
      >
        <span className="font-semibold">Mixed / Interleaved</span>
        <span className="block text-[10px] text-[var(--muted-foreground)] mt-0.5">
          Random archetypes each hand — best for long-term learning
        </span>
      </button>

      {categories.map((cat) => (
        <div key={cat} className="space-y-2">
          <h3 className="text-[11px] font-medium uppercase tracking-widest text-[var(--muted-foreground)]">
            {CATEGORY_LABELS[cat]}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {ALL_ARCHETYPES.filter((a) => a.category === cat).map((arch) => {
              const available = isArchetypeAvailable(arch);
              const isSelected = selected === arch.id;
              return (
                <button key={arch.id} onClick={() => { if (available) { setSelected(arch.id); onArchetypeSelect?.(arch.id); } }} disabled={!available}
                  className={`text-left px-3 py-2 rounded-lg border text-xs transition-all
                    ${isSelected ? "border-[var(--gold)] bg-[var(--gold)]/10 text-[var(--gold)]"
                      : available ? "border-[var(--border)] text-[var(--foreground)] hover:border-[var(--gold-dim)]"
                      : "border-[var(--border)]/40 text-[var(--muted-foreground)]/40 cursor-not-allowed"}`}>
                  {arch.label}
                  {!available && <span className="block text-[9px] mt-0.5 opacity-50">Coming soon</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className="flex items-center gap-3 pt-2 flex-wrap">
        <div className="flex-1" />
        <button disabled={!selected} onClick={() => { if (selected) onStart(selected); }}
          className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${selected ? "bg-[var(--gold)] text-black hover:bg-[var(--gold)]/90 cursor-pointer" : "bg-[var(--muted)] text-[var(--muted-foreground)] cursor-not-allowed"}`}>
          Start
        </button>
      </div>
    </div>
  );
}

/** Active drill with progress, game viewer, solution */
function ActiveDrill({
  ws,
  drillQuizMode,
  onOpenGuide,
  onViewStats,
}: {
  ws: WorkspaceState;
  drillQuizMode: DrillMode;
  onOpenGuide: () => void;
  onViewStats: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {/* Header — archetype + running tally */}
        {ws.drillArchetypeId && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-[var(--foreground)]">
                {ws.drillIsInterleaved ? "Mixed" : archetypeLabel(ws.drillArchetypeId)}
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--gold)]/10 text-[var(--gold)] border border-[var(--gold)]/20 font-medium">
                {ws.drillIsInterleaved ? archetypeLabel(ws.drillArchetypeId) : archetypeCategoryLabel(ws.drillArchetypeId)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {/* Running tally */}
              {ws.sessionHands > 0 && (
                <span className="text-[10px] text-[var(--muted-foreground)] tabular-nums">
                  {ws.sessionHands} hands · {ws.sessionProgress.optimal}✓ {ws.sessionProgress.mistake + ws.sessionProgress.blunder > 0 ? `${ws.sessionProgress.mistake + ws.sessionProgress.blunder}✗` : ""}
                </span>
              )}
              {ws.sessionHands > 0 && (
                <button onClick={onViewStats}
                  className="px-2 py-0.5 rounded border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--gold)] hover:border-[var(--gold-dim)] transition-colors"
                  title="View session stats">
                  <span className="text-[9px] font-medium">Stats</span>
                </button>
              )}
              <button onClick={ws.resetSession}
                className="px-2 py-0.5 rounded border border-[var(--border)] text-[var(--muted-foreground)] hover:text-red-400 hover:border-red-400/40 transition-colors"
                title="End session">
                <span className="text-[9px] font-medium">End</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Board narrative — sets the scene for the decision */}
      {ws.drillCurrentDeal && (
        <NarrativeBoardContext
          archetype={ws.drillCurrentDeal.archetype}
          handCategory={ws.drillCurrentDeal.handCategory}
          communityCards={ws.drillCurrentDeal.communityCards}
          isInPosition={ws.drillCurrentDeal.isInPosition}
          drillMode={drillQuizMode}
        />
      )}

      {ws.isHandActive && !ws.isHeroTurn && ws.drillCurrentDeal && ws.heroCards.length === 0 && (
        <div className="text-center text-xs text-[var(--muted-foreground)] py-4">Dealing...</div>
      )}
    </div>
  );
}

/** Drill summary screen */
function DrillSummary({ ws, onNewDrill }: { ws: WorkspaceState; onNewDrill: () => void }) {
  const { sessionProgress: progress, sessionScores: scores } = ws;
  const total = scores.length;
  const avgEvLoss = total > 0 ? scores.reduce((sum, s) => sum + s.evLoss, 0) / total : 0;

  const verdicts = [
    { key: "Optimal", count: progress.optimal, color: "text-green-400" },
    { key: "Acceptable", count: progress.acceptable, color: "text-yellow-400" },
    { key: "Mistake", count: progress.mistake, color: "text-orange-400" },
    { key: "Blunder", count: progress.blunder, color: "text-red-400" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-[var(--foreground)]">Drill Complete</h2>
        {ws.drillArchetypeId && (
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-sm font-semibold text-[var(--gold)]">
              {archetypeLabel(ws.drillArchetypeId)}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--gold)]/10 text-[var(--gold)]/70 border border-[var(--gold)]/20">
              {archetypeCategoryLabel(ws.drillArchetypeId)}
            </span>
          </div>
        )}
        <p className="text-xs text-[var(--muted-foreground)] mt-1">
          {total} hands played — average EV loss: {avgEvLoss.toFixed(1)} BB
        </p>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {verdicts.map((v) => (
          <div key={v.key} className="text-center rounded-lg border border-[var(--border)] p-3">
            <div className={`text-2xl font-bold ${v.color}`}>{v.count}</div>
            <div className="text-[10px] text-[var(--muted-foreground)] mt-0.5">{v.key}</div>
          </div>
        ))}
      </div>
      {total > 0 && (
        <div className="space-y-1">
          <span className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">Accuracy</span>
          <div className="h-3 rounded-full overflow-hidden flex">
            {progress.optimal > 0 && <div className="bg-green-500 h-full" style={{ width: `${(progress.optimal / total) * 100}%` }} />}
            {progress.acceptable > 0 && <div className="bg-yellow-500 h-full" style={{ width: `${(progress.acceptable / total) * 100}%` }} />}
            {progress.mistake > 0 && <div className="bg-orange-500 h-full" style={{ width: `${(progress.mistake / total) * 100}%` }} />}
            {progress.blunder > 0 && <div className="bg-red-500 h-full" style={{ width: `${(progress.blunder / total) * 100}%` }} />}
          </div>
          <div className="text-xs text-[var(--muted-foreground)]">
            {((progress.optimal + progress.acceptable) / total * 100).toFixed(0)}% GTO-aligned
          </div>
        </div>
      )}
      {/* Narrative insights */}
      {total > 0 && (() => {
        const summary = buildNarrativeSummary(
          scores,
          [],
          ws.drillArchetypeId ?? undefined,
        );
        return (
          <div className="space-y-2">
            <span className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
              Insights
            </span>
            {summary.insights.map((insight, i) => (
              <div
                key={i}
                className={`border-l-2 pl-3 py-1 ${
                  insight.type === "strength"
                    ? "border-green-500/50"
                    : insight.type === "weakness"
                    ? "border-orange-500/50"
                    : "border-[var(--border)]"
                }`}
              >
                <p className="text-xs text-[var(--foreground)] leading-relaxed">
                  {insight.summary}
                </p>
                {insight.principle && (
                  <p className="text-[10px] text-[var(--muted-foreground)] italic mt-0.5">
                    {insight.principle}
                  </p>
                )}
              </div>
            ))}
          </div>
        );
      })()}

      <button onClick={onNewDrill}
        className="w-full py-2.5 rounded-lg bg-[var(--gold)] text-black font-semibold text-sm hover:bg-[var(--gold)]/90 transition-colors">
        New Drill
      </button>
    </div>
  );
}
