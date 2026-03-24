/**
 * Coaching Lens — "How would each player type play your hand?"
 *
 * Runs every preset profile through its decision engine from the hero's
 * seat, producing a side-by-side comparison of what a Nit, Fish, TAG,
 * LAG, and GTO player would do in this exact spot.
 *
 * The same engines that drive opponent auto-play produce these coaching
 * recommendations — making the architecture truly DRY.
 *
 * Pure TypeScript, zero Convex imports.
 */
import type {
  AnalysisLens,
  AnalysisContext,
  AnalysisResult,
  ExplanationNode,
} from "../types/analysis";
import type { VisualDirectiveType } from "../types/visuals";
import type { ActionType, GameState, LegalActions } from "../state/gameState";
import type { CardIndex } from "../types/cards";
import { getEngineOrDefault } from "../opponents/engines/engineRegistry";
import { buildDecisionContext } from "../opponents/autoPlay";
import { getAllPresets, PRESET_PROFILES } from "../opponents/presets";
import { currentLegalActions } from "../state/stateMachine";
import { seededRandom } from "../primitives/deck";

// GTO frequency lookup — shared with engine
import { lookupGtoFrequencies } from "../gto/frequencyLookup";
import { type OpponentInput } from "./equityRecommendation";
import type { ActionFrequencies, ActionFrequencyBands, GtoAction } from "../gto/tables/types";
import type { ArchetypeAccuracy } from "../gto/tables/types";
import type { AccuracyImpact } from "../gto/tables/types";
import { contextFromGameState } from "../gto/archetypeClassifier";
import { explainArchetype } from "../gto/archetypeExplainer";
import { gtoActionToGameAction, remapFrequenciesToLegal } from "../gto/actionMapping";
import { detectMixedStrategy, getTradeoffText } from "../gto/mixedStrategy";
import { buildOpponentStory, type OpponentStory } from "./opponentStory";

// Ensure engine is registered
import "../opponents/engines/modifiedGtoEngine";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

/** Solver frequency data when available — same shape as SpotSolution */
export interface CoachingSolverData {
  frequencies: ActionFrequencies;
  optimalAction: GtoAction;
  optimalFrequency: number;
  availableActions: GtoAction[];
  isExactMatch: boolean;
  resolvedCategory: string;
  bands?: ActionFrequencyBands;
  archetypeAccuracy?: ArchetypeAccuracy;
  accuracyImpact?: AccuracyImpact;
  /** Preflop confidence based on sample count */
  preflopConfidence?: import("../gto/tables").PreflopConfidence;
  /** Whether this is a mixed strategy spot (two actions both > 25%, gap < 20%) */
  isMixedStrategy?: boolean;
  /** Alternative actions that are also correct in this spot */
  alternativeActions?: GtoAction[];
  /** Plain-language explanation of the tradeoff between actions */
  tradeoffExplanation?: string;
}

export interface CoachingAdvice {
  profileName: string;
  profileId: string;
  engineId: string;
  actionType: ActionType;
  amount?: number;
  explanation: ExplanationNode;
  /** Raw solver data — present when GTO profile uses lookup tables */
  solverData?: CoachingSolverData;
  /** Narrative explanation — present when engine produces character-coherent stories */
  narrative?: import("../opponents/engines/narrativeTypes").RenderedNarrative;
}

export interface CoachingValue {
  /** One advice entry per preset profile. */
  advices: CoachingAdvice[];
  /** If multiple profiles agree on the same action type. */
  consensus?: {
    actionType: string;
    agreeing: string[];
    disagreeing: string[];
  };
  /** Opponent story — what their actions reveal about their holdings */
  opponentStory?: OpponentStory;
}

// ═══════════════════════════════════════════════════════
// LENS
// ═══════════════════════════════════════════════════════

