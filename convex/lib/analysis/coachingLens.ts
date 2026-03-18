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
import { getEngineOrDefault } from "../opponents/engines/engineRegistry";
import { buildDecisionContext } from "../opponents/autoPlay";
import { getAllPresets, PRESET_PROFILES } from "../opponents/presets";
import { currentLegalActions } from "../state/state-machine";
import { seededRandom } from "../primitives/deck";

// GTO frequency table lookups for coaching the GTO profile with solver data
import {
  lookupFrequencies,
  hasTable,
  lookupPreflopHandClass,
  handClassToActionFrequencies,
  getPreflopConfidence,
  lookupPostflopHandClass,
  postflopHandClassToActionFrequencies,
} from "../gto/tables";
import { comboToHandClass, cardsToCombo } from "../opponents/combos";
import type { ActionFrequencies, ActionFrequencyBands, GtoAction } from "../gto/tables/types";
import type { ArchetypeAccuracy } from "../gto/tables/types";
import type { AccuracyImpact } from "../gto/tables/types";
import {
  classifyArchetype,
  contextFromGameState,
} from "../gto/archetypeClassifier";
import { categorizeHand } from "../gto/handCategorizer";
import { explainArchetype } from "../gto/archetypeExplainer";
import { gtoActionToGameAction, remapFrequenciesToLegal } from "../gto/actionMapping";

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
  const street = gameState.currentStreet;

  // Preflop: try per-hand-class lookup first (169 grid from PokerBench)
  if (street === "preflop") {
    const combo = cardsToCombo(heroCards[0], heroCards[1]);
    const handClass = comboToHandClass(combo);
    const position = gameState.players[heroSeat].position;
    // Find the opener position for position-aware lookup
    const openerPos = findPreflopOpenerFromState(gameState, heroSeat);
    const hcLookup = lookupPreflopHandClass(archetype.archetypeId, position, handClass, openerPos);

    if (hcLookup) {
      const handCat = categorizeHand(heroCards, gameState.communityCards);
      const frequencies = handClassToActionFrequencies(hcLookup, archetype.archetypeId);
      const explanation = explainArchetype(archetype, handCat, classCtx.isInPosition, undefined, street);
      const remappedFreqs = remapFrequenciesToLegal(frequencies, legal);

      let remappedOptimalAction = "check";
      let remappedOptimalFreq = 0;
      for (const [action, freq] of Object.entries(remappedFreqs)) {
        if ((freq ?? 0) > remappedOptimalFreq) {
          remappedOptimalFreq = freq ?? 0;
          remappedOptimalAction = action;
        }
      }

      const gameAction = gtoActionToGameAction(remappedOptimalAction as GtoAction, legal, gameState.pot.total);
      const solverData: CoachingSolverData = {
        frequencies: remappedFreqs,
        optimalAction: remappedOptimalAction as GtoAction,
        optimalFrequency: remappedOptimalFreq,
        availableActions: Object.keys(remappedFreqs).filter(
          (a) => (remappedFreqs[a as GtoAction] ?? 0) > 0.001,
        ) as GtoAction[],
        isExactMatch: true,
        resolvedCategory: handCat.category,
        preflopConfidence: getPreflopConfidence(hcLookup),
      };

      return {
        profileName: "GTO",
        profileId: "gto",
        engineId: "modified-gto",
        actionType: gameAction.actionType,
        amount: gameAction.amount,
        explanation,
        solverData,
      };
    }
  }

  // Postflop (or preflop fallback): use solver table by hand category
  const lookupArchetypeId = archetype.textureArchetypeId ?? archetype.archetypeId;

  // Need sufficient confidence and a registered table
  if (archetype.confidence < 0.6 || !hasTable(lookupArchetypeId, street)) {
    // Try PokerBench postflop fallback before giving up
    if (street !== "preflop" && heroCards.length >= 2) {
      const pbCombo = cardsToCombo(heroCards[0], heroCards[1]);
      const pbHandClass = comboToHandClass(pbCombo);
      const pbLookup = lookupPostflopHandClass(lookupArchetypeId, pbHandClass, classCtx.isInPosition, street);
      if (pbLookup) {
        const handCat = categorizeHand(heroCards, gameState.communityCards);
        const frequencies = postflopHandClassToActionFrequencies(pbLookup);
        const explanation = explainArchetype(archetype, handCat, classCtx.isInPosition, undefined, street);
        const remappedFreqs = remapFrequenciesToLegal(frequencies, legal);

        let optAction = "check";
        let optFreq = 0;
        for (const [action, freq] of Object.entries(remappedFreqs)) {
          if ((freq ?? 0) > optFreq) {
            optFreq = freq ?? 0;
            optAction = action;
          }
        }

        const gameAction = gtoActionToGameAction(optAction as GtoAction, legal, gameState.pot.total);
        return {
          profileName: "GTO",
          profileId: "gto",
          engineId: "modified-gto",
          actionType: gameAction.actionType,
          amount: gameAction.amount,
          explanation,
          solverData: {
            frequencies: remappedFreqs,
            optimalAction: optAction as GtoAction,
            optimalFrequency: optFreq,
            availableActions: Object.keys(remappedFreqs).filter(
              (a) => (remappedFreqs[a as GtoAction] ?? 0) > 0.001,
            ) as GtoAction[],
            isExactMatch: false,
            resolvedCategory: handCat.category,
          },
        };
      }
    }
    return null;
  }

  // Categorize the hero's hand
  const handCat = categorizeHand(heroCards, gameState.communityCards);

  // Look up GTO frequencies (with per-hand-class granularity when available)
  const postflopCombo = cardsToCombo(heroCards[0], heroCards[1]);
  const postflopHandClass = comboToHandClass(postflopCombo);
  const lookup = lookupFrequencies(
    lookupArchetypeId,
    handCat.category,
    classCtx.isInPosition,
    street,
    postflopHandClass,
  );
  if (!lookup) return null;

  // Use shared explainer — same rich explanation for coaching and drill
  const explanation = explainArchetype(archetype, handCat, classCtx.isInPosition, undefined, street);

  // Remap solver frequencies to match what's actually legal
  // (e.g., solver "check" → "call" when facing a bet)
  const remappedFreqs = remapFrequenciesToLegal(lookup.frequencies, legal);
  const remappedBands = lookup.bands
    ? remapBandsToLegal(lookup.bands, legal)
    : undefined;

  // Recompute optimal after remapping
  let remappedOptimalAction = "check";
  let remappedOptimalFreq = 0;
  for (const [action, freq] of Object.entries(remappedFreqs)) {
    if ((freq ?? 0) > remappedOptimalFreq) {
      remappedOptimalFreq = freq ?? 0;
      remappedOptimalAction = action;
    }
  }

  // Map the remapped optimal GTO action to game ActionType
  // Uses the shared actionMapping to ensure coaching row matches the solver panel
  const gameAction = gtoActionToGameAction(
    remappedOptimalAction as GtoAction,
    legal,
    gameState.pot.total,
  );
  const actionType = gameAction.actionType;
  const amount = gameAction.amount;

  // Build solver data for SolutionDisplay in coaching UI
  const solverData: CoachingSolverData = {
    frequencies: remappedFreqs,
    optimalAction: remappedOptimalAction as GtoAction,
    optimalFrequency: remappedOptimalFreq,
    availableActions: Object.keys(remappedFreqs).filter(
      (a) => (remappedFreqs[a as GtoAction] ?? 0) > 0.001,
    ) as GtoAction[],
    isExactMatch: lookup.isExact,
    resolvedCategory: handCat.category,
    bands: remappedBands,
    archetypeAccuracy: lookup.archetypeAccuracy,
  };

  return {
    profileName: "GTO",
    profileId: "gto",
    engineId: "modified-gto",
    actionType,
    amount,
    explanation,
    solverData,
  };
}

/** Find the first preflop raiser's position (the opener) from action history. */
function findPreflopOpenerFromState(state: GameState, heroSeat: number): string | undefined {
  for (const action of state.actionHistory) {
    if (action.street !== "preflop") break;
    if (action.seatIndex === heroSeat) continue;
    if (action.actionType === "raise" || action.actionType === "bet") {
      return action.position;
    }
  }
  return undefined;
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
