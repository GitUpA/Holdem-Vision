"use client";

import { cn } from "@/lib/utils";

interface TableControlsProps {
  numPlayers: number;
  onNumPlayersChange: (n: number) => void;
  onRotateDealer: () => void;
  onReset: () => void;
  /** When true, disables controls that would conflict with an in-progress hand */
  isHandActive?: boolean;
}

export function TableControls({
  numPlayers,
  onNumPlayersChange,
  onRotateDealer,
  onReset,
  isHandActive = false,
}: TableControlsProps) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Player count */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-[var(--muted-foreground)] font-medium">
          Players
        </span>
        <div className="flex items-center bg-[var(--muted)]/50 rounded-md border border-[var(--border)]">
          <button
            onClick={() => onNumPlayersChange(numPlayers - 1)}
            disabled={numPlayers <= 2 || isHandActive}
            className={cn(
              "px-2 py-1 text-xs font-medium transition-colors rounded-l-md",
              numPlayers <= 2 || isHandActive
                ? "text-[var(--muted-foreground)]/40 cursor-not-allowed"
                : "text-[var(--foreground)] hover:bg-[var(--accent)]",
            )}
          >
            -
          </button>
          <span className="px-2 py-1 text-xs font-bold text-[var(--foreground)] min-w-[24px] text-center tabular-nums">
            {numPlayers}
          </span>
          <button
            onClick={() => onNumPlayersChange(numPlayers + 1)}
            disabled={numPlayers >= 10 || isHandActive}
            className={cn(
              "px-2 py-1 text-xs font-medium transition-colors rounded-r-md",
              numPlayers >= 10 || isHandActive
                ? "text-[var(--muted-foreground)]/40 cursor-not-allowed"
                : "text-[var(--foreground)] hover:bg-[var(--accent)]",
            )}
          >
            +
          </button>
        </div>
      </div>

      {/* Rotate dealer — disabled mid-hand since positions are locked at deal time */}
      <button
        onClick={onRotateDealer}
        disabled={isHandActive}
        className={cn(
          "text-xs px-2.5 py-1 rounded-md bg-[var(--muted)]/50 border border-[var(--border)] transition-colors",
          isHandActive
            ? "text-[var(--muted-foreground)]/40 cursor-not-allowed"
            : "text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)]",
        )}
      >
        Rotate Dealer
      </button>

      {/* Reset */}
      <button
        onClick={onReset}
        className="text-xs px-2.5 py-1 rounded-md bg-[var(--muted)]/50 border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--destructive)] hover:border-[var(--destructive)]/30 transition-colors"
      >
        Reset Table
      </button>
    </div>
  );
}
