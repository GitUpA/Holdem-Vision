/**
 * Hand Trace Runner — plays a full hand from deal to showdown,
 * capturing every decision at every street for every seat.
 *
 * Produces a structured trace that can be analyzed separately
 * by a human or analysis agent against the narrative framework.
 *
 * This is the DATA CAPTURE step. Analysis is a separate process.
 *
 * Pure TypeScript, zero React, zero Convex.
 */

import type { ArchetypeId } from "../../convex/lib/gto/archetypeClassifier";
import type { ActionFrequencies } from "../../convex/lib/gto/tables/types";
import type { Street } from "../../convex/lib/types/cards";
import type { GameState, ActionType, GamePhase } from "../../convex/lib/state/gameState";
import type { OpponentProfile } from "../../convex/lib/types/opponents";
import { createDrillSession, computeSolution } from "../../convex/lib/gto/drillPipeline";
import { dealForArchetype, type DrillConstraints } from "../../convex/lib/gto/constrainedDealer";
import { analyzeBoard } from "../../convex/lib/opponents/engines/boardTexture";
import { chooseActionFromProfile } from "../../convex/lib/opponents/autoPlay";
import { currentLegalActions, applyAction } from "../../convex/lib/state/stateMachine";
import { PRESET_PROFILES } from "../../convex/lib/opponents/presets";
import { cardToString } from "../../convex/lib/primitives/card";
import { positionForSeat } from "../../convex/lib/primitives/position";
import type { CardIndex } from "../../convex/lib/types/cards";
import { coachingLens } from "../../convex/lib/analysis/coachingLens";
import type { CoachingValue } from "../../convex/lib/analysis/coachingLens";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export interface HandTraceConfig {
  archetypeId: ArchetypeId;
  seed: number;
  /** Which seat is "hero" for narrative analysis (default: from deal) */
  heroProfile?: string;  // "gto" | "nit" | "fish" | "tag" | "lag"
}

/** One decision by one player */
export interface DecisionTrace {
  seatIndex: number;
  position: string;
  playerLabel: string;       // "Hero" or "V2", "V3", etc.
  profileId: string;         // "gto", "nit", "tag", etc.
  profileName: string;       // "GTO (Balanced)", "Nit", etc.

  // What they saw
  holeCards: string[];
  communityCards: string[];
  street: Street;
  potBB: number;
  stackBB: number;
  facingBetBB: number;       // 0 if no bet to call

  // What they decided
  action: ActionType;
  amountBB?: number;
  situationKey: string;

  // Why (narrative)
  narrativeOneLiner: string;
  narrativeParagraph: string;
  characterLabel: string;

  // Engine reasoning
  explanationSummary: string;
  gtoBaseFrequencies?: ActionFrequencies;
  modifiedFrequencies?: ActionFrequencies;
  gtoSource?: string;        // "solver" | "heuristic"
  handStrength?: number;
  handDescription?: string;
  boardWetness?: number;
  potOdds?: number;
  foldEquity?: number;
  spr?: number;
  isInPosition?: boolean;
  modifierIntensity?: number;
  effectiveFoldScale?: number;
  effectiveAggressionScale?: number;
}

/** All decisions on one street */
export interface StreetTrace {
  street: Street;
  communityCards: string[];
  boardNarrative?: {
    headline: string;
    context: string;
    question: string;
  };
  boardTexture?: {
    wetness: number;
    description: string;
  };
  decisions: DecisionTrace[];
  potAtEnd: number;
}

/** GTO coaching analysis at hero's decision point */
export interface CoachingTrace {
  street: Street;
  heroSeatIndex: number;
  profiles: {
    name: string;
    action: string;
    amount?: number;
    narrativeOneLiner?: string;
    characterLabel?: string;
  }[];
  solverFrequencies?: ActionFrequencies;
  solverOptimalAction?: string;
}

/** The full hand trace */
export interface HandTrace {
  config: HandTraceConfig;
  timestamp: string;

  // Setup
  numPlayers: number;
  heroSeatIndex: number;
  heroCards: string[];
  dealerSeatIndex: number;
  archetypeId: string;
  archetypeDescription: string;

  // Per-seat profiles
  seatProfiles: {
    seatIndex: number;
    position: string;
    label: string;
    profileId: string;
    profileName: string;
    startingStackBB: number;
    holeCards: string[];
  }[];

  // Street-by-street trace
  streets: StreetTrace[];

  // Coaching at hero's decision point(s)
  coaching: CoachingTrace[];

