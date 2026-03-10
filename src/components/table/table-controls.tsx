"use client";

import { cn } from "@/lib/utils";

interface TableControlsProps {
  numPlayers: number;
  onNumPlayersChange: (n: number) => void;
  onRotateDealer: () => void;
  onReset: () => void;
}

export function TableControls({
  numPlayers,
  onNumPlayersChange,
  onRotateDealer,
  onReset,
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
            disabled={numPlayers <= 2}
            className={cn(
              "px-2 py-1 text-xs font-medium transition-colors rounded-l-md",
              numPlayers <= 2
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
            disabled={numPlayers >= 10}
            className={cn(
              "px-2 py-1 text-xs font-medium transition-colors rounded-r-md",
              numPlayers >= 10
                ? "text-[var(--muted-foreground)]/40 cursor-not-allowed"
                : "text-[var(--foreground)] hover:bg-[var(--accent)]",
            )}
          >
            +
          </button>
        </div>
      </div>

      {/* Rotate dealer */}
      <button
        onClick={onRotateDealer}
        className="text-xs px-2.5 py-1 rounded-md bg-[var(--muted)]/50 border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors"
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
