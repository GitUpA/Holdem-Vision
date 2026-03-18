"use client";

/**
 * SolutionDisplay — shows the full GTO solution for the current spot.
 *
 * This is the teaching core of drill mode. It displays:
 * 1. Frequency distribution (with bands if available)
 * 2. Why GTO plays this way (archetype explanation)
 * 3. Accuracy guarantee ("within X BB of exact solver")
 * 4. User's action score (if they've acted)
 *
 * Designed to be shown BEFORE or AFTER the user acts — the UI decides.
 * In learn mode it's always visible. In quiz mode it appears after acting.
 */
import { motion } from "framer-motion";
import type { SpotSolution } from "@/hooks/use-workspace";
import type { ActionScore } from "../../../convex/lib/gto/evScoring";
import type { GtoAction } from "../../../convex/lib/gto/tables/types";
import { gtoActionLabel } from "../../../convex/lib/gto/actionMapping";
import { InfoTip } from "../ui/tooltip";
import { TermTip } from "../ui/term";

interface SolutionDisplayProps {
  solution: SpotSolution;
  /** If the user has acted, highlight their choice */
  userAction?: GtoAction;
  /** If scored, show verdict inline */
  score?: ActionScore | null;
}

const VERDICT_COLORS: Record<string, string> = {
  optimal: "text-green-400",
  acceptable: "text-yellow-400",
  mistake: "text-orange-400",
  blunder: "text-red-400",
};

