/**
 * Narrative Feedback — what your action "said" to opponents.
 *
 * After the user acts in quiz mode, this module generates narrative
 * feedback connecting their action to the GTO reasoning. It explains
 * what the action communicated, whether it aligned with their stated
 * narrative intent, and the teaching principle for this spot.
 *
 * Pure TypeScript, zero Convex imports.
 */

import type { GtoAction, ActionFrequencies } from "./tables/types";
import type { NarrativeIntentId } from "./narrativePrompts";
import { checkNarrativeAlignment } from "./narrativePrompts";
import { getPrototype } from "./archetypePrototypes";
import type { ArchetypeId } from "./archetypeClassifier";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export interface NarrativeFeedback {
  /** What the user's action communicated to opponents */
  actionNarrative: string;
  /** How GTO differs (null if user chose optimally) */
  gtoContrastNarrative: string | null;
  /** Did the user's narrative choice match their action? */
  narrativeAlignment: "aligned" | "mixed" | "contradicted" | null;
  /** Teaching sentence connecting the spot to a transferable principle */
  principleConnection: string;
}

// ═══════════════════════════════════════════════════════
// ACTION NARRATIVES — what each action "says"
// ═══════════════════════════════════════════════════════

const ACTION_STORIES: Record<string, string> = {
  fold: "You gave up the hand. Your story ends here — opponents know you couldn't continue.",
  check: "You showed passivity. Opponents read this as weakness, a trap, or pot control.",
  call: "You continued without raising. Your story says 'I have something, but I'm not sure how strong.'",
  bet_small: "A small bet tells a cautious story — value from thin hands or a cheap bluff.",
  bet_medium: "A standard bet says 'I'm confident.' It pressures opponents while building the pot.",
  bet_large: "A big bet is a strong statement — 'I have it, or I want you to think I do.'",
  raise_small: "A min-raise says 'I want to build the pot cheaply' — often draws or thin value.",
  raise_large: "A big raise is a power move — 'I'm very strong or this is a big bluff.'",
};

// ═══════════════════════════════════════════════════════
// GTO CONTRAST — why the solver prefers something different
// ═══════════════════════════════════════════════════════

function buildGtoContrast(
  userAction: GtoAction,
  optimalAction: GtoAction,
  optimalFrequency: number,
  frequencies: ActionFrequencies,
): string | null {
  if (userAction === optimalAction) return null;

  const userFreq = frequencies[userAction] ?? 0;
  const optFreq = optimalFrequency;

  // Both are high-frequency — mixed strategy, user chose the minority
  if (userFreq >= 0.25) {
    return `Your action is valid here (${(userFreq * 100).toFixed(0)}% of the time). GTO slightly prefers ${formatAction(optimalAction)} (${(optFreq * 100).toFixed(0)}%), but this is a close spot where both work.`;
  }

  // User chose a rarely-used action
  if (userFreq >= 0.10) {
    return `GTO plays ${formatAction(optimalAction)} ${(optFreq * 100).toFixed(0)}% of the time here. Your ${formatAction(userAction)} is acceptable but less common — it works sometimes but isn't the primary strategy.`;
  }

  // User chose an action GTO almost never takes
  return `A balanced player would ${formatAction(optimalAction)} here ${(optFreq * 100).toFixed(0)}% of the time. ${formatAction(userAction, true)} is rarely correct in this spot because it doesn't fit the story the board and ranges are telling.`;
}

function formatAction(action: GtoAction, capitalize = false): string {
  const names: Record<string, string> = {
    fold: "fold",
    check: "check",
    call: "call",
    bet_small: "bet small",
    bet_medium: "bet",
    bet_large: "bet big",
    raise_small: "min-raise",
    raise_large: "raise",
  };
  const name = names[action] ?? action;
  return capitalize ? name.charAt(0).toUpperCase() + name.slice(1) : name;
}

// ═══════════════════════════════════════════════════════
// ALIGNMENT FEEDBACK
// ═══════════════════════════════════════════════════════

const ALIGNMENT_TEXT: Record<string, string> = {
  aligned: "Your action matched your stated narrative — you did what you said you'd do. That's consistency.",
  mixed: "Your action partially matched your narrative — the direction was right but the execution differed slightly.",
  contradicted: "Your action contradicted your narrative. You said one thing but did another — opponents notice this inconsistency.",
};

// ═══════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════

export function buildNarrativeFeedback(
  userAction: GtoAction,
  narrativeChoice: NarrativeIntentId | null,
  optimalAction: GtoAction,
  optimalFrequency: number,
  frequencies: ActionFrequencies,
  archetypeId?: ArchetypeId,
): NarrativeFeedback {
  // What the action communicated
  const actionKey = userAction.replace(/_.*/, "") === "bet" || userAction.replace(/_.*/, "") === "raise"
    ? userAction
    : userAction;
  const actionNarrative = ACTION_STORIES[actionKey] ?? ACTION_STORIES[userAction.replace(/_.*/, "")] ?? `You chose ${userAction}.`;

  // GTO contrast
  const gtoContrastNarrative = buildGtoContrast(userAction, optimalAction, optimalFrequency, frequencies);

  // Narrative alignment
  let narrativeAlignment: NarrativeFeedback["narrativeAlignment"] = null;
  if (narrativeChoice) {
    narrativeAlignment = checkNarrativeAlignment(narrativeChoice, userAction);
  }

  // Teaching principle from archetype
  let principleConnection = "Every action at the table is a sentence in your story. Make sure your sentences make sense together.";
  if (archetypeId) {
    const proto = getPrototype(archetypeId);
    if (proto?.feeling) {
      principleConnection = proto.feeling;
    }
  }

  return {
    actionNarrative,
    gtoContrastNarrative,
    narrativeAlignment,
    principleConnection,
  };
}