  // GTO solution for the target decision point (if hand reaches it)
  solution?: {
    frequencies: ActionFrequencies;
    optimalAction: string;
    optimalFrequency: number;
    resolvedCategory: string;
    isExactMatch: boolean;
  };

  // Target archetype info
  targetStreet: string;

  // Outcome
  outcome: {
    phase: GamePhase;
    finalPotBB: number;
    reachedTargetStreet: boolean;
    winners?: string[];  // seat labels that won
  };

  // Flags for analysis
  flags: string[];
}

// ═══════════════════════════════════════════════════════
// SEEDED RNG
// ═══════════════════════════════════════════════════════

function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

function cards(indices: CardIndex[]): string[] {
  return indices.map((c) => cardToString(c));
}

function seatLabel(seatIndex: number, heroSeat: number): string {
  return seatIndex === heroSeat ? "Hero" : `V${seatIndex + 1}`;
}

function bbAmount(chips: number, bb: number): number {
  return bb > 0 ? chips / bb : chips;
}

// ═══════════════════════════════════════════════════════
// ASSIGN PROFILES
// ═══════════════════════════════════════════════════════

function assignProfiles(numPlayers: number, heroSeat: number): Map<number, OpponentProfile> {
  const profiles = new Map<number, OpponentProfile>();
  const presets = [
    PRESET_PROFILES.tag,
    PRESET_PROFILES.nit,
    PRESET_PROFILES.fish,
    PRESET_PROFILES.lag,
    PRESET_PROFILES.gto,
  ];
  for (let i = 0; i < numPlayers; i++) {
    if (i === heroSeat) {
      profiles.set(i, PRESET_PROFILES.gto);
    } else {
      profiles.set(i, presets[i % presets.length]);
    }
  }
  return profiles;
}

// ═══════════════════════════════════════════════════════
// MAIN RUNNER
// ═══════════════════════════════════════════════════════

