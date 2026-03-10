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
    <div className="space-y-3">
      {/* Consensus Banner */}
      {consensus ? (
        <ConsensusBanner consensus={consensus} total={advices.length} />
      ) : (
        <div className="text-xs text-[var(--muted-foreground)] italic px-1">
          No consensus — profiles disagree on the best action
        </div>
      )}

      {/* Profile Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {advices.map((advice, i) => (
          <ProfileCard
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
        "flex items-center gap-3 px-3 py-2 rounded-lg border",
        colors.bg,
        colors.border,
      )}
    >
      <span className={cn("text-sm font-bold uppercase", colors.text)}>
        {consensus.actionType.replace("_", " ")}
      </span>
      <span className="text-xs">
        <span className="font-bold text-[var(--gold)]">
          {consensus.agreeing.length}
        </span>
        <span className="text-[var(--muted-foreground)]">
          {" "}of {total} profiles agree
        </span>
      </span>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════
// PROFILE CARD
// ═══════════════════════════════════════════════════════

function ProfileCard({
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
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={cn(
        "rounded-lg border p-3 space-y-2 transition-colors",
        isAgreeing
          ? "border-[var(--gold-dim)]/40 bg-[var(--felt)]/20"
          : "border-[var(--border)] bg-[var(--muted)]/30",
      )}
    >
      {/* Header: profile name + engine badge + expand toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-[var(--foreground)]">
            {meta?.short ?? advice.profileName}
          </span>
          {advice.engineId !== "basic" && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[var(--gold-dim)]/15 text-[var(--gold-dim)] border border-[var(--gold-dim)]/20">
              {advice.engineId}
            </span>
          )}
        </div>
        <button
          onClick={onToggle}
          className="p-1 hover:bg-[var(--muted)] rounded transition-colors"
          aria-label={`${isExpanded ? "Collapse" : "Expand"} ${advice.profileName} reasoning`}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn(
              "text-[var(--muted-foreground)] transition-transform duration-200",
              isExpanded && "rotate-90",
            )}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      {/* Action pill + amount */}
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "text-xs font-bold uppercase px-2 py-0.5 rounded-full border",
            actionColor.text,
            actionColor.bg,
            actionColor.border,
          )}
        >
          {advice.actionType.replace("_", " ")}
        </span>
        {advice.amount !== undefined && (
          <span className="text-xs font-bold tabular-nums text-[var(--foreground)]">
            {advice.amount}
          </span>
        )}
      </div>

      {/* Profile description */}
      <p className="text-[10px] text-[var(--muted-foreground)]">
        {meta?.desc ?? advice.profileName}
      </p>

      {/* Expandable reasoning tree */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-[var(--border)] pt-2 mt-1"
          >
            <ExplanationTree node={advice.explanation} defaultOpen={true} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
