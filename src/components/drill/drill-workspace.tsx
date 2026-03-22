"use client";

/**
 * DrillWorkspace — composed drill page with three layout phases.
 *
 * - Selector (idle): archetype grid, hand count picker, start button
 * - Active (dealing/ready/acted): progress bar, HandStateViewer, solution + action panel
 * - Summary: aggregate stats, per-verdict breakdown, "New Drill" button
 *
 * The solution (frequencies, explanation, accuracy) is always available
 * during "ready" and "acted" phases. The UI decides what to reveal based
 * on drill mode (learn vs quiz).
 */
import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ArchetypeId, ArchetypeCategory } from "../../../convex/lib/gto/archetypeClassifier";
import { hasTable, hasAnyTableForStreet } from "../../../convex/lib/gto/tables/tableRegistry";
import { useDrillSession, type OnSessionComplete } from "@/hooks/use-drill-session";
import { useConvexAuth } from "convex/react";
// NOTE: useMutation + api imports enabled after `npx convex dev` regenerates types
// import { useMutation } from "convex/react";
// import { api } from "../../../convex/_generated/api";
import { HandStateViewer } from "../replay/hand-state-viewer";
import { DrillActionPanel } from "./drill-action-panel";
import { ScoreDisplay } from "./score-display";
import { SolutionDisplay } from "./solution-display";
import { DrillGuideDrawer } from "./drill-guide-drawer";
import { NarrativeBoardContext } from "./narrative-board-context";
import { NarrativePrompt } from "./narrative-prompt";
import { NarrativeFeedbackDisplay } from "./narrative-feedback";
import { buildNarrativeSummary } from "../../../convex/lib/gto/narrativeSummary";

// ═══════════════════════════════════════════════════════
// ARCHETYPE DEFINITIONS
// ═══════════════════════════════════════════════════════

interface ArchetypeEntry {
  id: ArchetypeId;
  label: string;
  category: ArchetypeCategory;
}

const ALL_ARCHETYPES: ArchetypeEntry[] = [
  // Preflop
  { id: "rfi_opening", label: "RFI Opening", category: "preflop" },
  { id: "bb_defense_vs_rfi", label: "BB Defense", category: "preflop" },
  { id: "three_bet_pots", label: "3-Bet Pots", category: "preflop" },
  { id: "blind_vs_blind", label: "Blind vs Blind", category: "preflop" },
  { id: "four_bet_five_bet", label: "4-Bet / 5-Bet", category: "preflop" },
  // Flop textures
  { id: "ace_high_dry_rainbow", label: "Ace-High Dry", category: "flop_texture" },
  { id: "kq_high_dry_rainbow", label: "K/Q-High Dry", category: "flop_texture" },
  { id: "mid_low_dry_rainbow", label: "Mid/Low Dry", category: "flop_texture" },
  { id: "paired_boards", label: "Paired Board", category: "flop_texture" },
  { id: "two_tone_disconnected", label: "Two-Tone Disco", category: "flop_texture" },
  { id: "two_tone_connected", label: "Two-Tone Conn", category: "flop_texture" },
  { id: "monotone", label: "Monotone", category: "flop_texture" },
  { id: "rainbow_connected", label: "Rainbow Conn", category: "flop_texture" },
  // Postflop principles
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
  // Postflop principles use texture tables — check if any exist for the needed street
  const street = POSTFLOP_STREET[arch.id] ?? "flop";
  return hasAnyTableForStreet(street);
}

const HAND_COUNT_OPTIONS = [5, 10, 20];

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
// COMPONENT
// ═══════════════════════════════════════════════════════

