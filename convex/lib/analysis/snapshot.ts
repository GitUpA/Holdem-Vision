/**
 * Full Snapshot Capture — everything the user sees at a decision point.
 *
 * One function that runs ALL analysis the UI would show and captures it
 * in a structured object. Used by:
 *   1. Enhanced audit (record what coaching told the user)
 *   2. Programmatic testing (step through hands without browser)
 *   3. Quality analysis (evaluate coherence across all data)
 *
 * Pure TypeScript, zero Convex/React imports.
 */
import type { CardIndex, Position, Street } from "../types/cards";
import type { GameState, LegalActions, ActionType } from "../state/gameState";
import type { OpponentProfile, PlayerAction } from "../types/opponents";
import type { ActionFrequencies } from "../gto/tables/types";
import type { HandCategorization } from "../gto/handCategorizer";
import type { ArchetypeClassification } from "../gto/archetypeClassifier";
import type { OpponentStory } from "./opponentStory";
import type { ActionStory } from "../gto/actionNarratives";
import type { HandCommentary } from "./handCommentator";
import type { RenderedNarrative } from "../opponents/engines/narrativeTypes";
import type { GtoLookupResult } from "../gto/frequencyLookup";

import { currentLegalActions } from "../state/stateMachine";
import { classifyArchetype, contextFromGameState } from "../gto/archetypeClassifier";
import { categorizeHand } from "../gto/handCategorizer";
import { analyzeBoard, type BoardTexture } from "../opponents/engines/boardTexture";
import { lookupGtoFrequencies } from "../gto/frequencyLookup";
import { classifySituationFromState } from "../preflop/situationRegistry";
import { buildOpponentStory } from "./opponentStory";
import { buildActionStories } from "../gto/actionNarratives";
import { commentateHand } from "./handCommentator";
import { computeHeroPerceivedRange, type HeroPerceivedRange } from "./heroPerceivedRange";
import { inferBehavior } from "../opponents/behaviorInference";
import { getCounterAdvice } from "../pipeline/counterStrategyMap";
import { cardToDisplay } from "../primitives/card";
import { positionDisplayName } from "../primitives/position";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

/** Everything the user sees at a decision point. */
export interface FullSnapshot {
  // ── Context ──
  street: Street;
  heroPosition: string;
  heroCards: string[];          // Display format: "A♠", "K♥"
  communityCards: string[];     // Display format
  pot: number;                  // Total pot in BB
  potOdds: string | null;       // "2.5:1" or null if no call needed

  // ── Legal Actions ──
  legalActions: {
    canFold: boolean;
    canCheck: boolean;
    canCall: boolean;
    callAmount: number;
    canBet: boolean;
    canRaise: boolean;
    raiseMin: number;
    raiseMax: number;
  };

  // ── Hand Assessment ──
  handStrength: {
    category: string;           // "top_pair_top_kicker", "air", etc.
    relativeStrength: number;   // 0-1
    description: string;        // "Top pair with ace kicker"
  };

  // ── Board Analysis ──
  boardTexture: {
    wetness: number;
    description: string;
    isPaired: boolean;
    isMonotone: boolean;
    isTwoTone: boolean;
    flushPossible: boolean;
    straightHeavy: boolean;
  } | null;

  // ── Archetype ──
  archetype: {
    id: string;
    confidence: number;
    textureId?: string;
  } | null;

  // ── GTO Data ──
  gtoFrequencies: ActionFrequencies | null;
  gtoSource: string | null;     // "preflop-handclass", "category", etc.
  gtoOptimalAction: string | null;

  // ── Opponent Stories ──
  opponentStories: Array<{
    seatIndex: number;
    position: string;
    profileName: string;
    equityVsRange: number;
    rangePercent: number;
    confidence: string;
    rangeNarrative: string;
    heroImplication: string;
    adjustedAction: string;
    streetNarratives: Array<{
      street: string;
      action: string;
      interpretation: string;
    }>;
  }>;

  // ── Action Narratives ──
  actionStories: Array<{
    action: string;
    narrative: string;
    counterNarrative?: string;
  }>;

  // ── Hero Perceived Range (Layer 3: what opponents think hero has) ──
  heroPerceivedRange: {
    rangePercent: number;
    narrative: string;
    implication: string;
  } | null;

  // ── Counter-Strategy Advice (Layer 10: exploitative coaching) ──
  counterAdvice: {
    pattern: string;
    narrative: string;
    confidence: number;
    confidenceLabel: string;
  } | null;

