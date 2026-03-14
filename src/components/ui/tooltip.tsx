"use client";

/**
 * Tooltip — a lightweight, reusable tooltip component.
 *
 * Pure CSS + React state. No external dependencies beyond React.
 * Supports positioning (top, bottom, left, right) and optional delay.
 *
 * Usage:
 *   <Tooltip content="Explanation text here">
 *     <span>ⓘ</span>
 *   </Tooltip>
 *
 *   <InfoTip text="What this section means" />
 */
import { useState, useRef, useCallback, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════════════════
// TOOLTIP
// ═══════════════════════════════════════════════════════

export type TooltipPosition = "top" | "bottom" | "left" | "right";

interface TooltipProps {
  /** The tooltip content — string or JSX */
  content: ReactNode;
  /** Positioning relative to the trigger element */
  position?: TooltipPosition;
  /** Delay in ms before showing (default: 200) */
  delay?: number;
  /** Max width of tooltip (default: 280px) */
  maxWidth?: number;
  /** The trigger element(s) */
  children: ReactNode;
  /** Additional className on the wrapper */
  className?: string;
}

const POSITION_CLASSES: Record<TooltipPosition, string> = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-1.5",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-1.5",
  left: "right-full top-1/2 -translate-y-1/2 mr-1.5",
  right: "left-full top-1/2 -translate-y-1/2 ml-1.5",
};

const ARROW_CLASSES: Record<TooltipPosition, string> = {
  top: "top-full left-1/2 -translate-x-1/2 border-t-[var(--card-foreground)]/90 border-x-transparent border-b-transparent",
  bottom: "bottom-full left-1/2 -translate-x-1/2 border-b-[var(--card-foreground)]/90 border-x-transparent border-t-transparent",
  left: "left-full top-1/2 -translate-y-1/2 border-l-[var(--card-foreground)]/90 border-y-transparent border-r-transparent",
  right: "right-full top-1/2 -translate-y-1/2 border-r-[var(--card-foreground)]/90 border-y-transparent border-l-transparent",
};

export function Tooltip({
  content,
  position = "top",
  delay = 200,
  maxWidth = 280,
  children,
  className,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    timeoutRef.current = setTimeout(() => setVisible(true), delay);
  }, [delay]);

  const hide = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setVisible(false);
  }, []);

  return (
    <span
      className={cn("relative inline-flex", className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {visible && (
        <span
          role="tooltip"
          className={cn(
            "absolute z-50 px-2.5 py-1.5 rounded-md",
            "bg-[var(--card)] border border-[var(--border)]",
            "text-[10px] leading-relaxed text-[var(--foreground)]/90",
            "shadow-lg shadow-black/30",
            "pointer-events-none",
            "animate-in fade-in-0 zoom-in-95 duration-150",
            POSITION_CLASSES[position],
          )}
          style={{ maxWidth, width: "max-content" }}
        >
          {content}
          {/* Arrow */}
          <span
            className={cn(
              "absolute w-0 h-0 border-4",
              ARROW_CLASSES[position],
            )}
          />
        </span>
      )}
    </span>
  );
}

// ═══════════════════════════════════════════════════════
// SVG ICON HELPER
// ═══════════════════════════════════════════════════════

function TipIcon({ children, size = 12 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

// ═══════════════════════════════════════════════════════
// PRESET ICONS (lucide-style, matching analysis lens icons)
// ═══════════════════════════════════════════════════════

/** Info circle — general information */
export function InfoIcon({ size = 12 }: { size?: number }) {
  return (
    <TipIcon size={size}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </TipIcon>
  );
}

/** Lightbulb — key insight / principle */
export function InsightIcon({ size = 12 }: { size?: number }) {
  return (
    <TipIcon size={size}>
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
    </TipIcon>
  );
}

/** Message circle — coach's voice / feeling */
export function CoachIcon({ size = 12 }: { size?: number }) {
  return (
    <TipIcon size={size}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </TipIcon>
  );
}

/** Alert triangle — common mistake / warning */
export function WarningIcon({ size = 12 }: { size?: number }) {
  return (
    <TipIcon size={size}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </TipIcon>
  );
}

// ═══════════════════════════════════════════════════════
// INFO TIP — convenience wrapper
// ═══════════════════════════════════════════════════════

type InfoTipVariant = "info" | "insight" | "coach" | "warning";

const VARIANT_ICON: Record<InfoTipVariant, ReactNode> = {
  info: <InfoIcon />,
  insight: <InsightIcon />,
  coach: <CoachIcon />,
  warning: <WarningIcon />,
};

interface InfoTipProps {
  /** The tooltip explanation text */
  text: string;
  /** Preset icon variant (default: info) */
  variant?: InfoTipVariant;
  /** Custom icon — overrides variant */
  icon?: ReactNode;
  /** Tooltip position (default: top) */
  position?: TooltipPosition;
  /** Additional className on the wrapper */
  className?: string;
}

/**
 * A small icon with a hover tooltip. Uses lucide-style SVG icons
 * matching the analysis lens icon style.
 *
 * Usage:
 *   <InfoTip text="Explanation" />
 *   <InfoTip text="Key concept" variant="insight" />
 *   <InfoTip text="Coach's voice" variant="coach" />
 *   <InfoTip text="Watch out" variant="warning" className="text-orange-400" />
 */
export function InfoTip({
  text,
  variant = "info",
  icon,
  position = "top",
  className,
}: InfoTipProps) {
  return (
    <Tooltip content={text} position={position}>
      <span
        className={cn(
          "inline-flex cursor-help opacity-50 hover:opacity-100 transition-opacity",
          className,
        )}
      >
        {icon ?? VARIANT_ICON[variant]}
      </span>
    </Tooltip>
  );
}
