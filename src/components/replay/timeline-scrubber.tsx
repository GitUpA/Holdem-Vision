"use client";

/**
 * TimelineScrubber — progress bar + navigation controls for hand replay.
 */
import { cn } from "@/lib/utils";
import type { Street } from "../../../convex/lib/types/cards";

const STREET_LABELS: Record<Street, string> = {
  preflop: "Pre",
  flop: "Flop",
  turn: "Turn",
  river: "River",
};

const ACTION_LABELS: Record<string, string> = {
  fold: "Fold",
  check: "Check",
  call: "Call",
  bet: "Bet",
  raise: "Raise",
  all_in: "All-In",
};

export interface TimelineScrubberProps {
  currentIndex: number;
  totalSteps: number;
  progress: number;
  streetMarkers: { street: Street; snapshotIndex: number }[];
  decisionIndices: number[];
  isPlaying: boolean;
  /** Label for current event (e.g. "Seat 1: Call 2 BB") */
  eventLabel?: string;
  onStepBack: () => void;
  onStepForward: () => void;
  onTogglePlayback: () => void;
  onJumpTo: (index: number) => void;
  onJumpToStreet: (street: Street) => void;
}

export function TimelineScrubber({
  currentIndex,
  totalSteps,
  progress,
  streetMarkers,
  decisionIndices,
  isPlaying,
  eventLabel,
  onStepBack,
  onStepForward,
  onTogglePlayback,
  onJumpTo,
  onJumpToStreet,
}: TimelineScrubberProps) {
  return (
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
      <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--muted)]/30">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--gold-dim)]">
          Timeline
        </h3>
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Progress bar with markers */}
        <div className="relative h-6">
          {/* Track */}
          <div
            className="absolute top-2.5 left-0 right-0 h-1 rounded-full bg-[var(--border)] cursor-pointer"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              onJumpTo(Math.round(pct * (totalSteps - 1)));
            }}
          >
            {/* Fill */}
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-[var(--gold)]"
              style={{ width: `${progress * 100}%` }}
            />
          </div>

          {/* Street markers */}
          {streetMarkers.map((m) => {
            const pct = totalSteps > 1 ? (m.snapshotIndex / (totalSteps - 1)) * 100 : 0;
            return (
              <button
                key={m.street}
                onClick={() => onJumpToStreet(m.street)}
                className="absolute top-0 -translate-x-1/2 w-3 h-3 rounded-full border-2 border-[var(--gold-dim)] bg-[var(--card)] hover:bg-[var(--gold)]/20 transition-colors z-10"
                style={{ left: `${pct}%` }}
                title={STREET_LABELS[m.street]}
              />
            );
          })}

          {/* Decision dots */}
          {decisionIndices.map((idx) => {
            const pct = totalSteps > 1 ? (idx / (totalSteps - 1)) * 100 : 0;
            return (
              <button
                key={idx}
                onClick={() => onJumpTo(idx)}
                className="absolute top-1.5 -translate-x-0.5 w-1.5 h-1.5 rounded-full bg-blue-400/60 hover:bg-blue-400 transition-colors z-10"
                style={{ left: `${pct}%` }}
                title="Engine decision"
              />
            );
          })}

          {/* Playhead */}
          <div
            className="absolute top-0.5 -translate-x-1/2 w-2 h-5 rounded-sm bg-[var(--gold)] z-20"
            style={{ left: `${progress * 100}%` }}
          />
        </div>

        {/* Controls row */}
        <div className="flex items-center justify-between gap-2">
          {/* Street jump buttons */}
          <div className="flex items-center gap-1">
            {(["preflop", "flop", "turn", "river"] as const).map((s) => {
              const marker = streetMarkers.find((m) => m.street === s);
              const isActive = marker && currentIndex >= marker.snapshotIndex;
              return (
                <button
                  key={s}
                  onClick={() => onJumpToStreet(s)}
                  disabled={!marker}
                  className={cn(
                    "text-[10px] font-bold uppercase px-2 py-0.5 rounded-full transition-colors",
                    marker
                      ? isActive
                        ? "bg-[var(--felt)] text-[var(--gold)] border border-[var(--gold-dim)]/40"
                        : "text-[var(--muted-foreground)] hover:text-[var(--gold-dim)] border border-transparent"
                      : "text-[var(--muted-foreground)]/30 cursor-not-allowed",
                  )}
                >
                  {STREET_LABELS[s]}
                </button>
              );
            })}
          </div>

          {/* Playback controls */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={onStepBack}
              disabled={currentIndex <= 0}
              className="w-7 h-7 rounded border border-[var(--border)] flex items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--gold)] hover:border-[var(--gold-dim)]/40 transition-colors disabled:opacity-30"
              title="Step back"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
            </button>
            <button
              onClick={onTogglePlayback}
              className="w-8 h-8 rounded-full bg-[var(--felt)] border border-[var(--gold-dim)]/40 flex items-center justify-center text-[var(--gold)] hover:border-[var(--gold)]/60 transition-colors"
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              )}
            </button>
            <button
              onClick={onStepForward}
              disabled={currentIndex >= totalSteps - 1}
              className="w-7 h-7 rounded border border-[var(--border)] flex items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--gold)] hover:border-[var(--gold-dim)]/40 transition-colors disabled:opacity-30"
              title="Step forward"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
            </button>
          </div>

          {/* Step counter */}
          <span className="text-[10px] text-[var(--muted-foreground)] tabular-nums min-w-[50px] text-right">
            {currentIndex + 1} / {totalSteps}
          </span>
        </div>

        {/* Event label */}
        {eventLabel && (
          <div className="text-xs text-[var(--muted-foreground)] text-center truncate">
            {eventLabel}
          </div>
        )}
      </div>
    </div>
  );
}
