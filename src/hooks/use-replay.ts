/**
 * useReplay — React hook for hand replay timeline navigation.
 */
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import type { HandRecord } from "../../convex/lib/audit/types";
import type { GameState } from "../../convex/lib/state/game-state";
import type { Street } from "../../convex/lib/types/cards";
import { buildTimeline } from "../../convex/lib/replay/buildTimeline";
import type { ReplayTimeline, ReplaySnapshot } from "../../convex/lib/replay/types";
import type { HandEvent, DecisionSnapshot } from "../../convex/lib/audit/types";

const DEFAULT_SPEED_MS = 800;

export function useReplay(record: HandRecord | null) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(DEFAULT_SPEED_MS);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Build timeline once when record changes
  const timeline: ReplayTimeline | null = useMemo(() => {
    if (!record) return null;
    try {
      return buildTimeline(record);
    } catch {
      return null;
    }
  }, [record]);

  // Reset cursor when timeline changes
  useEffect(() => {
    setCurrentIndex(0);
    setIsPlaying(false);
  }, [timeline]);

  const totalSteps = timeline?.snapshots.length ?? 0;
  const snapshot: ReplaySnapshot | null = timeline?.snapshots[currentIndex] ?? null;
  const gameState: GameState | null = snapshot?.gameState ?? null;
  const currentEvent: HandEvent | null = snapshot?.event ?? null;
  const currentDecision: DecisionSnapshot | null = snapshot?.decision ?? null;

  // ─── Navigation ───

  const stepForward = useCallback(() => {
    setCurrentIndex((i) => Math.min(i + 1, totalSteps - 1));
  }, [totalSteps]);

  const stepBack = useCallback(() => {
    setCurrentIndex((i) => Math.max(i - 1, 0));
  }, []);

  const jumpTo = useCallback(
    (index: number) => {
      setCurrentIndex(Math.max(0, Math.min(index, totalSteps - 1)));
    },
    [totalSteps],
  );

  const jumpToStreet = useCallback(
    (street: Street) => {
      if (!timeline) return;
      const marker = timeline.streetMarkers.find((m) => m.street === street);
      if (marker) setCurrentIndex(marker.snapshotIndex);
    },
    [timeline],
  );

  const nextDecision = useCallback(() => {
    if (!timeline) return;
    const next = timeline.decisionIndices.find((i) => i > currentIndex);
    if (next !== undefined) setCurrentIndex(next);
  }, [timeline, currentIndex]);

  const prevDecision = useCallback(() => {
    if (!timeline) return;
    const prev = [...timeline.decisionIndices].reverse().find((i) => i < currentIndex);
    if (prev !== undefined) setCurrentIndex(prev);
  }, [timeline, currentIndex]);

  // ─── Playback ───

  const pause = useCallback(() => {
    setIsPlaying(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const play = useCallback(() => {
    if (currentIndex >= totalSteps - 1) {
      setCurrentIndex(0); // Restart from beginning
    }
    setIsPlaying(true);
  }, [currentIndex, totalSteps]);

  const togglePlayback = useCallback(() => {
    if (isPlaying) pause();
    else play();
  }, [isPlaying, pause, play]);

  // Auto-advance interval
  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setCurrentIndex((i) => {
          if (i >= totalSteps - 1) {
            setIsPlaying(false);
            return i;
          }
          return i + 1;
        });
      }, playbackSpeed);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isPlaying, playbackSpeed, totalSteps]);

  return {
    timeline,
    currentIndex,
    snapshot,
    gameState,
    currentEvent,
    currentDecision,
    totalSteps,
    progress: totalSteps > 1 ? currentIndex / (totalSteps - 1) : 0,
    streetMarkers: timeline?.streetMarkers ?? [],
    decisionIndices: timeline?.decisionIndices ?? [],
    // Navigation
    stepForward,
    stepBack,
    jumpTo,
    jumpToStreet,
    nextDecision,
    prevDecision,
    // Playback
    isPlaying,
    play,
    pause,
    togglePlayback,
    playbackSpeed,
    setPlaybackSpeed,
  };
}
