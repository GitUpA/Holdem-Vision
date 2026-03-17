"use client";

/**
 * Term — inline poker term with knowledge-powered tooltip.
 *
 * Wraps any poker term text and shows its knowledge base definition on hover.
 * Falls back to plain text if no knowledge entry exists.
 *
 * Usage:
 *   <Term id="term:mdf">MDF</Term>
 *   <Term id="term:oesd" position="bottom">OESD</Term>
 *
 * TermTip — icon variant (like InfoTip but knowledge-powered).
 *
 * Usage:
 *   <TermTip id="concept:gto" />
 */

import type { ReactNode } from "react";
import { Tooltip, InfoIcon, type TooltipPosition } from "./tooltip";
import { getKnowledge } from "../../../convex/lib/knowledge";
import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════════════════
// TERM — inline text with knowledge tooltip
// ═══════════════════════════════════════════════════════

interface TermProps {
  /** Knowledge entry ID (e.g., "term:mdf", "concept:gto") */
  id: string;
  /** The visible text */
  children: ReactNode;
  /** Tooltip position (default: top) */
  position?: TooltipPosition;
  /** Additional className */
  className?: string;
}

export function Term({ id, children, position = "top", className }: TermProps) {
  const entry = getKnowledge(id);

  // No entry → render plain text, no tooltip
  if (!entry) {
    return <span className={className}>{children}</span>;
  }

  return (
    <Tooltip
      content={
        <span>
          <span className="font-medium text-[var(--gold)]">{entry.name}</span>
          <br />
          {entry.medium}
        </span>
      }
      position={position}
      maxWidth={320}
    >
      <span
        className={cn(
          "border-b border-dashed border-[var(--muted-foreground)]/30 cursor-help",
          className,
        )}
      >
        {children}
      </span>
    </Tooltip>
  );
}

// ═══════════════════════════════════════════════════════
// TERM TIP — icon with knowledge tooltip (replaces InfoTip)
// ═══════════════════════════════════════════════════════

interface TermTipProps {
  /** Knowledge entry ID */
  id: string;
  /** Tooltip position (default: top) */
  position?: TooltipPosition;
  /** Additional className */
  className?: string;
}

export function TermTip({ id, position = "top", className }: TermTipProps) {
  const entry = getKnowledge(id);
  if (!entry) return null;

  return (
    <Tooltip
      content={
        <span>
          <span className="font-medium text-[var(--gold)]">{entry.name}</span>
          <br />
          {entry.medium}
        </span>
      }
      position={position}
      maxWidth={320}
    >
      <span
        className={cn(
          "inline-flex cursor-help opacity-50 hover:opacity-100 transition-opacity",
          className,
        )}
      >
        <InfoIcon />
      </span>
    </Tooltip>
  );
}