export const coachingLens: AnalysisLens = {
  id: "coaching",
  name: "Coaching",
  description: "How would different player types play your hand?",
  heavy: true,

  analyze(context: AnalysisContext): AnalysisResult<CoachingValue> {
    const { gameState } = context;

    // Need game state and hero cards to produce advice
    if (!gameState || context.heroCards.length < 2) {
      return emptyResult(context);
    }

    // Need an active decision point (hero's turn to act)
    const legal = currentLegalActions(gameState);
    if (!legal) {
      return emptyResult(context);
    }

    const heroSeat = context.heroSeatIndex ?? 0;
    const presets = getAllPresets();
    const advices: CoachingAdvice[] = [];

    // Pre-compute GTO solver data if available (shared across the GTO profile)
    const gtoSolverAdvice = tryGtoSolverLookup(gameState, heroSeat, context.heroCards, legal);

    // Build opponent story for each active opponent (not hero, not folded)
    let primaryOpponentStory: OpponentStory | undefined;
    try {
      const activePlayers = gameState.players.filter(
        (p) => p.seatIndex !== heroSeat && (p.status === "active" || p.status === "all_in"),
      );
      if (activePlayers.length > 0 && context.opponents && context.opponents.length > 0) {
        const opponentStories: OpponentStory[] = [];
        for (const opp of activePlayers) {
          // Find this opponent's profile from context
          const oppCtx = context.opponents.find((o) => o.seatIndex === opp.seatIndex);
          if (!oppCtx?.profile) continue;
          // Collect opponent's actions from hand history
          const oppActions = gameState.actionHistory
            .filter((a) => a.seatIndex === opp.seatIndex && a.actionType !== "bet" || a.seatIndex === opp.seatIndex)
            .filter((a) => a.seatIndex === opp.seatIndex)
            .map((a) => ({
              street: a.street,
              actionType: a.actionType,
              amount: a.amount,
            }));
          if (oppActions.length === 0) continue;

          const story = buildOpponentStory(
            context.heroCards,
            context.communityCards,
            oppActions,
            oppCtx.profile,
            opp.position,
            gameState.pot.total,
            legal.canCall ? legal.callAmount : 0,
            gameState.currentStreet,
            context.deadCards,
          );
          opponentStories.push(story);
        }
        // Use the opponent with the strongest range (lowest hero equity)
        if (opponentStories.length > 0) {
          primaryOpponentStory = opponentStories.reduce((a, b) =>
            a.data.equityVsRange < b.data.equityVsRange ? a : b,
          );
        }
      }
    } catch {
      // Opponent story is best-effort — don't break coaching if it fails
    }

    // If opponent story says hero is behind, adjust the GTO solver advice
    if (primaryOpponentStory && gtoSolverAdvice?.solverData) {
      const eq = primaryOpponentStory.data.equityVsRange;
      const needed = primaryOpponentStory.data.potOddsNeeded;
      // Only adjust when we have a confident read that hero is behind
      if (primaryOpponentStory.confidence !== "speculative" && eq < 0.45) {
        const adjusted = { ...gtoSolverAdvice.solverData.frequencies };
        // Shift frequencies toward checking/folding when behind
        const behindFactor = 1 - eq; // 0.6 when eq=0.4, 0.8 when eq=0.2
        if (adjusted.fold !== undefined) {
          adjusted.fold = Math.min(1, (adjusted.fold ?? 0) * (1 + behindFactor));
        }
        if (adjusted.check !== undefined) {
          adjusted.check = Math.min(1, (adjusted.check ?? 0) * (1 + behindFactor * 0.5));
        }
        // Reduce aggressive actions
        for (const key of Object.keys(adjusted) as (keyof typeof adjusted)[]) {
          if (key.startsWith("bet_") || key.startsWith("raise")) {
            adjusted[key] = (adjusted[key] ?? 0) * eq; // Scale down by equity
          }
        }
        // Normalize
        const total = Object.values(adjusted).reduce((s, v) => s + (v ?? 0), 0);
        if (total > 0) {
          for (const key of Object.keys(adjusted) as (keyof typeof adjusted)[]) {
            adjusted[key] = (adjusted[key] ?? 0) / total;
          }
        }
        // Update the solver advice with adjusted frequencies
        gtoSolverAdvice.solverData = {
          ...gtoSolverAdvice.solverData,
          frequencies: adjusted,
        };
        // Re-determine optimal action from adjusted frequencies
        let bestAction = gtoSolverAdvice.solverData.optimalAction;
        let bestFreq = 0;
        for (const [action, freq] of Object.entries(adjusted)) {
          if ((freq ?? 0) > bestFreq) {
            bestFreq = freq ?? 0;
            bestAction = action as typeof bestAction;
          }
        }
        if (bestAction !== gtoSolverAdvice.solverData.optimalAction) {
          gtoSolverAdvice.solverData.optimalAction = bestAction;
          // Map GTO action back to game action type
          if (bestAction === "fold") gtoSolverAdvice.actionType = "fold";
          else if (bestAction === "check") gtoSolverAdvice.actionType = legal.canCheck ? "check" : "call";
          else if (bestAction === "call") gtoSolverAdvice.actionType = "call";
          else if (bestAction.startsWith("bet_")) gtoSolverAdvice.actionType = legal.canBet ? "bet" : "raise";
          else if (bestAction.startsWith("raise")) gtoSolverAdvice.actionType = "raise";
        }
        // Add opponent story context to explanation
        gtoSolverAdvice.explanation = {
          ...gtoSolverAdvice.explanation,
          children: [
            ...(gtoSolverAdvice.explanation.children ?? []),
            {
              summary: `Opponent's story: ${primaryOpponentStory.rangeNarrative}`,
              detail: primaryOpponentStory.heroImplication,
              sentiment: eq < needed ? "warning" : "neutral",
              tags: ["opponent-story"],
            },
          ],
        };
      }
    }

    for (const profile of presets) {
      try {
        // For the GTO profile, prefer solver frequency table data when available
        if (profile.id === "gto" && gtoSolverAdvice) {
          advices.push(gtoSolverAdvice);
          continue;
        }

        // Each profile gets a deterministic seed based on its id
        const seed = hashString(profile.id);
        const random = seededRandom(seed);

        const ctx = buildDecisionContext(gameState, heroSeat, profile, legal, {
          getBase: (id) => PRESET_PROFILES[id],
          random,
          holeCards: context.heroCards,
        });

        const engine = getEngineOrDefault(profile.engineId);
        const decision = engine.decide(ctx);

        advices.push({
          profileName: profile.name,
          profileId: profile.id,
          engineId: engine.id,
          actionType: decision.actionType,
          amount: decision.amount,
          explanation: decision.explanation,
          narrative: decision.narrative,
        });
      } catch {
        // If an engine fails, skip this profile gracefully
        advices.push({
          profileName: profile.name,
          profileId: profile.id,
          engineId: "error",
          actionType: "check",
          explanation: {
            summary: `${profile.name}: engine error`,
            sentiment: "warning",
          },
        });
      }
    }

    // Detect consensus
    const consensus = detectConsensus(advices);

    // Build explanation tree
    const children: ExplanationNode[] = advices.map((advice) => ({
      summary: `${advice.profileName}: ${advice.actionType}${advice.amount !== undefined ? ` ${advice.amount}` : ""}`,
      sentiment: advice.actionType === "fold"
        ? "negative"
        : (advice.actionType === "raise" || advice.actionType === "bet")
          ? "positive"
          : "neutral",
      children: advice.explanation.children,
      tags: [advice.profileId, advice.engineId],
    }));

    const consensusSummary = consensus
      ? `${consensus.agreeing.length} profiles say ${consensus.actionType}`
      : "No consensus — profiles disagree";

    const explanation: ExplanationNode = {
      summary: `Coaching: ${consensusSummary}`,
      sentiment: "neutral",
      children,
      tags: ["coaching"],
    };

    const value: CoachingValue = { advices, consensus, opponentStory: primaryOpponentStory };

    return {
      value,
      context,
      explanation,
      visuals: advices.length > 0 ? [{
        type: "coaching" as VisualDirectiveType,
        data: { advices, consensus, opponentStory: primaryOpponentStory } as Record<string, unknown>,
        priority: 100,
        lensId: "coaching",
      }] : [],
      lensId: "coaching",
      dependencies: [],
    };
  },
};

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