  // ── Hand Commentator ──
  commentary: {
    narrative: string;
    summary: string;
    recommendedAction: string | null;
    confidence: string;
  } | null;

  // ── Players ──
  players: Array<{
    seatIndex: number;
    position: string;
    stack: number;
    status: string;
    totalCommitted: number;
    streetCommitted: number;
    actionHistory: Array<{ street: string; action: string; amount?: number }>;
  }>;

  // ── Debug (verbose only) ──
  debug?: {
    rawHandCat: HandCategorization;
    rawArchetype: ArchetypeClassification | null;
    rawBoardTexture: BoardTexture | null;
    rawGtoLookup: GtoLookupResult | null;
    rawOpponentStories: OpponentStory[];
    rawLegal: LegalActions;
  };
}

// ═══════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════

export type SnapshotDetailLevel = boolean | "lite";

export interface SnapshotOptions {
  /** Detail level:
   *  - false: minimal (GTO action, basic state, no stories/commentary)
   *  - "lite": stories and commentary without debug data
   *  - true: full capture including debug data
   */
  debug?: SnapshotDetailLevel;
  /** Opponent profiles keyed by seat index */
  opponentProfiles?: Map<number, OpponentProfile>;
  /** Dead cards (folded hands we know about) */
  deadCards?: CardIndex[];
}

/**
 * Capture everything the user would see at this decision point.
 * Runs all analysis pipelines and returns structured data.
 */
/** Normalize frequencies to sum to 1.0 (fix rounding/remap artifacts). */
function normalizeFrequencies(freqs: ActionFrequencies): ActionFrequencies {
  const sum = Object.values(freqs).reduce((s, v) => s + (v ?? 0), 0);
  if (sum <= 0 || Math.abs(sum - 1) < 0.02) return freqs; // already ~1.0
  const result: ActionFrequencies = {};
  for (const [key, val] of Object.entries(freqs)) {
    if (val !== undefined && val !== null) {
      result[key as keyof ActionFrequencies] = val / sum;
    }
  }
  return result;
}