export function DrillWorkspace() {
  const { isAuthenticated } = useConvexAuth();

  // Persistence callback — saves to Convex when session completes.
  // NOTE: Convex mutations will be wired after `npx convex dev` regenerates types.
  // For now, the callback structure is in place but mutations are no-ops.
  const handleSessionComplete: OnSessionComplete = useCallback(
    ({ archetypeId, scores, handsPlayed, startTime }) => {
      if (!isAuthenticated) return;

      const _duration = Date.now() - startTime;
      const _optimal = scores.filter((s) => s.verdict === "optimal").length;
      const _acceptable = scores.filter((s) => s.verdict === "acceptable").length;
      const _accuracy = handsPlayed > 0 ? (_optimal + _acceptable) / handsPlayed : 0;

      // TODO: Wire Convex mutations after `npx convex dev`:
      // saveSession({ archetypeId, handsPlayed, accuracy, avgEvLoss, verdicts, duration })
      // saveResult({ ... }) for each score
      // updateSkills({ results: scores.map(s => ({ archetypeId, verdict: s.verdict })) })
      console.log(`[Training] Session complete: ${archetypeId}, ${handsPlayed} hands, ${(_accuracy * 100).toFixed(0)}% accuracy`);
    },
    [isAuthenticated],
  );

  const drill = useDrillSession(handleSessionComplete);
  const [drillMode, setDrillMode] = useState<DrillMode>("quiz");
  const [guideOpen, setGuideOpen] = useState(false);

  return (
    <div className="w-full max-w-2xl mx-auto p-4 space-y-4">
      <AnimatePresence mode="wait">
        {drill.phase === "idle" ? (
          <motion.div key="selector" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ArchetypeSelector
              onStart={drill.startDrill}
              drillMode={drillMode}
              onModeChange={setDrillMode}
              onOpenGuide={() => setGuideOpen(true)}
            />
          </motion.div>
        ) : drill.phase === "summary" ? (
          <motion.div key="summary" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <DrillSummary drill={drill} onNewDrill={drill.resetDrill} />
          </motion.div>
        ) : (
          <motion.div key="active" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ActiveDrill drill={drill} drillMode={drillMode} onOpenGuide={() => setGuideOpen(true)} />
          </motion.div>
        )}
      </AnimatePresence>

      <DrillGuideDrawer open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// SELECTOR
// ═══════════════════════════════════════════════════════

function ArchetypeSelector({
  onStart,
  drillMode,
  onModeChange,
  onOpenGuide,
}: {
  onStart: (id: ArchetypeId, count?: number) => void;
  drillMode: DrillMode;
  onModeChange: (mode: DrillMode) => void;
  onOpenGuide: () => void;
}) {
  const [selected, setSelected] = useState<ArchetypeId | null>(null);
  const [handCount, setHandCount] = useState(10);

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
        <button
          onClick={onOpenGuide}
          className="w-7 h-7 rounded-full border border-[var(--border)] flex items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--gold)] hover:border-[var(--gold-dim)] transition-colors shrink-0"
          title="How to use Drill Mode"
        >
          <span className="text-xs font-bold">?</span>
        </button>
      </div>

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
                <button
                  key={arch.id}
                  onClick={() => available && setSelected(arch.id)}
                  disabled={!available}
                  className={`
                    text-left px-3 py-2 rounded-lg border text-xs transition-all
                    ${isSelected
                      ? "border-[var(--gold)] bg-[var(--gold)]/10 text-[var(--gold)]"
                      : available
                        ? "border-[var(--border)] text-[var(--foreground)] hover:border-[var(--gold-dim)]"
                        : "border-[var(--border)]/40 text-[var(--muted-foreground)]/40 cursor-not-allowed"
                    }
                  `}
                >
                  {arch.label}
                  {!available && (
                    <span className="block text-[9px] mt-0.5 opacity-50">Coming soon</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* Mode toggle + hand count + start */}
      <div className="flex items-center gap-3 pt-2 flex-wrap">
        {/* Learn / Quiz toggle */}
        <div className="flex rounded-lg border border-[var(--border)] overflow-hidden">
          <button
            onClick={() => onModeChange("learn")}
            className={`
              px-3 py-1 text-xs transition-colors
              ${drillMode === "learn"
                ? "bg-[var(--gold)]/15 text-[var(--gold)] font-medium"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }
            `}
          >
            Learn
          </button>
          <button
            onClick={() => onModeChange("quiz")}
            className={`
              px-3 py-1 text-xs transition-colors border-l border-[var(--border)]
              ${drillMode === "quiz"
                ? "bg-[var(--gold)]/15 text-[var(--gold)] font-medium"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }
            `}
          >
            Quiz
          </button>
        </div>

        <span className="text-xs text-[var(--muted-foreground)]">Hands:</span>
        <div className="flex gap-1">
          {HAND_COUNT_OPTIONS.map((n) => (
            <button
              key={n}
              onClick={() => setHandCount(n)}
              className={`
                px-3 py-1 rounded text-xs border transition-colors
                ${handCount === n
                  ? "border-[var(--gold)] text-[var(--gold)]"
                  : "border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--gold-dim)]"
                }
              `}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button
          disabled={!selected}
          onClick={() => selected && onStart(selected, handCount)}
          className={`
            px-5 py-2 rounded-lg text-sm font-semibold transition-all
            ${selected
              ? "bg-[var(--gold)] text-black hover:bg-[var(--gold)]/90 cursor-pointer"
              : "bg-[var(--muted)] text-[var(--muted-foreground)] cursor-not-allowed"
            }
          `}
        >
          Start Drill
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// ACTIVE DRILL
// ═══════════════════════════════════════════════════════

function ActiveDrill({
  drill,
  drillMode,
  onOpenGuide,
}: {
  drill: ReturnType<typeof useDrillSession>;
  drillMode: DrillMode;
  onOpenGuide: () => void;
}) {
  const progressPct = drill.handsTarget > 0
    ? (drill.handsPlayed / drill.handsTarget) * 100
    : 0;

  // In learn mode, solution is always visible.
  // In quiz mode, solution is only visible after acting.
  const showSolution = drillMode === "learn" || drill.phase === "acted";

  return (
    <div className="space-y-4">
      {/* Drill header — archetype name + progress */}
      <div className="space-y-2">
        {drill.archetypeId && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-[var(--foreground)]">
                {archetypeLabel(drill.archetypeId)}
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--gold)]/10 text-[var(--gold)] border border-[var(--gold)]/20 font-medium">
                {archetypeCategoryLabel(drill.archetypeId)}
              </span>
            </div>
            <button
              onClick={onOpenGuide}
              className="w-5 h-5 rounded-full border border-[var(--border)] flex items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--gold)] hover:border-[var(--gold-dim)] transition-colors"
              title="How to use Drill Mode"
            >
              <span className="text-[9px] font-bold">?</span>
            </button>
          </div>
        )}
        <div className="flex justify-between text-[10px] text-[var(--muted-foreground)]">
          <span>Hand {Math.min(drill.handsPlayed + 1, drill.handsTarget)} of {drill.handsTarget}</span>
          <span>{drill.progress.optimal}W {drill.progress.acceptable}A {drill.progress.mistake}M {drill.progress.blunder}B</span>
        </div>
        <div className="h-1.5 rounded-full bg-[var(--muted)]/30 overflow-hidden">
          <motion.div
            className="h-full bg-[var(--gold)] rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Board narrative — sets the scene for the decision */}
      {drill.currentDeal && (
        <NarrativeBoardContext
          archetype={drill.currentDeal.archetype}
          handCategory={drill.currentDeal.handCategory}
          communityCards={drill.currentDeal.communityCards}
          isInPosition={drill.currentDeal.isInPosition}
          drillMode={drillMode}
        />
      )}

      {/* Game state viewer */}
      {drill.gameState && drill.currentDeal && (
        <HandStateViewer
          gameState={drill.gameState}
          heroSeatIndex={drill.currentDeal.heroSeatIndex}
          bigBlind={2}
          showAllCards={drill.phase === "acted"}
        />
      )}

      {/* Solution display — shown based on drill mode */}
      {showSolution && drill.solution && (
        <SolutionDisplay
          solution={drill.solution}
          userAction={drill.currentScore?.userAction}
          score={drill.currentScore}
        />
      )}

      {/* Narrative prompt — quiz mode only, before acting */}
      {drill.phase === "ready" && drillMode === "quiz" && drill.solution && drill.currentDeal && (
        <NarrativePrompt
          handCategory={drill.currentDeal.handCategory}
          isInPosition={drill.currentDeal.isInPosition}
          isPreflop={drill.currentDeal.archetype.category === "preflop"}
          frequencies={drill.solution.frequencies}
          selectedIntent={drill.narrativeChoice}
          onSelect={drill.setNarrativeChoice}
        />
      )}

      {/* Action panel — always available in "ready" phase */}
      {drill.phase === "ready" && drill.solution && (
        <DrillActionPanel
          availableActions={drill.solution.availableActions}
          onAct={drill.act}
        />
      )}

      {/* Post-action: narrative feedback (quiz mode) */}
      {drill.phase === "acted" && drillMode === "quiz" && drill.currentScore && drill.solution && (
        <NarrativeFeedbackDisplay
          userAction={drill.currentScore.userAction}
          narrativeChoice={drill.narrativeChoice}
          optimalAction={drill.solution.optimalAction}
          optimalFrequency={drill.solution.optimalFrequency}
          frequencies={drill.solution.frequencies}
          archetypeId={drill.archetypeId ?? undefined}
        />
      )}

      {/* Post-action: score feedback (quiz mode) + next hand */}
      {drill.phase === "acted" && drill.currentScore && !showSolution && (
        <ScoreDisplay
          score={drill.currentScore}
          onNextHand={drill.nextHand}
          isLastHand={drill.handsPlayed >= drill.handsTarget}
        />
      )}

      {/* Next hand button (when solution is shown — learn mode or post-act) */}
      {drill.phase === "acted" && (
        <button
          onClick={drill.nextHand}
          className="w-full py-2 rounded-lg border border-[var(--border)] text-sm font-medium hover:bg-[var(--accent)] transition-colors"
        >
          {drill.handsPlayed >= drill.handsTarget ? "View Summary" : "Next Hand"}
        </button>
      )}

      {drill.phase === "dealing" && (
        <div className="text-center text-xs text-[var(--muted-foreground)] py-4">
          Dealing...
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════

function DrillSummary({
  drill,
  onNewDrill,
}: {
  drill: ReturnType<typeof useDrillSession>;
  onNewDrill: () => void;
}) {
  const { progress, scores } = drill;
  const total = scores.length;
  const avgEvLoss = total > 0
    ? scores.reduce((sum, s) => sum + s.evLoss, 0) / total
    : 0;

  const verdicts: Array<{ key: string; count: number; color: string }> = [
    { key: "Optimal", count: progress.optimal, color: "text-green-400" },
    { key: "Acceptable", count: progress.acceptable, color: "text-yellow-400" },
    { key: "Mistake", count: progress.mistake, color: "text-orange-400" },
    { key: "Blunder", count: progress.blunder, color: "text-red-400" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-[var(--foreground)]">Drill Complete</h2>
        {drill.archetypeId && (
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-sm font-semibold text-[var(--gold)]">
              {archetypeLabel(drill.archetypeId)}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--gold)]/10 text-[var(--gold)]/70 border border-[var(--gold)]/20">
              {archetypeCategoryLabel(drill.archetypeId)}
            </span>
          </div>
        )}
        <p className="text-xs text-[var(--muted-foreground)] mt-1">
          {total} hands played — average EV loss: {avgEvLoss.toFixed(1)} BB
        </p>
      </div>

      {/* Verdict breakdown */}
      <div className="grid grid-cols-4 gap-3">
        {verdicts.map((v) => (
          <div
            key={v.key}
            className="text-center rounded-lg border border-[var(--border)] p-3"
          >
            <div className={`text-2xl font-bold ${v.color}`}>{v.count}</div>
            <div className="text-[10px] text-[var(--muted-foreground)] mt-0.5">{v.key}</div>
          </div>
        ))}
      </div>

      {/* Accuracy bar */}
      {total > 0 && (
        <div className="space-y-1">
          <span className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
            Accuracy
          </span>
          <div className="h-3 rounded-full overflow-hidden flex">
            {progress.optimal > 0 && (
              <div className="bg-green-500 h-full" style={{ width: `${(progress.optimal / total) * 100}%` }} />
            )}
            {progress.acceptable > 0 && (
              <div className="bg-yellow-500 h-full" style={{ width: `${(progress.acceptable / total) * 100}%` }} />
            )}
            {progress.mistake > 0 && (
              <div className="bg-orange-500 h-full" style={{ width: `${(progress.mistake / total) * 100}%` }} />
            )}
            {progress.blunder > 0 && (
              <div className="bg-red-500 h-full" style={{ width: `${(progress.blunder / total) * 100}%` }} />
            )}
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
          [], // narrative choices tracking to be wired in future
          drill.archetypeId ?? undefined,
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

      {/* New drill button */}
      <button
        onClick={onNewDrill}
        className="w-full py-2.5 rounded-lg bg-[var(--gold)] text-black font-semibold text-sm hover:bg-[var(--gold)]/90 transition-colors"
      >
        New Drill
      </button>
    </div>
  );
}
