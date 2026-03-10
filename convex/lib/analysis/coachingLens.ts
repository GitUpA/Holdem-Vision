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
import type { ActionType } from "../state/game-state";
import type { EngineDecision, DecisionContext } from "../opponents/engines/types";
import { getEngineOrDefault } from "../opponents/engines/engineRegistry";
import { classifyCurrentDecision } from "../opponents/autoPlay";
import { resolveProfile } from "../opponents/profileResolver";
import { getAllPresets, PRESET_PROFILES } from "../opponents/presets";
import { currentLegalActions } from "../state/state-machine";
import { seededRandom } from "../primitives/deck";

// Ensure engines are registered
import "../opponents/engines/basicEngine";
import "../opponents/engines/rangeAwareEngine";

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

    for (const profile of presets) {
      try {
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