export function captureFullSnapshot(
  gameState: GameState,
  heroSeat: number,
  heroCards: CardIndex[],
  opts: SnapshotOptions = {},
): FullSnapshot {
  const street = gameState.currentStreet;
  const hero = gameState.players[heroSeat];
  const legal = currentLegalActions(gameState);
  const communityCards = gameState.communityCards;
  const bigBlind = gameState.blinds.big || 1;

  // ── Hand categorization ──
  const handCat = heroCards.length >= 2
    ? categorizeHand(heroCards, communityCards)
    : { category: "unknown" as any, relativeStrength: 0.5, description: "unknown" };

  // ── Board texture ──
  const boardTex = communityCards.length >= 3
    ? analyzeBoard(communityCards)
    : null;

  // ── Archetype ──
  let archetype: ArchetypeClassification | null = null;
  try {
    const ctx = contextFromGameState(gameState, heroSeat);
    archetype = classifyArchetype(ctx);
  } catch { /* classification can fail on edge cases */ }

  // ── GTO lookup ──
  let gtoLookup: GtoLookupResult | null = null;
  if (heroCards.length >= 2 && legal) {
    const opponents = opts.opponentProfiles
      ? gameState.players
          .filter((p) => p.seatIndex !== heroSeat && (p.status === "active" || p.status === "all_in"))
          .map((p) => ({
            profile: opts.opponentProfiles!.get(p.seatIndex)!,
            actions: gameState.actionHistory
              .filter((a) => a.seatIndex === p.seatIndex)
              .map((a) => ({ street: a.street as Street, actionType: a.actionType, amount: a.amount })),
            position: p.position,
            knownCards: p.holeCards.length >= 2 ? p.holeCards : undefined,
          }))
          .filter((o) => o.profile)
      : undefined;

    // Derive situation context once for this snapshot
    const sitCtx = gameState.currentStreet === "preflop"
      ? classifySituationFromState(gameState, heroSeat) : undefined;

    gtoLookup = lookupGtoFrequencies(heroCards, communityCards, gameState, heroSeat, legal, {
      opponents,
      deadCards: opts.deadCards,
      situationContext: sitCtx,
    });
  }

  // ── Optimal action from GTO ──
  let gtoOptimalAction: string | null = null;
  if (gtoLookup) {
    let bestFreq = 0;
    for (const [action, freq] of Object.entries(gtoLookup.frequencies)) {
      if ((freq ?? 0) > bestFreq) {
        bestFreq = freq ?? 0;
        gtoOptimalAction = action;
      }
    }
  }

  // ── Opponent stories ──
  const rawOpponentStories: OpponentStory[] = [];
  /** Track which opponent (by index in activeOpponents) each story belongs to */
  const storyOpponentIndices: number[] = [];
  const detailLevel = opts.debug;
  const includeStories = detailLevel === true || detailLevel === "lite";

  const activeOpponents = gameState.players.filter(
    (p) => p.seatIndex !== heroSeat && (p.status === "active" || p.status === "all_in"),
  );

  if (includeStories) {
    for (let oppIdx = 0; oppIdx < activeOpponents.length; oppIdx++) {
      const opp = activeOpponents[oppIdx];
      const profile = opts.opponentProfiles?.get(opp.seatIndex);
      if (!profile) continue;
      const oppActions: PlayerAction[] = gameState.actionHistory
        .filter((a) => a.seatIndex === opp.seatIndex)
        .map((a) => ({ street: a.street as Street, actionType: a.actionType, amount: a.amount }));
      if (oppActions.length === 0) continue;

      try {
        // phe-based MC equity (~0.1ms per opponent)
        const story = buildOpponentStory(
          heroCards, communityCards, oppActions, profile, opp.position,
          gameState.pot.total / bigBlind,
          legal?.canCall ? legal.callAmount / bigBlind : 0,
          street, opts.deadCards ?? [],
          boardTex ?? undefined,
          true, // inferFromActions: coach is blind to setup (Layer 7)
        );
        rawOpponentStories.push(story);
        storyOpponentIndices.push(oppIdx);
      } catch { /* best-effort */ }
    }
  }

  // ── Hero perceived range (Layer 3: what opponents think hero has) ──
  let heroPerceivedRange: HeroPerceivedRange | null = null;
  if (includeStories && heroCards.length >= 2) {
    const heroActions: import("../types/opponents").PlayerAction[] = gameState.actionHistory
      .filter((a) => a.seatIndex === heroSeat)
      .map((a) => ({ street: a.street as Street, actionType: a.actionType, amount: a.amount }));
    if (heroActions.length > 0) {
      try {
        heroPerceivedRange = computeHeroPerceivedRange(
          heroActions,
          hero.position,
          [...heroCards, ...communityCards],
          street,
        );
      } catch { /* best-effort */ }
    }
  }

  // ── Counter-strategy advice (Layer 10) ──
  let counterAdviceResult: FullSnapshot["counterAdvice"] = null;
  let inferredBehaviorResult: import("../opponents/behaviorInference").InferredBehavior | undefined;
  let counterAdviceForCommentary: import("../pipeline/counterStrategyMap").CounterAdvice | undefined;
  if (rawOpponentStories.length > 0) {
    // Collect all opponent actions for behavior inference
    const allOppActions = activeOpponents.flatMap(opp =>
      gameState.actionHistory
        .filter(a => a.seatIndex === opp.seatIndex)
        .map(a => ({ street: a.street as Street, actionType: a.actionType, amount: a.amount }))
    );
    if (allOppActions.length > 0) {
      const inferred = inferBehavior(allOppActions);
      inferredBehaviorResult = inferred;
      const gtoFoldRate = 0.5; // GTO baseline fold rate (approximate)
      const actualFoldRate = allOppActions.filter(a => a.actionType === "fold").length / allOppActions.length;
      const deviation = Math.abs(actualFoldRate - gtoFoldRate);
      const advice = getCounterAdvice(inferred.pattern, allOppActions.length, deviation);
      // Gate counter advice confidence by the inference confidence (capped for single-hand)
      // to prevent high counter-advice confidence from small samples
      const gatedConfidence = Math.min(advice.confidence, inferred.confidence);
      counterAdviceForCommentary = { ...advice, confidence: gatedConfidence };
      if (advice.confidence > 0.2) {
        counterAdviceResult = {
          pattern: advice.pattern,
          narrative: advice.narrative,
          confidence: advice.confidence,
          confidenceLabel: advice.confidenceLabel,
        };
      }
    }
  }

  // ── Action stories ──
  const rawActionStories = legal && heroCards.length >= 2
    ? buildActionStories(
        heroCards, communityCards, legal,
        rawOpponentStories[0], // strongest opponent
        handCat, street,
      )
    : [];

  // ── Hand commentary ──
  let commentary: FullSnapshot["commentary"] = null;
  if (legal && heroCards.length >= 2) {
    try {
      const result = commentateHand({
        heroCards, communityCards, gameState, heroSeat: heroSeat, legal,
        handCat, archetype: archetype ?? undefined,
        opponentStories: rawOpponentStories.length > 0 ? rawOpponentStories : undefined,
        actionStories: rawActionStories.length > 0 ? rawActionStories : undefined,
        gtoFrequencies: gtoLookup?.frequencies,
        gtoOptimalAction: gtoOptimalAction ?? undefined,
        counterAdvice: counterAdviceForCommentary,
        inferredBehavior: inferredBehaviorResult,
        confidenceTier: gtoLookup?.confidence?.implications.tier,
        preflopClassification: gtoLookup?.preflopClassification,
      });
      commentary = {
        narrative: result.narrative,
        summary: result.summary,
        recommendedAction: result.recommendedAction,
        confidence: result.confidence,
      };
    } catch { /* best-effort */ }
  }

  // ── Pot odds ──
  let potOdds: string | null = null;
  if (legal?.canCall && legal.callAmount > 0) {
    const ratio = gameState.pot.total / legal.callAmount;
    potOdds = `${ratio.toFixed(1)}:1`;
  }

  // ── Player states ──
  const players = gameState.players.map((p) => ({
    seatIndex: p.seatIndex,
    position: positionDisplayName(p.position),
    stack: p.currentStack / bigBlind,
    status: p.status,
    totalCommitted: p.totalCommitted / bigBlind,
    streetCommitted: p.streetCommitted / bigBlind,
    actionHistory: gameState.actionHistory
      .filter((a) => a.seatIndex === p.seatIndex)
      .map((a) => ({
        street: a.street,
        action: a.actionType,
        amount: a.amount ? a.amount / bigBlind : undefined,
      })),
  }));

  // ── Build snapshot ──
  const snapshot: FullSnapshot = {
    street,
    heroPosition: hero ? positionDisplayName(hero.position) : "unknown",
    heroCards: heroCards.map(cardToDisplay),
    communityCards: communityCards.map(cardToDisplay),
    pot: gameState.pot.total / bigBlind,
    potOdds,

    legalActions: legal ? {
      canFold: legal.canFold,
      canCheck: legal.canCheck,
      canCall: legal.canCall,
      callAmount: legal.callAmount / bigBlind,
      canBet: legal.canBet,
      canRaise: legal.canRaise,
      raiseMin: legal.raiseMin / bigBlind,
      raiseMax: legal.raiseMax / bigBlind,
    } : {
      canFold: false, canCheck: false, canCall: false, callAmount: 0,
      canBet: false, canRaise: false, raiseMin: 0, raiseMax: 0,
    },

    handStrength: {
      category: handCat.category,
      relativeStrength: handCat.relativeStrength,
      description: handCat.description,
    },

    boardTexture: boardTex ? {
      wetness: boardTex.wetness,
      description: boardTex.description,
      isPaired: boardTex.isPaired,
      isMonotone: boardTex.isMonotone,
      isTwoTone: boardTex.isTwoTone,
      flushPossible: boardTex.flushPossible,
      straightHeavy: boardTex.straightHeavy,
    } : null,

    archetype: archetype ? {
      id: archetype.archetypeId,
      confidence: archetype.confidence,
      textureId: archetype.textureArchetypeId,
    } : null,

    gtoFrequencies: gtoLookup?.frequencies ? normalizeFrequencies(gtoLookup.frequencies) : null,
    gtoSource: gtoLookup?.source ?? null,
    gtoOptimalAction,

    opponentStories: rawOpponentStories.map((s, i) => {
      const oppIdx = storyOpponentIndices[i] ?? i;
      const opp = activeOpponents[oppIdx];
      return {
      seatIndex: opp?.seatIndex ?? i,
      position: opp ? positionDisplayName(opp.position) : "unknown",
      profileName: opts.opponentProfiles?.get(opp?.seatIndex ?? i)?.name ?? "unknown",
      equityVsRange: s.data.equityVsRange,
      rangePercent: s.data.rangePercent,
      confidence: s.confidence,
      rangeNarrative: s.rangeNarrative,
      heroImplication: s.heroImplication,
      adjustedAction: s.adjustedAction,
      streetNarratives: s.streetNarratives.map((sn) => ({
        street: sn.street,
        action: sn.action,
        interpretation: sn.interpretation,
      })),
    };}),

    actionStories: rawActionStories.map((s) => ({
      action: s.action,
      narrative: s.narrative,
      counterNarrative: s.counterNarrative,
    })),

    heroPerceivedRange: heroPerceivedRange ? {
      rangePercent: heroPerceivedRange.rangePercent,
      narrative: heroPerceivedRange.narrative,
      implication: heroPerceivedRange.implication,
    } : null,

    counterAdvice: counterAdviceResult,

    commentary,
    players,
  };

  // ── Debug data (verbose) ──
  if (opts.debug && legal) {
    snapshot.debug = {
      rawHandCat: handCat,
      rawArchetype: archetype,
      rawBoardTexture: boardTex,
      rawGtoLookup: gtoLookup,
      rawOpponentStories: rawOpponentStories,
      rawLegal: legal,
    };
  }

  return snapshot;
}

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

