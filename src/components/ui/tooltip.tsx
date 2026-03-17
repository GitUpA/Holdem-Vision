"use client";

/**
 * Tooltip — a lightweight, reusable tooltip component.
 *
 * Uses a portal to render at document.body level, avoiding overflow clipping
 * from parent containers. Position is calculated from the trigger's bounding rect.
 *
 * Usage:
 *   <Tooltip content="Explanation text here">
 *     <span>ⓘ</span>
 *   </Tooltip>
 *
 *   <InfoTip text="What this section means" />
 */
import { useState, useRef, useCallback, useLayoutEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
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

const GAP = 6; // px between trigger and tooltip

export function Tooltip({
  content,
  position = "top",
  delay = 200,
  maxWidth = 280,
  children,
  className,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);

  const show = useCallback(() => {
    timeoutRef.current = setTimeout(() => setVisible(true), delay);
  }, [delay]);

  const hide = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setVisible(false);
    setCoords(null);
  }, []);

  // Calculate position after tooltip is rendered so we know its size
  useLayoutEffect(() => {
    if (!visible || !triggerRef.current || !tooltipRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();

    let top = 0;
    let left = 0;

    switch (position) {
      case "top":
        top = triggerRect.top - tooltipRect.height - GAP;
        left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
        break;
      case "bottom":
        top = triggerRect.bottom + GAP;
        left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
        break;
      case "left":
        top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
        left = triggerRect.left - tooltipRect.width - GAP;
        break;
      case "right":
        top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
        left = triggerRect.right + GAP;
        break;
    }

    // Clamp to viewport edges with 8px padding
    const pad = 8;
    left = Math.max(pad, Math.min(left, window.innerWidth - tooltipRect.width - pad));
    top = Math.max(pad, Math.min(top, window.innerHeight - tooltipRect.height - pad));

    setCoords({ top, left });
  }, [visible, position]);

  return (
    <span
      ref={triggerRef}
      className={cn("inline-flex", className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {visible &&
        createPortal(
          <span
            ref={tooltipRef}
            role="tooltip"
            className={cn(
              "fixed z-[9999] px-2.5 py-1.5 rounded-md",
              "bg-[var(--card)] border border-[var(--border)]",
              "text-[10px] leading-relaxed text-[var(--foreground)]/90",
              "shadow-lg shadow-black/30",
              "pointer-events-none",
              // Only animate once positioned to avoid flash at (0,0)
              coords
                ? "opacity-100 scale-100"
                : "opacity-0 scale-95",
              "transition-[opacity,transform] duration-150",
            )}
            style={{
              maxWidth,
              width: "max-content",
              top: coords?.top ?? -9999,
              left: coords?.left ?? -9999,
            }}
          >
            {content}
          </span>,
          document.body,
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
