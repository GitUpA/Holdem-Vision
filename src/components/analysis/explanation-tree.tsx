"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExplanationNode } from "../../../convex/lib/types/analysis";

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "text-[var(--equity-win)]",
  negative: "text-[var(--equity-lose)]",
  warning: "text-[var(--equity-tie)]",
  neutral: "text-[var(--muted-foreground)]",
};

const SENTIMENT_DOT: Record<string, string> = {
  positive: "bg-[var(--equity-win)]",
  negative: "bg-[var(--equity-lose)]",
  warning: "bg-[var(--equity-tie)]",
  neutral: "bg-[var(--muted-foreground)]",
};

/** Visual badges for semantic tags — only high-signal tags get rendered. */
const TAG_BADGES: Record<string, { label: string; color: string }> = {
  "bluff":       { label: "BLUFF",   color: "bg-red-500/20 text-red-300 border-red-500/30" },
  "draw-aware":  { label: "DRAW",    color: "bg-teal-500/20 text-teal-300 border-teal-500/30" },
  "mdf":         { label: "MDF",     color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  "fold-equity": { label: "FOLD EQ", color: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
  "position":    { label: "POS",     color: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
  "sizing":      { label: "SIZING",  color: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30" },
};

interface ExplanationTreeProps {
  node: ExplanationNode;
  depth?: number;
  defaultOpen?: boolean;
}

export function ExplanationTree({
  node,
  depth = 0,
  defaultOpen = true,
}: ExplanationTreeProps) {
  const hasChildren = (node.children && node.children.length > 0) ||
    (node.comparisons && node.comparisons.length > 0);
  const [isOpen, setIsOpen] = useState(defaultOpen && depth < 2);
  const sentiment = node.sentiment ?? "neutral";

  return (
    <div className={cn("select-none", depth > 0 && "ml-4 mt-1")}>
      <button
        onClick={() => hasChildren && setIsOpen(!isOpen)}
        className={cn(
          "flex items-start gap-1.5 w-full text-left group",
          hasChildren && "cursor-pointer",
          !hasChildren && "cursor-default",
        )}
      >
        {/* Expand/collapse indicator */}
        <div className="mt-1 flex-shrink-0 w-4 h-4 flex items-center justify-center">
          {hasChildren ? (
            <motion.div
              animate={{ rotate: isOpen ? 90 : 0 }}
              transition={{ duration: 0.15 }}
            >
              <ChevronRight className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
            </motion.div>
          ) : (
            <span
              className={cn(
                "w-1.5 h-1.5 rounded-full flex-shrink-0",
                SENTIMENT_DOT[sentiment],
              )}
            />
          )}
        </div>

        {/* Node content */}
        <div className="flex-1 min-w-0">
          <span
            className={cn(
              "text-sm leading-snug",
              depth === 0 ? "font-semibold text-[var(--foreground)]" : SENTIMENT_COLORS[sentiment],
              hasChildren && "group-hover:text-[var(--foreground)] transition-colors",
            )}
          >
            {node.summary}
          </span>
          {/* Tag badges */}
          {node.tags && node.tags.length > 0 && (
            <span className="inline-flex gap-1 ml-1.5 align-middle">
              {node.tags.map((tag) => {
                const badge = TAG_BADGES[tag];
                if (!badge) return null;
                return (
                  <span
                    key={tag}
                    className={cn(
                      "text-[9px] font-bold tracking-wider px-1 py-px rounded border leading-none",
                      badge.color,
                    )}
                  >
                    {badge.label}
                  </span>
                );
              })}
            </span>
          )}
          {node.detail && isOpen && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="text-xs text-[var(--muted-foreground)] mt-0.5 leading-relaxed"
            >
              {node.detail}
            </motion.p>
          )}
        </div>
      </button>

      {/* Children */}
      <AnimatePresence initial={false}>
        {isOpen && hasChildren && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-l border-[var(--border)] ml-2 pl-0">
              {node.children?.map((child, i) => (
                <ExplanationTree
                  key={`${child.summary}-${i}`}
                  node={child}
                  depth={depth + 1}
                  defaultOpen={depth < 1}
                />
              ))}
              {node.comparisons?.map((comp, i) => (
                <div key={`comp-${i}`} className="ml-4 mt-1">
                  <span className="text-xs font-medium text-[var(--gold-dim)]">
                    {comp.label}
                  </span>
                  <ExplanationTree
                    node={comp.result}
                    depth={depth + 1}
                    defaultOpen={false}
                  />
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
