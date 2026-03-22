/**
 * Narrative Prompts — "What's your story here?"
 *
 * Generates 2-3 narrative options for the user to choose from before
 * acting. Each option describes a strategic intent (value, pot control,
 * draw, bluff, etc.) and maps to GTO actions. After acting, the system
 * shows whether the user's narrative matched their action and the GTO reasoning.
 *
 * This is retrieval practice (Bjork): generating the answer before seeing
 * it improves learning. The user practices narrative construction, not
 * frequency memorization.
 *
 * Pure TypeScript, zero Convex imports.
 */

import type { HandCategorization, HandCategory } from "./handCategorizer";
import type { ActionFrequencies, GtoAction } from "./tables/types";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export type NarrativeIntentId =
  | "value_strong"
  | "value_thin"
  | "pot_control"
  | "draw_priced_in"
  | "draw_semi_bluff"
  | "bluff_fold_equity"
  | "give_up";

export interface NarrativeOption {
  id: NarrativeIntentId;
  /** User-facing label */
  label: string;
  /** One-sentence elaboration */
  detail: string;
  /** Which GTO actions this narrative typically maps to */
  mappedActions: GtoAction[];
  /** How well this narrative fits the actual hand (0-1) */
  fitness: number;
}

export interface NarrativePrompt {
  /** The question */
  question: string;
  /** 2-3 narrative options, sorted by plausibility */
  options: NarrativeOption[];
  /** The narrative that best matches GTO strategy */
  gtoNarrative: NarrativeIntentId;
}

// ═══════════════════════════════════════════════════════
// INTENT DEFINITIONS
// ═══════════════════════════════════════════════════════

interface IntentDef {
  id: NarrativeIntentId;
  label: string;
  detail: string;
  mappedActions: GtoAction[];
  /** Which hand categories fit this intent */
  fitCategories: Set<HandCategory>;
  /** Strength range where this intent makes sense [min, max] */
  strengthRange: [number, number];
  /** Bonus fitness for specific context conditions */
  contextBonus?: (ctx: PromptContext) => number;
}

interface PromptContext {
  handCat: HandCategorization;
  isInPosition: boolean;
  isPreflop: boolean;
  frequencies: ActionFrequencies;
}

const INTENTS: IntentDef[] = [
  {
    id: "value_strong",
    label: "I have a strong hand and want maximum value",
    detail: "Your hand is strong enough to bet big and get called by worse hands.",
    mappedActions: ["bet_medium", "bet_large", "raise_large", "raise_small"],
    fitCategories: new Set(["sets_plus", "two_pair", "premium_pair", "overpair", "top_pair_top_kicker"]),
    strengthRange: [0.65, 1.0],
  },
  {
    id: "value_thin",
    label: "My hand is decent — I can bet small for thin value",
    detail: "Your hand is good but not great. A small bet extracts value from slightly worse hands.",
    mappedActions: ["bet_small", "bet_medium"],
    fitCategories: new Set(["top_pair_weak_kicker", "middle_pair", "overpair"]),
    strengthRange: [0.4, 0.75],
  },
  {
    id: "pot_control",
    label: "I want to see a showdown cheaply — pot control",
    detail: "Your hand has showdown value but isn't strong enough to build a big pot.",
    mappedActions: ["check", "call"],
    fitCategories: new Set(["top_pair_weak_kicker", "middle_pair", "bottom_pair", "overcards"]),
    strengthRange: [0.2, 0.65],
  },
  {
    id: "draw_priced_in",
    label: "I'm drawing and the price is right to continue",
    detail: "You have outs to improve. If the pot odds are good enough, calling is profitable.",
    mappedActions: ["call", "check"],
    fitCategories: new Set(["flush_draw", "straight_draw", "combo_draw", "weak_draw"]),
    strengthRange: [0.15, 0.6],
    contextBonus: (ctx) => ctx.isInPosition ? 0.1 : 0,
  },
  {
    id: "draw_semi_bluff",
    label: "I'm drawing but want to bet — semi-bluff for fold equity",
    detail: "You don't have the best hand yet, but a bet can win the pot now or give you a free card.",
    mappedActions: ["bet_medium", "bet_large", "raise_small", "raise_large"],
    fitCategories: new Set(["flush_draw", "straight_draw", "combo_draw"]),
    strengthRange: [0.3, 0.65],
    contextBonus: (ctx) => ctx.isInPosition ? 0.1 : -0.05,
  },
  {
    id: "bluff_fold_equity",
    label: "I have nothing — but I can tell a story and make them fold",
    detail: "Your hand can't win at showdown. The only way to profit is making opponents fold.",
    mappedActions: ["bet_medium", "bet_large", "raise_large"],
    fitCategories: new Set(["air", "weak_draw", "overcards"]),
    strengthRange: [0.0, 0.25],
    contextBonus: (ctx) => ctx.isInPosition ? 0.15 : 0,
  },
  {
    id: "give_up",
    label: "This isn't my spot — fold and wait for a better one",
    detail: "Sometimes the best play is to save your chips. No hand, no draw, no fold equity.",
    mappedActions: ["fold"],
    fitCategories: new Set(["air", "weak_draw", "bottom_pair"]),
    strengthRange: [0.0, 0.2],
  },
];