export function traceHand(config: HandTraceConfig): HandTrace {
  const rng = seededRng(config.seed);
  const flags: string[] = [];

  // ── Deal (constrained for archetype, but DON'T auto-advance) ──
  const deal = dealForArchetype({ archetypeId: config.archetypeId } as DrillConstraints, rng);
  const session = createDrillSession(deal);

  // Start the hand — posts blinds, deals cards, but no actions yet
  session.startHand(undefined, deal.cardOverrides, deal.communityCards);

  const initialState = session.state;
  if (!initialState) throw new Error("No state after startHand");
  let state: GameState = initialState;

  const bb = state.blinds.big;
  const heroSeat = deal.heroSeatIndex;
  const profiles = assignProfiles(deal.numPlayers, heroSeat);

  // ── Seat profiles ──
  const seatProfiles = state.players.map((p, i) => {
    const profile = profiles.get(i)!;
    return {
      seatIndex: i,
      position: positionForSeat(i, state.dealerSeatIndex, state.numPlayers),
      label: seatLabel(i, heroSeat),
      profileId: profile.id,
      profileName: profile.name,
      startingStackBB: bbAmount(p.currentStack + p.totalCommitted, bb),
      holeCards: cards(p.holeCards),
    };
  });

  // ── Play the hand street by street ──
  const streets: StreetTrace[] = [];
  const coaching: CoachingTrace[] = [];
  let lastStreet: Street = "preflop";
  let currentStreetDecisions: DecisionTrace[] = [];
  let maxActions = 100; // safety valve

  while (state.phase !== "complete" && state.phase !== "showdown" && maxActions > 0) {
    maxActions--;

    // Detect street change
    if (state.currentStreet !== lastStreet) {
      // Save previous street
      streets.push(buildStreetTrace(lastStreet, state, currentStreetDecisions, deal.communityCards, heroSeat, bb));
      currentStreetDecisions = [];
      lastStreet = state.currentStreet;
    }

    // Get legal actions for active player
    const legal = currentLegalActions(state);
    if (!legal || state.activePlayerIndex === null) {
      // No action possible — might be dealing or showdown
      // Try to advance
      // No active player — hand is over or between streets
      break;
    }

    const actingSeat = state.activePlayerIndex;
    const profile = profiles.get(actingSeat)!;
    const isHero = actingSeat === heroSeat;

    // ── Capture coaching at hero's decision point ──
    if (isHero) {
      try {
        const coachResult = coachingLens.analyze({
          heroCards: deal.heroCards,
          heroSeatIndex: heroSeat,
          communityCards: state.communityCards,
          deadCards: [],
          opponents: [],
          street: state.currentStreet,
          gameState: state,
        });
        const cv = coachResult.value as CoachingValue | undefined;
        if (cv) {
          coaching.push({
            street: state.currentStreet,
            heroSeatIndex: heroSeat,
            profiles: cv.advices.map((a) => ({
              name: a.profileName,
              action: a.actionType,
              amount: a.amount,
              narrativeOneLiner: a.narrative?.oneLiner,
              characterLabel: a.narrative?.character?.label,
            })),
            solverFrequencies: cv.advices.find((a) => a.profileName === "GTO")?.solverData?.frequencies,
            solverOptimalAction: cv.advices.find((a) => a.profileName === "GTO")?.solverData?.optimalAction,
          });
        }
      } catch {
        flags.push("COACHING_ERROR:" + state.currentStreet);
      }
    }

    // ── Make decision ──
    const decision = chooseActionFromProfile(
      state,
      actingSeat,
      profile,
      legal,
      () => undefined,
      rng,
      profiles,
    );

    // ── Capture decision trace ──
    const player = state.players[actingSeat];
    const trace: DecisionTrace = {
      seatIndex: actingSeat,
      position: positionForSeat(actingSeat, state.dealerSeatIndex, state.numPlayers),
      playerLabel: seatLabel(actingSeat, heroSeat),
      profileId: profile.id,
      profileName: profile.name,
      holeCards: cards(player.holeCards),
      communityCards: cards(state.communityCards),
      street: state.currentStreet,
      potBB: bbAmount(state.pot.total, bb),
      stackBB: bbAmount(player.currentStack, bb),
      facingBetBB: bbAmount(legal.callAmount, bb),
      action: decision.actionType,
      amountBB: decision.amount ? bbAmount(decision.amount, bb) : undefined,
      situationKey: decision.situationKey,
      narrativeOneLiner: decision.narrative?.oneLiner ?? decision.explanation?.substring(0, 100) ?? "",
      narrativeParagraph: decision.narrative?.paragraph ?? "",
      characterLabel: decision.narrative?.character?.label ?? "",
      explanationSummary: decision.explanationNode?.summary ?? decision.explanation ?? "",
      gtoBaseFrequencies: decision.reasoning?.gtoBaseFrequencies as ActionFrequencies | undefined,
      modifiedFrequencies: decision.reasoning?.frequencies as ActionFrequencies | undefined,
      gtoSource: decision.reasoning?.gtoSource as string | undefined,
      handStrength: decision.reasoning?.handStrength as number | undefined,
      handDescription: decision.reasoning?.handDescription as string | undefined,
      boardWetness: decision.reasoning?.boardWetness as number | undefined,
      potOdds: decision.reasoning?.potOdds as number | undefined,
      foldEquity: decision.reasoning?.foldEquity as number | undefined,
      spr: decision.reasoning?.spr as number | undefined,
      isInPosition: decision.reasoning?.isInPosition as boolean | undefined,
      modifierIntensity: decision.reasoning?.modifierIntensity as number | undefined,
      effectiveFoldScale: decision.reasoning?.effectiveFoldScale as number | undefined,
      effectiveAggressionScale: decision.reasoning?.effectiveAggressionScale as number | undefined,
    };
    currentStreetDecisions.push(trace);

    // ── Apply action to state ──
    try {
      const result = applyAction(state, actingSeat, decision.actionType, decision.amount);
      state = result.state;
    } catch (_err) {
      flags.push(`ACTION_ERROR:${seatLabel(actingSeat, heroSeat)}_${decision.actionType}_${state.currentStreet}`);
      break;
    }
  }

  // Save final street
  if (currentStreetDecisions.length > 0) {
    streets.push(buildStreetTrace(lastStreet, state, currentStreetDecisions, state.communityCards, heroSeat, bb));
  }

  if (maxActions <= 0) {
    flags.push("MAX_ACTIONS_REACHED");
  }

  // Compute target street and solution
  const targetStreet = deal.communityCards.length === 0 ? "preflop"
    : deal.communityCards.length <= 3 ? "flop"
    : deal.communityCards.length === 4 ? "turn" : "river";

  const reachedTargetStreet = streets.some((s) => s.street === targetStreet);
  if (!reachedTargetStreet && deal.archetype.category !== "preflop") {
    flags.push(`ENDED_BEFORE_TARGET:${targetStreet}`);
  }

  // GTO solution for the target spot
  let solutionData: HandTrace["solution"];
  try {
    const solution = computeSolution(deal);
    if (solution) {
      solutionData = {
        frequencies: solution.frequencies,
        optimalAction: solution.optimalAction,
        optimalFrequency: solution.optimalFrequency,
        resolvedCategory: solution.resolvedCategory,
        isExactMatch: solution.isExactMatch,
      };
    }
  } catch (_err) {
    flags.push("SOLUTION_ERROR");
  }

  return {
    config,
    timestamp: new Date().toISOString(),
    numPlayers: deal.numPlayers,
    heroSeatIndex: heroSeat,
    heroCards: cards(deal.heroCards),
    dealerSeatIndex: deal.dealerSeatIndex,
    archetypeId: deal.archetype.archetypeId,
    archetypeDescription: deal.archetype.description,
    seatProfiles,
    streets,
    coaching,
    solution: solutionData,
    targetStreet,
    outcome: {
      phase: state.phase,
      finalPotBB: bbAmount(state.pot.total, bb),
      reachedTargetStreet,
    },
    flags,
  };
}

