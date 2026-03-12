"use client";

/**
 * ScoreDisplay — post-action feedback for drill mode.
 *
 * Shows: verdict badge, EV loss, frequency bar chart, key principle,
 * common mistake callout, and next-hand button.
 */
import { motion } from "framer-motion";
import type { ActionScore, Verdict } from "../../../convex/lib/gto/evScoring";
import type { GtoAction } from "../../../convex/lib/gto/tables/types";
import { gtoActionLabel } from "../../../convex/lib/gto/actionMapping";

interface ScoreDisplayProps {
  score: ActionScore;
  onNextHand: () => void;
  isLastHand: boolean;
}

const VERDICT_STYLES: Record<Verdict, { bg: string; text: string; label: string }> = {
  optimal:    { bg: "bg-green-500/20", text: "text-green-400", label: "Optimal" },
  acceptable: { bg: "bg-yellow-500/20", text: "text-yellow-400", label: "Acceptable" },
  mistake:    { bg: "bg-orange-500/20", text: "text-orange-400", label: "Mistake" },
  blunder:    { bg: "bg-red-500/20", text: "text-red-400", label: "Blunder" },
};

export function ScoreDisplay({ score, onNextHand, isLastHand }: ScoreDisplayProps) {
  const style = VERDICT_STYLES[score.verdict];

  // Sort frequencies by value descending
  const freqEntries = Object.entries(score.allFrequencies)
    .filter(([, v]) => (v ?? 0) > 0.01)
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0)) as [GtoAction, number][];

  const maxFreq = freqEntries.length > 0 ? Math.max(...freqEntries.map(([, v]) => v)) : 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Verdict badge + EV loss */}
      <div className="flex items-center justify-between">
        <div className={`${style.bg} ${style.text} px-3 py-1.5 rounded-lg font-bold text-sm`}>
          {style.label}
        </div>
        {score.evLoss > 0 && (
          <span className="text-xs text-[var(--muted-foreground)]">
            EV loss: <span className="text-red-400 font-medium">{score.evLoss.toFixed(1)} BB</span>
          </span>
        )}
      </div>

      {/* Your action vs optimal */}
      <div className="text-xs space-y-1">
        <div>
          You chose: <span className={style.text}>{gtoActionLabel(score.userAction)}</span>
          <span className="text-[var(--muted-foreground)]">
            {" "}({(score.userActionFrequency * 100).toFixed(0)}% GTO)
          </span>
        </div>
        {score.userAction !== score.optimalAction && (
          <div className="text-[var(--muted-foreground)]">
            GTO prefers: <span className="text-green-400">{gtoActionLabel(score.optimalAction)}</span>
            {" "}({(score.optimalFrequency * 100).toFixed(0)}%)
          </div>
        )}
      </div>

      {/* Frequency bar chart */}
      <div className="space-y-1.5">
        <span className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
          GTO Distribution
        </span>
        {freqEntries.map(([action, freq]) => {
          const isUser = action === score.userAction;
          const width = Math.max(2, (freq / maxFreq) * 100);
          return (
            <div key={action} className="flex items-center gap-2">
              <span className={`text-[10px] w-16 text-right ${isUser ? style.text + " font-bold" : "text-[var(--muted-foreground)]"}`}>
                {gtoActionLabel(action as GtoAction)}
              </span>
              <div className="flex-1 h-4 rounded bg-[var(--muted)]/20 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${width}%` }}
                  transition={{ duration: 0.4, delay: 0.1 }}
                  className={`h-full rounded ${isUser ? "bg-current " + style.text : "bg-[var(--muted-foreground)]/30"}`}
                />
              </div>
              <span className={`text-[10px] w-8 ${isUser ? style.text + " font-bold" : "text-[var(--muted-foreground)]"}`}>
                {(freq * 100).toFixed(0)}%
              </span>
            </div>
          );
        })}
      </div>

      {/* Key principle */}
      {score.explanation.children?.find((c) => c.tags?.includes("principle")) && (
        <div className="text-[11px] text-[var(--muted-foreground)] border-l-2 border-[var(--border)] pl-2">
          {score.explanation.children.find((c) => c.tags?.includes("principle"))!.summary}
        </div>
      )}

      {/* Common mistake callout */}
      {score.explanation.children?.find((c) => c.tags?.includes("common-mistake")) && (
        <div className="text-[11px] text-orange-400/80 border-l-2 border-orange-500/30 pl-2">
          {score.explanation.children.find((c) => c.tags?.includes("common-mistake"))!.summary}
        </div>
      )}

      {/* Next hand button */}
      <button
        onClick={onNextHand}
        className="w-full py-2 rounded-lg border border-[var(--border)] text-sm font-medium hover:bg-[var(--accent)] transition-colors"
      >
        {isLastHand ? "View Summary" : "Next Hand"}
      </button>
    </motion.div>
  );
}