// ═══════════════════════════════════════════════════════
// FITNESS SCORING
// ═══════════════════════════════════════════════════════

function computeFitness(intent: IntentDef, ctx: PromptContext): number {
  let fitness = 0;

  // Category match (0.4 weight)
  if (intent.fitCategories.has(ctx.handCat.category)) {
    fitness += 0.4;
  }

  // Strength range match (0.3 weight)
  const strength = ctx.handCat.relativeStrength;
  const [min, max] = intent.strengthRange;
  const catStrength = getCategoryStrength(ctx.handCat.category);
  const effectiveStrength = catStrength * 0.7 + strength * 0.3; // blend category base + relative

  if (effectiveStrength >= min && effectiveStrength <= max) {
    fitness += 0.3;
  } else {
    // Partial credit for being close
    const dist = Math.min(Math.abs(effectiveStrength - min), Math.abs(effectiveStrength - max));
    fitness += Math.max(0, 0.3 - dist);
  }

  // GTO frequency alignment (0.2 weight)
  const actionOverlap = intent.mappedActions.reduce(
    (sum, a) => sum + (ctx.frequencies[a] ?? 0),
    0,
  );
  fitness += actionOverlap * 0.2;

  // Context bonus (0.1 weight)
  if (intent.contextBonus) {
    fitness += intent.contextBonus(ctx) * 0.1;
  }

  // Preflop adjustments
  if (ctx.isPreflop) {
    // On preflop, draw intents don't apply
    if (intent.id === "draw_priced_in" || intent.id === "draw_semi_bluff") {
      fitness *= 0.1;
    }
  }

  return Math.max(0, Math.min(1, fitness));
}

const CATEGORY_STRENGTHS: Record<HandCategory, number> = {
  sets_plus: 1.0,
  two_pair: 0.85,
  premium_pair: 0.82,
  overpair: 0.78,
  top_pair_top_kicker: 0.7,
  top_pair_weak_kicker: 0.6,
  middle_pair: 0.45,
  bottom_pair: 0.35,
  combo_draw: 0.5,
  flush_draw: 0.4,
  straight_draw: 0.33,
  overcards: 0.25,
  weak_draw: 0.15,
  air: 0.05,
};

function getCategoryStrength(cat: HandCategory): number {
  return CATEGORY_STRENGTHS[cat] ?? 0.3;
}

// ═══════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════

export function buildNarrativePrompt(
  handCat: HandCategorization,
  isInPosition: boolean,
  isPreflop: boolean,
  frequencies: ActionFrequencies,
): NarrativePrompt {
  const ctx: PromptContext = { handCat, isInPosition, isPreflop, frequencies };

  // Score all intents
  const scored = INTENTS.map((intent) => ({
    ...intent,
    fitness: computeFitness(intent, ctx),
  }));

  // Sort by fitness descending
  scored.sort((a, b) => b.fitness - a.fitness);

  // Select top 3, ensuring at least 2 different action mappings
  const selected: NarrativeOption[] = [];
  const actionFamilies = new Set<string>();

  for (const intent of scored) {
    if (selected.length >= 3) break;

    const family = intent.mappedActions[0]?.replace(/_.*/, "") ?? "unknown";

    // Skip if we already have 2 from the same action family
    if (selected.length >= 2 && actionFamilies.size < 2 && actionFamilies.has(family)) {
      continue;
    }

    selected.push({
      id: intent.id,
      label: intent.label,
      detail: intent.detail,
      mappedActions: intent.mappedActions,
      fitness: intent.fitness,
    });
    actionFamilies.add(family);
  }

  // Determine which narrative best matches GTO
  const gtoOptimal = Object.entries(frequencies)
    .filter(([, v]) => (v ?? 0) > 0)
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))[0]?.[0] as GtoAction | undefined;

  let gtoNarrative: NarrativeIntentId = selected[0]?.id ?? "pot_control";
  if (gtoOptimal) {
    const bestMatch = selected.find((opt) =>
      opt.mappedActions.includes(gtoOptimal),
    );
    if (bestMatch) gtoNarrative = bestMatch.id;
  }

  return {
    question: "What's your story here?",
    options: selected,
    gtoNarrative,
  };
}

/**
 * Check if the user's narrative choice aligns with their action.
 */
export function checkNarrativeAlignment(
  narrativeChoice: NarrativeIntentId,
  userAction: GtoAction,
): "aligned" | "mixed" | "contradicted" {
  const intent = INTENTS.find((i) => i.id === narrativeChoice);
  if (!intent) return "mixed";

  if (intent.mappedActions.includes(userAction)) return "aligned";

  // Check if action family overlaps (e.g., bet_small vs bet_medium)
  const actionFamily = userAction.replace(/_.*/, "");
  const intentFamilies = new Set(intent.mappedActions.map((a) => a.replace(/_.*/, "")));
  if (intentFamilies.has(actionFamily)) return "mixed";

  return "contradicted";
}
