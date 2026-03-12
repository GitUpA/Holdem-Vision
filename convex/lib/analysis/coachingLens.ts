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
import type { ActionType, GameState, LegalActions } from "../state/game-state";
import type { CardIndex } from "../types/cards";
import type { DecisionContext } from "../opponents/engines/types";
import { getEngineOrDefault } from "../opponents/engines/engineRegistry";
import { classifyCurrentDecision } from "../opponents/autoPlay";
import { resolveProfile } from "../opponents/profileResolver";
import { getAllPresets, PRESET_PROFILES } from "../opponents/presets";
import { currentLegalActions } from "../state/state-machine";
import { seededRandom } from "../primitives/deck";

// GTO frequency table lookups for coaching the GTO profile with solver data
import {
  lookupFrequencies,
  hasTable,
} from "../gto/tables";
import {
  classifyArchetype,
  contextFromGameState,
} from "../gto/archetypeClassifier";
import { categorizeHand } from "../gto/handCategorizer";

// Ensure engines are registered
import "../opponents/engines/basicEngine";
import "../opponents/engines/rangeAwareEngine";
import "../opponents/engines/lookupGtoEngine";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export interface CoachingAdvice {
  profileName: string;
  profileId: string;
  engineId: string;
  actionType: ActionType;
  amount?: number;
  explanation: ExplanationNode;
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

    for (const profile of presets) {
      try {
        // For the GTO profile, prefer solver frequency table data when available
        if (profile.id === "gto" && gtoSolverAdvice) {
          advices.push(gtoSolverAdvice);
          continue;
        }

        const resolved = resolveProfile(profile, (id) => PRESET_PROFILES[id]);
        const situationKey = classifyCurrentDecision(gameState, heroSeat);
        const params = resolved[situationKey];

        // Each profile gets a deterministic seed based on its id
        const seed = hashString(profile.id);
        const random = seededRandom(seed);

        const ctx: DecisionContext = {
          state: gameState,
          seatIndex: heroSeat,
          profile,
          resolvedParams: resolved,
          situationKey,
          params,
          legal,
          potSize: gameState.pot.total,
          holeCards: context.heroCards,
          getBase: (id) => PRESET_PROFILES[id],
          random,
        };

        const engine = getEngineOrDefault(profile.engineId);
        const decision = engine.decide(ctx);

        advices.push({
          profileName: profile.name,
          profileId: profile.id,
          engineId: engine.id,
          actionType: decision.actionType,
          amount: decision.amount,
          explanation: decision.explanation,
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

    const value: CoachingValue = { advices, consensus };

    return {
      value,
      context,
      explanation,
      visuals: advices.length > 0 ? [{
        type: "coaching" as VisualDirectiveType,
        data: { advices, consensus } as Record<string, unknown>,
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
 * Try to produce GTO coaching advice using solver frequency tables.
 * Returns a CoachingAdvice if solver data is available for this spot,
 * or null if we should fall back to the heuristic engine.
 */
function tryGtoSolverLookup(
  gameState: GameState,
  heroSeat: number,
  heroCards: CardIndex[],
  legal: LegalActions,
): CoachingAdvice | null {
  if (heroCards.length < 2) return null;

  // Classify archetype from the game state
  const classCtx = contextFromGameState(gameState, heroSeat);
  const archetype = classifyArchetype(classCtx);

  // Need sufficient confidence and a registered table
  if (archetype.confidence < 0.6 || !hasTable(archetype.archetypeId)) {
    return null;
  }

  // Categorize the hero's hand
  const handCat = categorizeHand(heroCards, gameState.communityCards);

  // Look up GTO frequencies
  const lookup = lookupFrequencies(
    archetype.archetypeId,
    handCat.category,
    classCtx.isInPosition,
  );
  if (!lookup) return null;

  // Find the optimal (highest frequency) action
  let optimalGtoAction = "check";
  let optimalFreq = 0;
  for (const [action, freq] of Object.entries(lookup.frequencies)) {
    if ((freq ?? 0) > optimalFreq) {
      optimalFreq = freq ?? 0;
      optimalGtoAction = action;
    }
  }

  // Map GTO action to game ActionType
  const actionType = mapGtoActionToActionType(optimalGtoAction, legal);
  const amount = mapGtoActionToAmount(optimalGtoAction, legal, gameState.pot.total);

  // Format frequencies for explanation
  const freqChildren: ExplanationNode[] = Object.entries(lookup.frequencies)
    .filter(([, v]) => v && v > 0.01)
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
    .map(([action, freq]) => ({
      summary: `${action}: ${((freq ?? 0) * 100).toFixed(0)}%`,
      sentiment: "neutral" as const,
      tags: ["frequency"],
    }));

  const explanation: ExplanationNode = {
    summary: `${archetype.description} — ${handCat.description}: ${actionType}${amount !== undefined ? ` ${amount}` : ""}`,
    sentiment: actionType === "fold"
      ? "negative"
      : (actionType === "raise" || actionType === "bet")
        ? "positive"
        : "neutral",
    children: [
      {
        summary: `Hand: ${handCat.description} (${handCat.category})`,
        sentiment: handCat.relativeStrength > 0.6 ? "positive" : handCat.relativeStrength > 0.3 ? "neutral" : "negative",
        tags: ["hand-category"],
      },
      {
        summary: `Archetype: ${archetype.description} (${(archetype.confidence * 100).toFixed(0)}% confidence)`,
        sentiment: "neutral",
        tags: ["archetype"],
      },
      {
        summary: `GTO frequencies (solver data):`,
        children: freqChildren,
        sentiment: "neutral",
        tags: ["frequencies", "solver"],
      },
      ...(lookup.isExact ? [] : [{
        summary: `Note: closest category match (original: ${handCat.category})`,
        sentiment: "neutral" as const,
        tags: ["fallback-category"],
      }]),
    ],
    tags: ["lookup-gto", "solver"],
  };

  return {
    profileName: "GTO",
    profileId: "gto",
    engineId: "lookup-gto",
    actionType,
    amount,
    explanation,
  };
}

/**
 * Map a GTO action string to a game ActionType, respecting what's legal.
 */
function mapGtoActionToActionType(gtoAction: string, legal: LegalActions): ActionType {
  switch (gtoAction) {
    case "fold": return legal.canFold ? "fold" : "check";
    case "check": return legal.canCheck ? "check" : "fold";
    case "call": return legal.canCall ? "call" : "check";
    case "bet_small":
    case "bet_medium":
    case "bet_large":
      if (legal.canBet) return "bet";
      if (legal.canRaise) return "raise";
      return legal.canCall ? "call" : "check";
    case "raise_small":
    case "raise_large":
      if (legal.canRaise) return "raise";
      if (legal.canBet) return "bet";
      return legal.canCall ? "call" : "check";
    default:
      return legal.canCheck ? "check" : "fold";
  }
}

/**
 * Map a GTO action to a chip amount for bets/raises.
 */
function mapGtoActionToAmount(
  gtoAction: string,
  legal: LegalActions,
  potSize: number,
): number | undefined {
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

  switch (gtoAction) {
    case "bet_small":
      if (legal.canBet) return clamp(Math.round(potSize * 0.33), legal.betMin, legal.betMax);
      if (legal.canRaise) return clamp(legal.raiseMin + Math.round(potSize * 0.33), legal.raiseMin, legal.raiseMax);
      return undefined;
    case "bet_medium":
      if (legal.canBet) return clamp(Math.round(potSize * 0.75), legal.betMin, legal.betMax);
      if (legal.canRaise) return clamp(legal.raiseMin + Math.round(potSize * 0.75), legal.raiseMin, legal.raiseMax);
      return undefined;
    case "bet_large":
      if (legal.canBet) return clamp(Math.round(potSize * 1.2), legal.betMin, legal.betMax);
      if (legal.canRaise) return clamp(legal.raiseMin + Math.round(potSize * 1.2), legal.raiseMin, legal.raiseMax);
      return undefined;
    case "raise_small":
      if (legal.canRaise) return legal.raiseMin;
      return undefined;
    case "raise_large":
      if (legal.canRaise) return clamp(Math.round(legal.raiseMin * 1.5), legal.raiseMin, legal.raiseMax);
      return undefined;
    case "call":
      return legal.canCall ? legal.callAmount : undefined;
    default:
      return undefined;
  }
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
