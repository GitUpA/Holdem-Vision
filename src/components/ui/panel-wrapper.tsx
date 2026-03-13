"use client";

/**
 * PanelWrapper — reusable wrapper that renders children always visible
 * but visually disabled when `enabled` is false.
 *
 * Disabled state: reduced opacity + pointer-events-none + optional hint overlay.
 * The hint tells the user what mode/action would enable this panel.
 */

import type { ReactNode } from "react";

export interface PanelWrapperProps {
  /** Whether this panel is interactable */
  enabled: boolean;
  /** Hint shown as overlay when disabled (e.g. "Switch to Vision mode") */
  hint?: string;
  /** Additional CSS classes on the outer wrapper */
  className?: string;
  children: ReactNode;
}

export function PanelWrapper({
  enabled,
  hint,
  className = "",
  children,
}: PanelWrapperProps) {
  if (enabled) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div className={`relative ${className}`}>
      {/* Content rendered at reduced opacity, non-interactive */}
      <div className="opacity-40 pointer-events-none select-none">
        {children}
      </div>

      {/* Hint overlay — centered on the panel */}
      {hint && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-xs text-[var(--muted-foreground)] bg-[var(--card)]/80 px-3 py-1.5 rounded-md border border-[var(--border)] backdrop-blur-sm">
            {hint}
          </span>
        </div>
      )}
    </div>
  );
}