/** Format a snapshot as a human-readable string (for logs and analysis) */
export function formatSnapshot(snap: FullSnapshot): string {
  const lines: string[] = [];

  lines.push(`=== ${snap.street.toUpperCase()} | ${snap.heroPosition} | ${snap.heroCards.join(" ")} ===`);
  if (snap.communityCards.length > 0) {
    lines.push(`Board: ${snap.communityCards.join(" ")}`);
  }
  lines.push(`Pot: ${snap.pot.toFixed(1)} BB${snap.potOdds ? ` | Odds: ${snap.potOdds}` : ""}`);
  lines.push(`Hand: ${snap.handStrength.description} (${snap.handStrength.category}, strength ${snap.handStrength.relativeStrength.toFixed(2)})`);

  if (snap.archetype) {
    lines.push(`Archetype: ${snap.archetype.id} (confidence ${snap.archetype.confidence.toFixed(2)})`);
  }

  if (snap.boardTexture) {
    lines.push(`Board texture: ${snap.boardTexture.description} (wetness ${snap.boardTexture.wetness.toFixed(2)})`);
  }

  // Legal actions
  const actions: string[] = [];
  if (snap.legalActions.canFold) actions.push("Fold");
  if (snap.legalActions.canCheck) actions.push("Check");
  if (snap.legalActions.canCall) actions.push(`Call ${snap.legalActions.callAmount.toFixed(1)}`);
  if (snap.legalActions.canBet) actions.push("Bet");
  if (snap.legalActions.canRaise) actions.push(`Raise ${snap.legalActions.raiseMin.toFixed(1)}-${snap.legalActions.raiseMax.toFixed(1)}`);
  lines.push(`Actions: ${actions.join(" | ")}`);

  // GTO
  if (snap.gtoFrequencies) {
    const freqStr = Object.entries(snap.gtoFrequencies)
      .filter(([, v]) => (v ?? 0) > 0.01)
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
      .map(([k, v]) => `${k}: ${((v ?? 0) * 100).toFixed(0)}%`)
      .join(", ");
    lines.push(`GTO (${snap.gtoSource}): ${freqStr} → ${snap.gtoOptimalAction}`);
  }

  // Opponent stories
  for (const opp of snap.opponentStories) {
    lines.push(`Opponent ${opp.position} (${opp.profileName}): ${opp.rangeNarrative}`);
    lines.push(`  Equity vs range: ${(opp.equityVsRange * 100).toFixed(0)}% | Adjusted: ${opp.adjustedAction}`);
  }

  // Action narratives
  if (snap.actionStories.length > 0) {
    lines.push("Action stories:");
    for (const s of snap.actionStories) {
      lines.push(`  ${s.action}: "${s.narrative}"`);
      if (s.counterNarrative) lines.push(`    → ${s.counterNarrative}`);
    }
  }

  // Hero perceived range (Layer 3)
  if (snap.heroPerceivedRange) {
    lines.push(`\nYOUR STORY (how opponents see you): ${snap.heroPerceivedRange.narrative}`);
    lines.push(`  → ${snap.heroPerceivedRange.implication}`);
  }

  // Counter-strategy advice (Layer 10)
  if (snap.counterAdvice && snap.counterAdvice.confidence > 0.3) {
    lines.push(`\nEXPLOIT (${snap.counterAdvice.confidenceLabel}): ${snap.counterAdvice.narrative}`);
  }

  // Commentary
  if (snap.commentary) {
    lines.push(`\nCOACH (${snap.commentary.confidence}): ${snap.commentary.narrative}`);
  }

  return lines.join("\n");
}
