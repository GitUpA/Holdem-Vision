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
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ArchetypeId, ArchetypeCategory } from "../../../convex/lib/gto/archetypeClassifier";
import { hasTable } from "../../../convex/lib/gto/tables/tableRegistry";
import { useDrillSession } from "@/hooks/use-drill-session";
import { HandStateViewer } from "../replay/hand-state-viewer";
import { DrillActionPanel } from "./drill-action-panel";
import { ScoreDisplay } from "./score-display";
import { SolutionDisplay } from "./solution-display";

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
  preflop: "Preflop",
  flop_texture: "Flop Textures",
  postflop_principle: "Postflop Principles",
};

const HAND_COUNT_OPTIONS = [5, 10, 20];

export type DrillMode = "learn" | "quiz";

// ═══════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════

export function DrillWorkspace() {
  const drill = useDrillSession();
  const [drillMode, setDrillMode] = useState<DrillMode>("quiz");

  return (
    <div className="w-full max-w-2xl mx-auto p-4 space-y-4">
      <AnimatePresence mode="wait">
        {drill.phase === "idle" ? (
          <motion.div key="selector" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ArchetypeSelector
              onStart={drill.startDrill}
              drillMode={drillMode}
              onModeChange={setDrillMode}
            />
          </motion.div>
        ) : drill.phase === "summary" ? (
          <motion.div key="summary" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <DrillSummary drill={drill} onNewDrill={drill.resetDrill} />
          </motion.div>
        ) : (
          <motion.div key="active" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ActiveDrill drill={drill} drillMode={drillMode} />
          </motion.div>
        )}
      </AnimatePresence>
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
}: {
  onStart: (id: ArchetypeId, count?: number) => void;
  drillMode: DrillMode;
  onModeChange: (mode: DrillMode) => void;
}) {
  const [selected, setSelected] = useState<ArchetypeId | null>(null);
  const [handCount, setHandCount] = useState(10);

  const categories: ArchetypeCategory[] = ["preflop", "flop_texture", "postflop_principle"];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-[var(--foreground)]">GTO Drill Mode</h2>
        <p className="text-xs text-[var(--muted-foreground)] mt-1">
          Practice GTO decisions against frequency tables. Select an archetype to begin.
        </p>
      </div>

      {categories.map((cat) => (
        <div key={cat} className="space-y-2">
          <h3 className="text-[11px] font-medium uppercase tracking-widest text-[var(--muted-foreground)]">
            {CATEGORY_LABELS[cat]}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {ALL_ARCHETYPES.filter((a) => a.category === cat).map((arch) => {
              const available = hasTable(arch.id);
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
                    <span className="block text-[9px] mt-0.5 opacity-50">No data</span>
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
}: {
  drill: ReturnType<typeof useDrillSession>;
  drillMode: DrillMode;
}) {
  const progressPct = drill.handsTarget > 0
    ? (drill.handsPlayed / drill.handsTarget) * 100
    : 0;

  // In learn mode, solution is always visible.
  // In quiz mode, solution is only visible after acting.
  const showSolution = drillMode === "learn" || drill.phase === "acted";

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="space-y-1">
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

      {/* Deal info */}
      {drill.currentDeal && (
        <div className="flex items-center gap-2 text-[10px] text-[var(--muted-foreground)]">
          <span className="px-2 py-0.5 rounded bg-[var(--muted)]/20 border border-[var(--border)]">
            {drill.currentDeal.archetype.description}
          </span>
          <span>{drill.currentDeal.isInPosition ? "IP" : "OOP"}</span>
          <span>{drill.currentDeal.handCategory.category.replace(/_/g, " ")}</span>
        </div>
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

      {/* Action panel — always available in "ready" phase */}
      {drill.phase === "ready" && drill.solution && (
        <DrillActionPanel
          availableActions={drill.solution.availableActions}
          onAct={drill.act}
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