function buildStreetTrace(
  street: Street,
  state: GameState,
  decisions: DecisionTrace[],
  communityCards: CardIndex[],
  _heroSeat: number,
  bb: number,
): StreetTrace {
  const ccForStreet = communityCards.slice(0, street === "preflop" ? 0 : street === "flop" ? 3 : street === "turn" ? 4 : 5);

  let boardNarrative: StreetTrace["boardNarrative"];
  let boardTexture: StreetTrace["boardTexture"];

  if (ccForStreet.length >= 3) {
    const tex = analyzeBoard(ccForStreet);
    boardTexture = { wetness: tex.wetness, description: tex.description };
    // We'd need archetype + handCat for full narrative — skip for non-hero streets
  }

  return {
    street,
    communityCards: cards(ccForStreet),
    boardNarrative,
    boardTexture,
    decisions,
    potAtEnd: bbAmount(state.pot.total, bb),
  };
}

// ═══════════════════════════════════════════════════════
// PRETTY PRINT — human-readable full hand trace
// ═══════════════════════════════════════════════════════

export function formatHandTrace(t: HandTrace): string {
  const lines: string[] = [];

  lines.push(`╔══════════════════════════════════════════════════════════════╗`);
  lines.push(`║  HAND TRACE: ${t.archetypeId} (seed=${t.config.seed})`);
  lines.push(`║  ${t.archetypeDescription}`);
  lines.push(`╚══════════════════════════════════════════════════════════════╝`);
  lines.push("");

  // Seat setup
  lines.push(`SETUP — ${t.numPlayers} players`);
  for (const sp of t.seatProfiles) {
    const heroTag = sp.seatIndex === t.heroSeatIndex ? " ← HERO" : "";
    lines.push(`  ${sp.position.padEnd(4)} ${sp.label.padEnd(5)} ${sp.profileName.padEnd(20)} ${sp.startingStackBB.toFixed(0).padStart(4)} BB  ${sp.holeCards.join(" ")}${heroTag}`);
  }
  lines.push("");

  // Street-by-street
  for (const st of t.streets) {
    lines.push(`──── ${st.street.toUpperCase()} ────`);
    if (st.communityCards.length > 0) {
      lines.push(`Board: ${st.communityCards.join(" ")}`);
    }
    if (st.boardTexture) {
      lines.push(`Texture: ${st.boardTexture.description} (wetness: ${(st.boardTexture.wetness * 100).toFixed(0)}%)`);
    }
    lines.push("");

    for (const d of st.decisions) {
      const heroTag = d.playerLabel === "Hero" ? " ★" : "";
      const amountStr = d.amountBB !== undefined ? ` ${d.amountBB.toFixed(1)} BB` : "";
      const facingStr = d.facingBetBB > 0 ? ` (facing ${d.facingBetBB.toFixed(1)} BB)` : "";

      lines.push(`  ${d.playerLabel.padEnd(5)} [${d.position}] ${d.action.toUpperCase()}${amountStr}${facingStr}${heroTag}`);
      lines.push(`    Hand: ${d.holeCards.join(" ")} | ${d.handDescription ?? d.situationKey}`);
      lines.push(`    Pot: ${d.potBB.toFixed(1)} BB | Stack: ${d.stackBB.toFixed(1)} BB`);

      if (d.narrativeOneLiner) {
        lines.push(`    Narrative: "${d.narrativeOneLiner}"`);
      }
      if (d.characterLabel) {
        lines.push(`    Character: ${d.characterLabel}`);
      }
      if (d.gtoBaseFrequencies) {
        const freqStr = Object.entries(d.gtoBaseFrequencies)
          .filter(([, v]) => v > 0.01)
          .sort(([, a], [, b]) => b - a)
          .map(([k, v]) => `${k}: ${(v * 100).toFixed(0)}%`)
          .join(", ");
        lines.push(`    GTO base (${d.gtoSource ?? "?"}): ${freqStr}`);
      }
      // Context factors
      const ctx: string[] = [];
      if (d.handStrength !== undefined) ctx.push(`strength: ${d.handStrength.toFixed(2)}`);
      if (d.boardWetness !== undefined) ctx.push(`wetness: ${(d.boardWetness * 100).toFixed(0)}%`);
      if (d.potOdds !== undefined) ctx.push(`potOdds: ${(d.potOdds * 100).toFixed(0)}%`);
      if (d.foldEquity !== undefined) ctx.push(`foldEq: ${(d.foldEquity * 100).toFixed(0)}%`);
      if (d.spr !== undefined) ctx.push(`SPR: ${d.spr.toFixed(1)}`);
      if (d.isInPosition !== undefined) ctx.push(d.isInPosition ? "IP" : "OOP");
      if (ctx.length > 0) {
        lines.push(`    Context: ${ctx.join(" | ")}`);
      }
      // Modifier effects
      if (d.modifierIntensity !== undefined && d.modifierIntensity > 0.01) {
        const mods: string[] = [`intensity: ${d.modifierIntensity.toFixed(2)}`];
        if (d.effectiveFoldScale !== undefined) mods.push(`foldScale: ${d.effectiveFoldScale.toFixed(2)}`);
        if (d.effectiveAggressionScale !== undefined) mods.push(`aggrScale: ${d.effectiveAggressionScale.toFixed(2)}`);
        lines.push(`    Modifier: ${mods.join(" | ")}`);
      }
      lines.push("");
    }

    lines.push(`  Pot at end of ${st.street}: ${st.potAtEnd.toFixed(1)} BB`);
    lines.push("");
  }

  // Coaching at hero decision points
  if (t.coaching.length > 0) {
    lines.push(`──── COACHING (at hero's decision points) ────`);
    for (const c of t.coaching) {
      lines.push(`  ${c.street.toUpperCase()}:`);
      for (const p of c.profiles) {
        const narrative = p.narrativeOneLiner ? ` — "${p.narrativeOneLiner}"` : "";
        const char = p.characterLabel ? ` [${p.characterLabel}]` : "";
        lines.push(`    ${p.name}${char}: ${p.action}${p.amount ? " " + p.amount : ""}${narrative}`);
      }
      if (c.solverFrequencies) {
        const freqStr = Object.entries(c.solverFrequencies)
          .filter(([, v]) => v > 0.01)
          .sort(([, a], [, b]) => b - a)
          .map(([k, v]) => `${k}: ${(v * 100).toFixed(0)}%`)
          .join(", ");
        lines.push(`    Solver: ${freqStr} → optimal: ${c.solverOptimalAction}`);
      }
      lines.push("");
    }
  }

  // Solution
  if (t.solution) {
    lines.push(`──── GTO SOLUTION (target: ${t.targetStreet}) ────`);
    const freqStr = Object.entries(t.solution.frequencies)
      .filter(([, v]) => v > 0.01)
      .sort(([, a], [, b]) => b - a)
      .map(([k, v]) => `${k}: ${(v * 100).toFixed(0)}%`)
      .join(", ");
    lines.push(`Optimal: ${t.solution.optimalAction} (${(t.solution.optimalFrequency * 100).toFixed(0)}%)`);
    lines.push(`Frequencies: ${freqStr}`);
    lines.push(`Category: ${t.solution.resolvedCategory} | Exact: ${t.solution.isExactMatch}`);
    lines.push("");
  }

  // Outcome
  lines.push(`──── OUTCOME ────`);
  lines.push(`Phase: ${t.outcome.phase} | Final pot: ${t.outcome.finalPotBB.toFixed(1)} BB | Reached target: ${t.outcome.reachedTargetStreet}`);
  lines.push("");

  // Flags
  if (t.flags.length > 0) {
    lines.push(`──── FLAGS ────`);
    for (const f of t.flags) {
      lines.push(`  ⚠ ${f}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
