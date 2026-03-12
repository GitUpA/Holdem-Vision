"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { ExplanationTree } from "./explanation-tree";
import type { CoachingAdvice, CoachingValue } from "../../../convex/lib/analysis/coachingLens";

// ═══════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════

const ACTION_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  fold:   { text: "text-gray-400",  bg: "bg-gray-500/15",  border: "border-gray-500/30" },
  check:  { text: "text-blue-300",  bg: "bg-blue-500/15",  border: "border-blue-500/30" },
  call:   { text: "text-green-300", bg: "bg-green-500/15", border: "border-green-500/30" },
  bet:    { text: "text-amber-300", bg: "bg-amber-500/15", border: "border-amber-500/30" },
  raise:  { text: "text-red-300",   bg: "bg-red-500/15",   border: "border-red-500/30" },
  all_in: { text: "text-red-400",   bg: "bg-red-500/20",   border: "border-red-500/40" },
};

const PROFILE_META: Record<string, { short: string; desc: string }> = {
  nit:  { short: "NIT",  desc: "Ultra-tight, premium only" },
  fish: { short: "FISH", desc: "Loose-passive, calls too much" },
  tag:  { short: "TAG",  desc: "Tight-aggressive, solid play" },
  lag:  { short: "LAG",  desc: "Loose-aggressive, high pressure" },
  gto:  { short: "GTO",  desc: "Game-theory optimal, balanced" },
};

// ═══════════════════════════════════════════════════════
// COACHING PANEL
// ═══════════════════════════════════════════════════════

interface CoachingPanelProps {
  advices: CoachingAdvice[];
  consensus?: CoachingValue["consensus"];
}

export function CoachingPanel({ advices, consensus }: CoachingPanelProps) {
  const [expandedProfile, setExpandedProfile] = useState<string | null>(null);

  if (advices.length === 0) {
    return (
      <div className="text-sm text-[var(--muted-foreground)] py-2">
        Waiting for hero&apos;s turn to act...
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Consensus Banner */}
      {consensus ? (
        <ConsensusBanner consensus={consensus} total={advices.length} />
      ) : (
        <div className="text-[10px] text-[var(--muted-foreground)] italic">
          No consensus — profiles disagree
        </div>
      )}

      {/* Profile Rows */}
      <div className="space-y-0 divide-y divide-[var(--border)]/50">
        {advices.map((advice, i) => (
          <ProfileRow
            key={advice.profileId}
            advice={advice}
            index={i}
            isAgreeing={consensus?.agreeing.includes(advice.profileName) ?? false}
            isExpanded={expandedProfile === advice.profileId}
            onToggle={() =>
              setExpandedProfile(
                expandedProfile === advice.profileId ? null : advice.profileId,
              )
            }
          />
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// CONSENSUS BANNER
// ═══════════════════════════════════════════════════════

function ConsensusBanner({
  consensus,
  total,
}: {
  consensus: NonNullable<CoachingValue["consensus"]>;
  total: number;
}) {
  const colors = ACTION_COLORS[consensus.actionType] ?? ACTION_COLORS.check;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "flex items-center gap-3 px-3 py-1.5 rounded-lg border",
        colors.bg,
        colors.border,
      )}
    >
      <span className={cn("text-xs font-bold uppercase", colors.text)}>
        {consensus.actionType.replace("_", " ")}
      </span>
      <span className="text-[10px]">
        <span className="font-bold text-[var(--gold)]">
          {consensus.agreeing.length}
        </span>
        <span className="text-[var(--muted-foreground)]">
          {" "}of {total} agree
        </span>
      </span>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════
// PROFILE ROW
// ═══════════════════════════════════════════════════════

function ProfileRow({
  advice,
  index,
  isAgreeing,
  isExpanded,
  onToggle,
}: {
  advice: CoachingAdvice;
  index: number;
  isAgreeing: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const meta = PROFILE_META[advice.profileId];
  const actionColor = ACTION_COLORS[advice.actionType] ?? ACTION_COLORS.check;

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03 }}
      className={cn(
        "transition-colors",
        isAgreeing && "bg-[var(--gold)]/[0.04]",
      )}
    >
      {/* Row: clickable to expand */}
      <button
        onClick={onToggle}
        className={cn(
          "w-full flex items-center gap-2 px-2 py-1.5 text-left transition-colors",
          "hover:bg-[var(--muted)]/30",
          isAgreeing && "border-l-2 border-l-[var(--gold-dim)]/50",
        )}
      >
        {/* Profile badge */}
        <span className="text-[10px] font-bold text-[var(--foreground)] w-8 shrink-0">
          {meta?.short ?? advice.profileName}
        </span>

        {/* Engine badge (if not basic) */}
        {advice.engineId !== "basic" && (
          <span className="text-[9px] px-1 py-0.5 rounded bg-[var(--gold-dim)]/10 text-[var(--gold-dim)] border border-[var(--gold-dim)]/20 shrink-0">
            {advice.engineId}
          </span>
        )}

        {/* Action pill */}
        <span
          className={cn(
            "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full border shrink-0",
            actionColor.text,
            actionColor.bg,
            actionColor.border,
          )}
        >
          {advice.actionType.replace("_", " ")}
        </span>

        {/* Amount */}
        {advice.amount !== undefined && (
          <span className="text-[10px] font-bold tabular-nums text-[var(--foreground)] shrink-0">
            {advice.amount}
          </span>
        )}

        {/* Description (truncated) */}
        <span className="text-[10px] text-[var(--muted-foreground)] truncate flex-1 min-w-0">
          {meta?.desc ?? advice.profileName}
        </span>

        {/* Expand chevron */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn(
            "text-[var(--muted-foreground)]/50 transition-transform duration-200 shrink-0",
            isExpanded && "rotate-90",
          )}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

      {/* Expandable reasoning tree */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden px-2 pb-2"
          >
            <div className="border-t border-[var(--border)]/50 pt-2 ml-8">
              <ExplanationTree node={advice.explanation} defaultOpen={true} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
