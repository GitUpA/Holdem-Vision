/**
 * HandSession configuration and callback types.
 * Pure TypeScript — no React, no Convex imports.
 */
import type { BlindStructure } from "../types/game";
import type { OpponentProfile } from "../types/opponents";
import type { HandRecord } from "../audit/types";

// ═══════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════

export interface HandSessionConfig {
  numPlayers: number;
  dealerSeatIndex: number;
  heroSeatIndex: number;
  blinds: BlindStructure;
  startingStack: number;
  /** Pre-assigned profiles per villain seat. Missing seats get random defaults. */
  seatProfiles: Map<number, OpponentProfile>;
  /** Deterministic seed for shuffle + engine decisions. Defaults to Date.now(). */
  seed?: number;
  /** Injectable RNG for deterministic tests. */
  random?: () => number;
  /** Verbose audit recording (includes full explanation trees). */
  verbose?: boolean;
}

// ═══════════════════════════════════════════════════════
// CALLBACKS
// ═══════════════════════════════════════════════════════

export interface HandSessionCallbacks {
  /** Called when a hand finishes with the finalized HandRecord. */
  onHandComplete?: (record: HandRecord) => void;
  /** Called after every state mutation — the hook uses this to trigger re-render. */
  onStateChange?: () => void;
}