function emptyResult(context: AnalysisContext): AnalysisResult<CoachingValue> {
  return {
    value: { advices: [] },
    context,
    explanation: {
      summary: "Coaching: waiting for hero's turn",
      sentiment: "neutral",
    },
    visuals: [],
    lensId: "coaching",
    dependencies: [],
  };
}

/**
 * Enrich CoachingSolverData with mixed strategy detection.
 * Uses shared detectMixedStrategy from ../gto/mixedStrategy.
 */
function enrichWithMixedStrategy(data: CoachingSolverData): void {
  const mixed = detectMixedStrategy(data.frequencies);
  if (mixed.isMixed) {
    data.isMixedStrategy = true;
    data.alternativeActions = Object.entries(data.frequencies)
      .filter(([, v]) => (v ?? 0) > 0.01)
      .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
      .slice(1)
      .filter(([, v]) => (v ?? 0) >= 0.20)
      .map(([a]) => a as GtoAction);
    data.tradeoffExplanation = getTradeoffText(data.optimalAction, mixed.secondAction);
  }
}

/**
 * Try to produce GTO coaching advice using solver frequency tables.
 * Uses the shared lookupGtoFrequencies() and then wraps the result
 * in coaching-specific data (remapping, explanation, solver display).
 */
function tryGtoSolverLookup(
  gameState: GameState,
  heroSeat: number,
  heroCards: CardIndex[],
  legal: LegalActions,
): CoachingAdvice | null {
  if (heroCards.length < 2) return null;

  // Build opponent inputs for equity-based fallback within the shared lookup
  const opponents: OpponentInput[] = [];
  for (const player of gameState.players) {
    if (player.seatIndex === heroSeat) continue;
    if (player.status === "folded" || player.status === "sitting_out") continue;
    opponents.push({
      profile: PRESET_PROFILES["gto"],
      actions: gameState.actionHistory
        .filter((a) => a.seatIndex === player.seatIndex)
        .map((a) => ({
          street: a.street as "preflop" | "flop" | "turn" | "river",
          actionType: a.actionType,
          amount: a.amount,
        })),
      position: player.position,
      knownCards: player.holeCards.length >= 2 ? player.holeCards : undefined,
    });
  }

  const result = lookupGtoFrequencies(
    heroCards,
    gameState.communityCards,
    gameState,
    heroSeat,
    legal,
    { opponents: opponents.length > 0 ? opponents : undefined },
  );

  if (!result) return null;

  const classCtx = contextFromGameState(gameState, heroSeat);
  const street = gameState.currentStreet;

  // Build explanation from archetype + hand categorization
  const explanation = explainArchetype(
    result.archetype,
    result.handCat,
    classCtx.isInPosition,
    undefined,
    street,
  );

  // Remap solver frequencies to match what's actually legal
  const remappedFreqs = remapFrequenciesToLegal(result.frequencies, legal);
  const remappedBands = result.bands
    ? remapBandsToLegal(result.bands, legal)
    : undefined;

  // Find optimal action after remapping
  let remappedOptimalAction = "check";
  let remappedOptimalFreq = 0;
  for (const [action, freq] of Object.entries(remappedFreqs)) {
    if ((freq ?? 0) > remappedOptimalFreq) {
      remappedOptimalFreq = freq ?? 0;
      remappedOptimalAction = action;
    }
  }

  // Map GTO action to game ActionType
  const gameAction = gtoActionToGameAction(
    remappedOptimalAction as GtoAction,
    legal,
    gameState.pot.total,
  );

  // Build solver data for SolutionDisplay in coaching UI
  const solverData: CoachingSolverData = {
    frequencies: remappedFreqs,
    optimalAction: remappedOptimalAction as GtoAction,
    optimalFrequency: remappedOptimalFreq,
    availableActions: Object.keys(remappedFreqs).filter(
      (a) => (remappedFreqs[a as GtoAction] ?? 0) > 0.001,
    ) as GtoAction[],
    isExactMatch: result.isExactMatch,
    resolvedCategory: result.handCat.category,
    bands: remappedBands,
    archetypeAccuracy: result.archetypeAccuracy,
    preflopConfidence: result.preflopConfidence,
  };
  enrichWithMixedStrategy(solverData);

  return {
    profileName: "GTO",
    profileId: "gto",
    engineId: result.source === "equity" ? "equity-engine" : "modified-gto",
    actionType: gameAction.actionType,
    amount: gameAction.amount,
    explanation,
    solverData,
  };
}

