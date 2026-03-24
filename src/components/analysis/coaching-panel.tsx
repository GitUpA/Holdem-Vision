"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { ExplanationTree } from "./explanation-tree";
import { SolutionDisplay } from "../drill/solution-display";
import type { CoachingAdvice } from "../../../convex/lib/analysis/coachingLens";
import type { OpponentStory } from "../../../convex/lib/analysis/opponentStory";
import type { ActionStory } from "../../../convex/lib/gto/actionNarratives";
import type { SpotSolution } from "@/hooks/use-workspace";
import type { ArchetypeClassification, ArchetypeId } from "../../../convex/lib/gto/archetypeClassifier";
import { getKnowledge } from "../../../convex/lib/knowledge";
import { Term } from "../ui/term";

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

function getProfileMeta(profileId: string): { short: string; desc: string } {
  const entry = getKnowledge(`profile:${profileId}`);
  if (entry) return { short: entry.name, desc: entry.short };
  return { short: profileId.toUpperCase(), desc: profileId };
}

// ═══════════════════════════════════════════════════════
// COACHING PANEL
// ═══════════════════════════════════════════════════════

interface CoachingPanelProps {
  advices: CoachingAdvice[];
  /** In drill mode, pass the drill solution to embed in the GTO row */
  drillSolution?: SpotSolution;
  /** In drill mode, pass the user's score */
  drillScore?: import("../../../convex/lib/gto/evScoring").ActionScore | null;
  /** Auto-expand the GTO row (drill mode) */
  autoExpandGto?: boolean;
  /** Classified archetype for the current spot (vision mode) */
  archetype?: ArchetypeClassification | null;
  /** Callback when user clicks the archetype badge */
  onArchetypeClick?: (id: ArchetypeId) => void;
  /** Label resolver for archetype IDs */
  archetypeLabel?: (id: ArchetypeId) => string;
  /** Opponent story — what their actions reveal about their holdings */
  opponentStory?: OpponentStory;
  /** Per-action narratives — what each action tells opponents */
  actionStories?: ActionStory[];
}

/** GTO first — it's the reference point other profiles compare against */
const PROFILE_ORDER: Record<string, number> = {
  gto: 0, tag: 1, lag: 2, nit: 3, fish: 4,
};

