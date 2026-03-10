/**
 * Game types — used when the game engine is added (Phase 6+).
 * Defined now for schema foresight and AnalysisContext compatibility.
 */

export type { Street, Position } from "./cards";

export interface BlindStructure {
  small: number;
  big: number;
  ante?: number;
}

export interface TournamentContext {
  payoutStructure: number[];
  remainingPlayers: number;
  averageStack: number;
}