function detectConsensus(
  advices: CoachingAdvice[],
): CoachingValue["consensus"] {
  if (advices.length === 0) return undefined;

  // Count action types
  const counts = new Map<string, string[]>();
  for (const a of advices) {
    const key = a.actionType;
    const list = counts.get(key) ?? [];
    list.push(a.profileName);
    counts.set(key, list);
  }

  // Find the most common action
  let maxCount = 0;
  let maxAction = "";
  let maxProfiles: string[] = [];
  for (const [action, profiles] of counts) {
    if (profiles.length > maxCount) {
      maxCount = profiles.length;
      maxAction = action;
      maxProfiles = profiles;
    }
  }

  // Need at least 2 agreeing and majority to count as consensus
  if (maxCount >= 2 && maxCount > advices.length / 2) {
    const disagreeing = advices
      .filter((a) => a.actionType !== maxAction)
      .map((a) => a.profileName);
    return {
      actionType: maxAction,
      agreeing: maxProfiles,
      disagreeing,
    };
  }

  return undefined;
}

// remapFrequenciesToLegal is now imported from actionMapping.ts

/**
 * Remap frequency bands to match legal actions (same logic as frequencies).
 */
function remapBandsToLegal(
  bands: ActionFrequencyBands,
  legal: LegalActions,
): ActionFrequencyBands {
  const result: ActionFrequencyBands = { ...bands };

  // fold → check: if can't fold but can check
  if (!legal.canFold && legal.canCheck && result.fold) {
    if (result.check) {
      result.check = mergeBands(result.check, result.fold);
    } else {
      result.check = result.fold;
    }
    delete result.fold;
  }

  if (!legal.canCheck && result.check) {
    // Merge check band into call band (take wider range)
    if (result.call) {
      result.call = mergeBands(result.call, result.check);
    } else {
      result.call = result.check;
    }
    delete result.check;
  } else if (!legal.canCall && result.call) {
    if (result.check) {
      result.check = mergeBands(result.check, result.call);
    } else {
      result.check = result.call;
    }
    delete result.call;
  }

  return result;
}

function mergeBands(
  a: ActionFrequencyBands[keyof ActionFrequencyBands],
  b: ActionFrequencyBands[keyof ActionFrequencyBands],
): ActionFrequencyBands[keyof ActionFrequencyBands] {
  if (!a) return b;
  if (!b) return a;
  return {
    mean: a.mean + b.mean,
    stdDev: Math.max(a.stdDev, b.stdDev),
    min: a.min + b.min,
    max: Math.min(1, a.max + b.max),
    sampleCount: Math.min(a.sampleCount, b.sampleCount),
  };
}

/**
 * Simple string hash for deterministic seeds.
 */
function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    const char = s.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
}