export function SolutionDisplay({ solution, userAction, score }: SolutionDisplayProps) {
  // Sort frequencies by value descending
  const freqEntries = Object.entries(solution.frequencies)
    .filter(([, v]) => (v ?? 0) > 0.01)
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0)) as [GtoAction, number][];

  const maxFreq = freqEntries.length > 0 ? Math.max(...freqEntries.map(([, v]) => v)) : 1;

  // Detect mixed strategy — top two actions are both significant
  const isMixed = freqEntries.length >= 2
    && freqEntries[1][1] >= 0.25
    && (freqEntries[0][1] - freqEntries[1][1]) < 0.20;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3 rounded-lg border border-[var(--border)] p-3 bg-[var(--card)]/50"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-widest text-[var(--muted-foreground)]">
          GTO Solution
          <TermTip id="concept:gto" position="bottom" />
        </span>
        <ConfidenceBadge solution={solution} />
      </div>

      {/* Mixed strategy indicator */}
      {isMixed && (
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-[var(--gold)]/[0.05] border border-[var(--gold)]/15 text-[10px] text-[var(--gold-dim)]">
          <span className="font-medium">Close spot</span>
          <span className="text-[var(--muted-foreground)]">
            — multiple actions are correct here. GTO mixes between them.
          </span>
        </div>
      )}

      {/* Frequency bar chart with bands */}
      <div className="space-y-1.5">
        {freqEntries.map(([action, freq]) => {
          const isUser = userAction === action;
          const isOptimal = action === solution.optimalAction;
          const band = solution.bands?.[action];
          const width = Math.max(2, (freq / maxFreq) * 100);

          // Band range display
          const bandLabel = band && band.sampleCount >= 2
            ? `${Math.round(band.min * 100)}-${Math.round(band.max * 100)}%`
            : null;

          return (
            <div key={action} className="flex items-center gap-2">
              <span
                className={`text-[10px] w-16 text-right ${
                  isUser
                    ? (score ? VERDICT_COLORS[score.verdict] ?? "" : "text-blue-400") + " font-bold"
                    : isOptimal
                      ? "text-green-400 font-medium"
                      : "text-[var(--muted-foreground)]"
                }`}
              >
                {gtoActionLabel(action)}
              </span>
              <div className="flex-1 h-5 rounded bg-[var(--muted)]/20 overflow-hidden relative">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${width}%` }}
                  transition={{ duration: 0.4, delay: 0.1 }}
                  className={`h-full rounded ${
                    isUser
                      ? "bg-blue-500/60"
                      : isOptimal
                        ? "bg-green-500/40"
                        : "bg-[var(--muted-foreground)]/20"
                  }`}
                />
                {/* Band range indicator (subtle overlay) */}
                {band && band.sampleCount >= 2 && (
                  <div
                    className="absolute top-0 h-full border-l border-r border-[var(--muted-foreground)]/30"
                    style={{
                      left: `${Math.max(0, (band.min / maxFreq) * 100)}%`,
                      right: `${Math.max(0, 100 - (band.max / maxFreq) * 100)}%`,
                    }}
                  />
                )}
              </div>
              <span
                className={`text-[10px] w-16 ${
                  isUser
                    ? (score ? VERDICT_COLORS[score.verdict] ?? "" : "text-blue-400") + " font-bold"
                    : isOptimal
                      ? "text-green-400"
                      : "text-[var(--muted-foreground)]"
                }`}
              >
                {(freq * 100).toFixed(0)}%
                {bandLabel && (
                  <span className="text-[var(--muted-foreground)] font-normal"> ({bandLabel})</span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {/* User action verdict (if acted) */}
      {score && userAction && (
        <div className={`text-xs ${VERDICT_COLORS[score.verdict] ?? ""} font-medium`}>
          You chose {gtoActionLabel(userAction)}: {score.verdict.toUpperCase()}
          {score.evLoss > 0 && (
            <span className="text-[var(--muted-foreground)] font-normal">
              {" "}— EV loss: {score.evLoss.toFixed(1)} BB
            </span>
          )}
        </div>
      )}

      {/* Teaching explanation */}
      <ExplanationSection solution={solution} />

      {/* Data confidence (expandable) */}
      <ConfidenceDetails solution={solution} />
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════
// EXPLANATION
// ═══════════════════════════════════════════════════════

function ExplanationSection({ solution }: { solution: SpotSolution }) {
  const explanation = solution.explanation;
  if (!explanation.children || explanation.children.length === 0) return null;

  // Extract key teaching elements
  const handCategory = explanation.children.find((c) => c.tags?.includes("hand-category"));
  const position = explanation.children.find((c) => c.tags?.includes("position"));
  const principle = explanation.children.find((c) => c.tags?.includes("principle"));
  const feeling = explanation.children.find((c) => c.tags?.includes("feeling"));
  const mistakes = explanation.children.find((c) => c.tags?.includes("mistakes"));

  return (
    <div className="space-y-1.5 border-t border-[var(--border)]/50 pt-2">
      {/* Hand + position context */}
      <div className="flex items-center gap-2 text-[10px] text-[var(--muted-foreground)]">
        {handCategory && <span>{handCategory.summary}</span>}
        {position && <span>·</span>}
        {position && <span>{position.summary}</span>}
      </div>

      {/* Key principle — the "why" */}
      {principle && (
        <div className="flex items-start gap-1.5 text-[11px] text-[var(--foreground)]/80 border-l-2 border-[var(--gold)]/40 pl-2">
          <InfoTip
            text="Key Principle — The core concept behind this spot. This is what GTO strategy exploits in this board/hand/position configuration."
            variant="insight"
            position="right"
            className="text-[var(--gold)]"
          />
          <span>{principle.summary}</span>
        </div>
      )}

      {/* Feeling — the visceral coaching voice */}
      {feeling && (
        <div className="flex items-start gap-1.5 text-[10px] italic text-[var(--gold)]/70 border-l-2 border-[var(--gold)]/20 pl-2">
          <InfoTip
            text="Coach's Voice — What you should be thinking when you see this spot at the table. Internalize this feeling to build pattern recognition."
            variant="coach"
            position="right"
            className="not-italic text-[var(--gold)]"
          />
          <span>{feeling.summary}</span>
        </div>
      )}

      {/* Common mistakes */}
      {mistakes && mistakes.children && mistakes.children.length > 0 && (
        <div className="flex items-start gap-1.5 text-[10px] text-orange-400/70 border-l-2 border-orange-500/20 pl-2">
          <InfoTip
            text="Common Mistake — A frequent error players make in this spot. Being aware of the trap helps you avoid it."
            variant="warning"
            position="right"
            className="text-orange-400"
          />
          <span>{mistakes.children[0].summary}</span>
        </div>
      )}

      {/* Fallback notice */}
      {!solution.isExactMatch && (
        <div className="text-[9px] text-[var(--muted-foreground)]/60">
          Using closest category: {solution.resolvedCategory.replace(/_/g, " ")}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// DATA CONFIDENCE — unified display for preflop + postflop
// ═══════════════════════════════════════════════════════

const CONFIDENCE_COLORS: Record<string, string> = {
  reliable: "text-green-400",
  good: "text-yellow-400",
  approximate: "text-orange-400",
};

/** Inline badge shown in the header */
function ConfidenceBadge({ solution }: { solution: SpotSolution }) {
  const impact = solution.accuracyImpact;
  const preflop = solution.preflopConfidence;

  if (impact) {
    return (
      <span className="text-[10px] text-[var(--muted-foreground)]">
        Within{" "}
        <span className="text-[var(--foreground)] font-medium">
          {impact.maxEvImpactBB.toFixed(2)} BB
        </span>
        {" "}of exact solver
      </span>
    );
  }

  if (preflop) {
    return (
      <span className="text-[10px] text-[var(--muted-foreground)]" title={preflop.detail}>
        <span className={CONFIDENCE_COLORS[preflop.level] ?? ""}>
          {preflop.label}
        </span>
        {" \u00b7 "}{preflop.sampleCount} scenarios
      </span>
    );
  }

  return null;
}

/** Expandable details section */
function ConfidenceDetails({ solution }: { solution: SpotSolution }) {
  const impact = solution.accuracyImpact;
  const preflop = solution.preflopConfidence;

  if (!impact && !preflop) return null;

  const summaryText = impact
    ? `Accuracy: ${impact.label} (${Math.round(impact.accuracy * 100)}%)${impact.couldFlipOptimal ? " \u00b7 Close spot" : ""}`
    : `Data confidence: ${preflop!.label}`;

  const detailContent = impact
    ? impact.practicalMeaning
    : preflop!.detail;

  return (
    <details className="border-t border-[var(--border)]/50 pt-2">
      <summary className="text-[10px] text-[var(--muted-foreground)] cursor-pointer hover:text-[var(--foreground)] transition-colors">
        {summaryText}
      </summary>
      <div className="mt-1.5 space-y-1 text-[10px] text-[var(--muted-foreground)]">
        <p>{detailContent}</p>
        {impact && solution.archetypeAccuracy && (
          <p>
            Based on {solution.archetypeAccuracy.boardCount} solved boards
            {solution.bands && Object.keys(solution.bands).length > 0 && " with frequency bands"}
          </p>
        )}
      </div>
    </details>
  );
}