export function CoachingPanel({ advices, drillSolution, drillScore, autoExpandGto, archetype, onArchetypeClick, archetypeLabel: labelFn, opponentStory, actionStories }: CoachingPanelProps) {
  const [expandedProfile, setExpandedProfile] = useState<string | null>(
    autoExpandGto ? "gto" : null,
  );

  // Sort: GTO first, then TAG, LAG, NIT, FISH
  const sorted = [...advices].sort(
    (a, b) => (PROFILE_ORDER[a.profileId] ?? 99) - (PROFILE_ORDER[b.profileId] ?? 99),
  );

  if (sorted.length === 0) {
    return (
      <div className="text-sm text-[var(--muted-foreground)] py-2">
        Waiting for hero&apos;s turn to act...
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Archetype Badge */}
      {archetype && (
        <ArchetypeBadge
          archetype={archetype}
          onClick={onArchetypeClick}
          labelFn={labelFn}
        />
      )}

      {/* Opponent Story */}
      {opponentStory && opponentStory.confidence !== "speculative" && (
        <OpponentStoryCard story={opponentStory} />
      )}

      {/* Action Stories — what each action tells opponents */}
      {actionStories && actionStories.length > 0 && (
        <ActionStoriesSection stories={actionStories} />
      )}

      {/* Profile Rows */}
      <div className="space-y-0 divide-y divide-[var(--border)]/50">
        {sorted.map((advice, i) => (
          <ProfileRow
            key={advice.profileId}
            advice={advice}
            index={i}
            isAgreeing={false}
            isExpanded={expandedProfile === advice.profileId}
            onToggle={() =>
              setExpandedProfile(
                expandedProfile === advice.profileId ? null : advice.profileId,
              )
            }
            drillSolution={advice.profileId === "gto" ? drillSolution : undefined}
            drillScore={advice.profileId === "gto" ? drillScore : undefined}
          />
        ))}
      </div>
    </div>
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
  drillSolution,
  drillScore,
}: {
  advice: CoachingAdvice;
  index: number;
  isAgreeing: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  drillSolution?: SpotSolution;
  drillScore?: import("../../../convex/lib/gto/evScoring").ActionScore | null;
}) {
  const meta = getProfileMeta(advice.profileId);
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
        <Term id={`profile:${advice.profileId}`} position="bottom" className="text-[10px] font-bold text-[var(--foreground)] w-8 shrink-0">
          {meta.short}
        </Term>

        {/* Engine badge (shown for non-standard engines, e.g. lookup-gto solver) */}
        {advice.engineId !== "modified-gto" && advice.engineId !== "error" && (
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

        {/* Narrative one-liner or static description */}
        <span className="text-[10px] text-[var(--muted-foreground)] truncate flex-1 min-w-0">
          {advice.narrative?.oneLiner ?? meta.desc}
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
            <div className="border-t border-[var(--border)]/50 pt-2">
              {drillSolution ? (
                /* Drill mode: use the drill solution (includes teaching content) */
                <SolutionDisplay
                  solution={drillSolution}
                  userAction={drillScore?.userAction}
                  score={drillScore}
                />
              ) : advice.solverData ? (
                <SolutionDisplay
                  solution={solverDataToSpotSolution(advice.solverData, advice.explanation)}
                />
              ) : (
                <div className="space-y-2">
                  {/* Narrative paragraph — the character's reasoning in plain language */}
                  {advice.narrative && (
                    <div className="px-2 py-1.5 rounded bg-[var(--muted)]/20 border border-[var(--border)]/30">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[9px] font-bold text-[var(--gold-dim)] uppercase tracking-wider">
                          {advice.narrative.character.label}
                        </span>
                      </div>
                      <p className="text-[10px] text-[var(--foreground)]/70 leading-relaxed">
                        {advice.narrative.paragraph}
                      </p>
                    </div>
                  )}
                  <div className="ml-8">
                    <ExplanationTree node={advice.explanation} defaultOpen={true} />
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════
// ARCHETYPE BADGE
// ═══════════════════════════════════════════════════════

const CATEGORY_SHORT: Record<string, string> = {
  preflop: "Preflop",
  flop_texture: "Flop Texture",
  postflop_principle: "Postflop",
};

function ArchetypeBadge({
  archetype,
  onClick,
  labelFn,
}: {
  archetype: ArchetypeClassification;
  onClick?: (id: ArchetypeId) => void;
  labelFn?: (id: ArchetypeId) => string;
}) {
  const label = labelFn?.(archetype.archetypeId) ?? archetype.archetypeId.replace(/_/g, " ");
  const catLabel = CATEGORY_SHORT[archetype.category] ?? archetype.category;

  // On turn/river, show texture archetype alongside principle
  const hasTexture = archetype.textureArchetypeId && archetype.textureArchetypeId !== archetype.archetypeId;
  const textureLabel = hasTexture && labelFn
    ? labelFn(archetype.textureArchetypeId!)
    : hasTexture
      ? archetype.textureArchetypeId!.replace(/_/g, " ")
      : null;

  const lowConfidence = archetype.confidence < 0.7;

  return (
    <button
      onClick={() => onClick?.(archetype.archetypeId)}
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--gold)]/[0.06] border border-[var(--gold)]/15 hover:bg-[var(--gold)]/[0.12] hover:border-[var(--gold)]/25 transition-colors text-left w-full group"
    >
      <span className="text-[10px] font-bold text-[var(--gold)]">{label}</span>
      {textureLabel && (
        <span className="text-[9px] text-[var(--muted-foreground)]">on {textureLabel}</span>
      )}
      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--gold)]/10 text-[var(--gold-dim)] border border-[var(--gold)]/15 font-medium">
        {catLabel}
      </span>
      {lowConfidence && (
        <span className="text-[9px] text-[var(--muted-foreground)] italic">(likely)</span>
      )}
      <span className="flex-1" />
      <span className="text-[9px] text-[var(--muted-foreground)] opacity-0 group-hover:opacity-100 transition-opacity">
        Learn more
      </span>
    </button>
  );
}

// ═══════════════════════════════════════════════════════
// ACTION STORIES — what each action tells opponents
// ═══════════════════════════════════════════════════════

const ACTION_STORY_ICONS: Record<string, string> = {
  fold: "🏳️", check: "👁️", call: "📞", bet: "💰", raise: "🚀",
};

function ActionStoriesSection({ stories }: { stories: ActionStory[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-md border border-[var(--border)]/50 bg-[var(--muted)]/10 p-2.5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-left"
      >
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--gold-dim)]">
          Your Possible Stories
        </span>
        <span className="text-[10px] text-[var(--muted-foreground)]">
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 space-y-1.5">
              {stories.map((story) => {
                const colors = ACTION_COLORS[story.action] ?? ACTION_COLORS.check;
                return (
                  <div key={story.action} className="text-[10px]">
                    <div className="flex items-center gap-1.5">
                      <span className={cn(
                        "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase",
                        colors.bg, colors.text, "border", colors.border,
                      )}>
                        {story.action}
                      </span>
                      {story.amount ? (
                        <span className="text-[var(--muted-foreground)]">{story.amount} BB</span>
                      ) : null}
                    </div>
                    <p className="text-[var(--foreground)]/70 mt-0.5 pl-1 border-l-2 border-[var(--border)]/30">
                      {story.narrative}
                    </p>
                    {story.counterNarrative && (
                      <p className="text-[var(--gold-dim)]/70 text-[9px] mt-0.5 pl-1 italic">
                        {story.counterNarrative}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!expanded && (
        <p className="text-[10px] text-[var(--muted-foreground)] mt-1">
          Each action tells a different story. Tap to see what each communicates.
        </p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// OPPONENT STORY CARD
// ═══════════════════════════════════════════════════════

const CONFIDENCE_COLORS: Record<string, string> = {
  strong: "text-green-400",
  moderate: "text-yellow-400",
  speculative: "text-orange-400",
};

function OpponentStoryCard({ story }: { story: OpponentStory }) {
  const [expanded, setExpanded] = useState(false);
  const eqPct = (story.data.equityVsRange * 100).toFixed(0);
  const confColor = CONFIDENCE_COLORS[story.confidence] ?? "text-[var(--muted-foreground)]";

  return (
    <div className="rounded-md border border-[var(--border)]/50 bg-[var(--muted)]/10 p-2.5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--gold-dim)]">
            Opponent&apos;s Story
          </span>
          <span className={cn("text-[9px] font-medium", confColor)}>
            {story.confidence} read
          </span>
        </div>
        <span className="text-[10px] text-[var(--muted-foreground)]">
          Your equity: {eqPct}% {expanded ? "▲" : "▼"}
        </span>
      </button>

      {!expanded && (
        <p className="text-[10px] text-[var(--foreground)]/70 mt-1.5 leading-relaxed">
          {story.heroImplication}
        </p>
      )}

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 space-y-2">
              {/* Street-by-street narrative */}
              <div className="space-y-1">
                {story.streetNarratives.map((sn, i) => (
                  <div key={i} className="text-[10px] pl-2 border-l border-[var(--border)]/30">
                    <span className="text-[var(--muted-foreground)] uppercase text-[8px]">
                      {sn.street}
                    </span>
                    <span className="text-[var(--foreground)]/60 ml-1">{sn.action}{sn.amount ? ` ${sn.amount}` : ""}</span>
                    <p className="text-[var(--foreground)]/70">{sn.interpretation}</p>
                    <p className="text-[var(--muted-foreground)] text-[9px]">{sn.rangeUpdate}</p>
                  </div>
                ))}
              </div>

              {/* Range and implication */}
              <div className="text-[10px] text-[var(--foreground)]/70 bg-[var(--muted)]/20 rounded p-2">
                <p className="font-medium text-[var(--foreground)]/80 mb-1">{story.rangeNarrative}</p>
                <p>{story.heroImplication}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// ADAPTER: CoachingSolverData → SpotSolution
// ═══════════════════════════════════════════════════════

function solverDataToSpotSolution(
  data: NonNullable<CoachingAdvice["solverData"]>,
  explanation: CoachingAdvice["explanation"],
): SpotSolution {
  return {
    frequencies: data.frequencies,
    optimalAction: data.optimalAction,
    optimalFrequency: data.optimalFrequency,
    availableActions: data.availableActions,
    explanation,
    isExactMatch: data.isExactMatch,
    resolvedCategory: data.resolvedCategory,
    bands: data.bands,
    archetypeAccuracy: data.archetypeAccuracy,
    accuracyImpact: data.accuracyImpact,
    preflopConfidence: data.preflopConfidence,
  };
}
