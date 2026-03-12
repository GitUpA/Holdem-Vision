"use client";

/**
 * HandReplayer — composed replay viewer.
 *
 * Uses useReplay hook + HandStateViewer + TimelineScrubber + ReplayOverlay.
 */
import { useMemo } from "react";
import { motion } from "framer-motion";
import type { HandRecord } from "../../../convex/lib/audit/types";
import { useReplay } from "@/hooks/use-replay";
import { HandStateViewer } from "./hand-state-viewer";
import { TimelineScrubber } from "./timeline-scrubber";
import { ReplayOverlay } from "./replay-overlay";
import { formatBB } from "@/lib/format";

export interface HandReplayerProps {
  record: HandRecord;
  onClose: () => void;
}

export function HandReplayer({ record, onClose }: HandReplayerProps) {
  const replay = useReplay(record);
  const bigBlind = record.config.blinds.big;

  // Build event label for scrubber
  const eventLabel = useMemo(() => {
    const event = replay.currentEvent;
    if (!event) return "Initial state";
    const setup = record.seatSetup.find((s) => s.seatIndex === event.seatIndex);
    const label = setup?.profileName ?? `Seat ${event.seatIndex}`;
    const action = event.actionType.replace("_", "-");
    const amount = event.amount ? ` ${formatBB(event.amount / bigBlind)} BB` : "";
    return `${label}: ${action}${amount}`;
  }, [replay.currentEvent, record.seatSetup, bigBlind]);

  // Seat label for overlay
  const seatLabel = useMemo(() => {
    if (!replay.currentEvent) return undefined;
    const setup = record.seatSetup.find((s) => s.seatIndex === replay.currentEvent!.seatIndex);
    return setup?.profileName ?? `Seat ${replay.currentEvent.seatIndex}`;
  }, [replay.currentEvent, record.seatSetup]);

  if (!replay.timeline || !replay.gameState) {
    return (
      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6 text-center">
        <p className="text-sm text-[var(--muted-foreground)]">
          Unable to build replay timeline
        </p>
        <button
          onClick={onClose}
          className="mt-3 text-xs text-[var(--gold-dim)] hover:text-[var(--gold)] transition-colors"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--gold-dim)]">
          Hand Replay
        </h2>
        <button
          onClick={onClose}
          className="text-xs px-3 py-1.5 rounded border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--gold)] hover:border-[var(--gold-dim)]/40 transition-colors"
        >
          Close
        </button>
      </div>

      {/* Game state display */}
      <HandStateViewer
        gameState={replay.gameState}
        heroSeatIndex={record.config.heroSeatIndex}
        bigBlind={bigBlind}
        seatSetup={record.seatSetup}
        showAllCards={true}
      />

      {/* Timeline scrubber */}
      <TimelineScrubber
        currentIndex={replay.currentIndex}
        totalSteps={replay.totalSteps}
        progress={replay.progress}
        streetMarkers={replay.streetMarkers}
        decisionIndices={replay.decisionIndices}
        isPlaying={replay.isPlaying}
        eventLabel={eventLabel}
        onStepBack={replay.stepBack}
        onStepForward={replay.stepForward}
        onTogglePlayback={replay.togglePlayback}
        onJumpTo={replay.jumpTo}
        onJumpToStreet={replay.jumpToStreet}
      />

      {/* Action + reasoning overlay */}
      <ReplayOverlay
        event={replay.currentEvent}
        decision={replay.currentDecision}
        bigBlind={bigBlind}
        seatLabel={seatLabel}
      />
    </motion.div>
  );
}
