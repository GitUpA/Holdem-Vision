/**
 * Hand Commentator — one coherent real-time narrative that reads
 * the WHOLE observable game state and tells the user what's happening.
 *
 * Composes: opponent stories + action narratives + board narrative +
 * hand assessment + GTO frequencies into a single flowing paragraph.
 *
 * This is the poker coach sitting next to you — not frequency bars,
 * not separated panels, but one voice that understands all the stories
 * at the table and synthesizes a recommendation grounded in WHY.
 *
 * Pure TypeScript, zero Convex imports.
 */
import type { CardIndex, Position, Street } from "../types/cards";
import type { ActionType, GameState, LegalActions } from "../state/gameState";
import type { OpponentProfile } from "../types/opponents";
import type { ActionFrequencies } from "../gto/tables/types";
import type { HandCategorization } from "../gto/handCategorizer";
import type { ArchetypeClassification } from "../gto/archetypeClassifier";
import type { OpponentStory } from "./opponentStory";
import type { ActionStory } from "../gto/actionNarratives";
import type { InferredBehavior } from "../opponents/behaviorInference";
import type { CounterAdvice } from "../pipeline/counterStrategyMap";
import type { ConfidenceTier } from "../gto/dataConfidence";
import { cardToDisplay } from "../primitives/card";
import { positionDisplayName } from "../primitives/position";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export interface HandCommentary {
  /** The full narrative paragraph — the coach's voice */
  narrative: string;
  /** One-line summary for collapsed view */
  summary: string;
  /** The recommended action from the narrative */
  recommendedAction: ActionType | null;
  /** Confidence in the recommendation */
  confidence: "clear" | "leaning" | "close_spot";
}

export interface CommentaryInput {
  /** Hero's hole cards */
  heroCards: CardIndex[];
  /** Community cards */
  communityCards: CardIndex[];
  /** Current game state */
  gameState: GameState;
  /** Hero's seat index */
  heroSeat: number;
  /** Hero's legal actions */
  legal: LegalActions;
  /** Hand categorization */
  handCat?: HandCategorization;
  /** Archetype classification */
  archetype?: ArchetypeClassification;
  /** Opponent stories (pre-computed) */
  opponentStories?: OpponentStory[];
  /** Action stories (pre-computed) */
  actionStories?: ActionStory[];
  /** GTO frequencies (pre-computed) */
  gtoFrequencies?: ActionFrequencies;
  /** GTO optimal action */
  gtoOptimalAction?: string;
  /** Counter-strategy advice (Layer 10) */
  counterAdvice?: CounterAdvice;
  /** Inferred opponent behavior (Layer 7) */
  inferredBehavior?: InferredBehavior;
  /** Data confidence tier — modulates coaching language strength */
  confidenceTier?: ConfidenceTier;
}

// ═══════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════

export function commentateHand(input: CommentaryInput): HandCommentary {
  const {
    heroCards, communityCards, gameState, heroSeat, legal,
    handCat, archetype, opponentStories, actionStories, gtoFrequencies, gtoOptimalAction,
    counterAdvice, inferredBehavior, confidenceTier,
  } = input;

  const street = gameState.currentStreet;
  const hero = gameState.players[heroSeat];
  const heroPosition = hero?.position;
  const heroCardStr = heroCards.length >= 2
    ? `${cardToDisplay(heroCards[0])} ${cardToDisplay(heroCards[1])}`
    : "unknown cards";
  const heroHandDesc = handCat?.description ?? "unknown hand";
  const posLabel = heroPosition ? positionDisplayName(heroPosition) : "unknown position";

  // Gather active opponents (not folded, not hero)
  const activeOpponents = gameState.players.filter(
    (p) => p.seatIndex !== heroSeat && (p.status === "active" || p.status === "all_in"),
  );

  const parts: string[] = [];

  // ── Part 1: The Scene ──
  if (street === "preflop") {
    parts.push(buildPreflopScene(gameState, heroSeat, heroCardStr, posLabel, archetype));
  } else {
    parts.push(buildPostflopScene(communityCards, street, heroCardStr, heroHandDesc, posLabel, archetype));
  }

  // ── Part 2: Opponent Stories ──
  if (opponentStories && opponentStories.length > 0) {
    parts.push(buildOpponentSection(opponentStories, activeOpponents, gameState, inferredBehavior));
  } else if (activeOpponents.length > 0) {
    parts.push(buildBasicOpponentSection(activeOpponents, gameState));
  }

  // ── Part 3: Hero Assessment ──
  parts.push(buildHeroAssessment(
    heroCardStr, heroHandDesc, handCat, street,
    opponentStories, legal, gameState,
  ));

  // ── Part 4: Recommendation ──
  const { recommendation, confidence, recommendedAction } = buildRecommendation(
    handCat, opponentStories, actionStories, gtoFrequencies, gtoOptimalAction,
    legal, street, counterAdvice, confidenceTier,
  );
  parts.push(recommendation);

  const narrative = parts.join(" ");
  const summary = buildSummary(heroHandDesc, posLabel, recommendedAction, confidence, street);

  return {
    narrative,
    summary,
    recommendedAction,
    confidence,
  };
}

// ═══════════════════════════════════════════════════════
// SCENE BUILDERS
// ═══════════════════════════════════════════════════════

function buildPreflopScene(
  state: GameState,
  heroSeat: number,
  heroCardStr: string,
  posLabel: string,
  archetype?: ArchetypeClassification,
): string {
  // Count raises to understand the action
  const raises = state.actionHistory.filter(
    (a) => a.street === "preflop" && (a.actionType === "raise" || a.actionType === "bet"),
  );
  const heroRaises = raises.filter((a) => a.seatIndex === heroSeat);
  const villainRaises = raises.filter((a) => a.seatIndex !== heroSeat);

  const archetypeLabel = archetype ? archetype.archetypeId.replace(/_/g, " ") : "";

  if (villainRaises.length === 0) {
    return `You're on the ${posLabel} with ${heroCardStr}. No one has raised yet — you have the initiative.`;
  }

  if (villainRaises.length === 1) {
    const raiser = state.players.find((p) => p.seatIndex === villainRaises[0].seatIndex);
    const raiserPos = raiser ? positionDisplayName(raiser.position) : "a player";
    const raiseAmount = villainRaises[0].amount ?? 0;
    if (heroRaises.length === 0) {
      return `You're on the ${posLabel} with ${heroCardStr}. ${raiserPos} opened to ${raiseAmount} BB — you're deciding whether to enter this pot.`;
    }
    return `You're on the ${posLabel} with ${heroCardStr}. You raised, and ${raiserPos} 3-bet to ${raiseAmount} BB. This is a ${archetypeLabel || "3-bet"} spot.`;
  }

  if (villainRaises.length >= 2) {
    const lastRaise = villainRaises[villainRaises.length - 1];
    const raiser = state.players.find((p) => p.seatIndex === lastRaise.seatIndex);
    const raiserPos = raiser ? positionDisplayName(raiser.position) : "a player";
    return `You're on the ${posLabel} with ${heroCardStr}. There have been ${raises.length} raises — ${raiserPos} has ${lastRaise.amount} BB in. This is a ${archetypeLabel || "multi-bet"} pot where stacks are on the line.`;
  }

  return `You're on the ${posLabel} with ${heroCardStr}.`;
}

function buildPostflopScene(
  communityCards: CardIndex[],
  street: Street,
  heroCardStr: string,
  heroHandDesc: string,
  posLabel: string,
  archetype?: ArchetypeClassification,
): string {
  const boardStr = communityCards.map(cardToDisplay).join(" ");
  const archetypeLabel = archetype
    ? archetype.archetypeId.replace(/_/g, " ")
    : "";

  const streetName = street === "flop" ? "Flop" : street === "turn" ? "Turn" : "River";

  return `${streetName}: ${boardStr}. You're on the ${posLabel} with ${heroCardStr} (${heroHandDesc}).${archetypeLabel ? ` This is a ${archetypeLabel} board.` : ""}`;
}

// ═══════════════════════════════════════════════════════
// OPPONENT SECTION
// ═══════════════════════════════════════════════════════

function buildOpponentSection(
  stories: OpponentStory[],
  activeOpponents: GameState["players"],
  state: GameState,
  inferredBehavior?: InferredBehavior,
): string {
  if (stories.length === 0) return "";

  const parts: string[] = [];

  for (const story of stories) {
    // Find the opponent's last action
    const lastNarrative = story.streetNarratives[story.streetNarratives.length - 1];
    if (!lastNarrative) continue;

    const rangeLabel = story.data.rangePercent < 10 ? "very narrow"
      : story.data.rangePercent < 20 ? "narrow"
      : story.data.rangePercent < 35 ? "moderate"
      : "wide";

    parts.push(
      `Their story: ${rangeLabel} range (~${story.data.rangePercent.toFixed(0)}% of hands). ` +
      `${lastNarrative.interpretation}`,
    );
  }

  // Hole 3: Surface inferred behavior pattern with confidence
  if (inferredBehavior && inferredBehavior.pattern !== "unknown" && inferredBehavior.confidence > 0) {
    const confPct = (inferredBehavior.confidence * 100).toFixed(0);
    const patternLabel = inferredBehavior.pattern.replace("-", "-");
    parts.push(`Villain appears to be playing ${patternLabel} (confidence: ${confPct}%).`);
  }

  return parts.join(" ");
}

function buildBasicOpponentSection(
  activeOpponents: { seatIndex: number; position: Position; status: string }[],
  state: GameState,
): string {
  const parts: string[] = [];
  for (const opp of activeOpponents) {
    const oppActions = state.actionHistory.filter((a) => a.seatIndex === opp.seatIndex);
    const lastAction = oppActions[oppActions.length - 1];
    if (lastAction) {
      const posName = positionDisplayName(opp.position);
      parts.push(`${posName} ${lastAction.actionType}${lastAction.amount ? `ed ${lastAction.amount} BB` : "ed"}.`);
    }
  }
  return parts.length > 0 ? parts.join(" ") : "";
}

// ═══════════════════════════════════════════════════════
// HERO ASSESSMENT
// ═══════════════════════════════════════════════════════

function buildHeroAssessment(
  heroCardStr: string,
  heroHandDesc: string,
  handCat: HandCategorization | undefined,
  street: Street,
  opponentStories: OpponentStory[] | undefined,
  legal: LegalActions,
  state: GameState,
): string {
  const strength = handCat?.relativeStrength ?? 0.5;

  // Get hero's equity vs strongest opponent
  const bestOppEquity = opponentStories && opponentStories.length > 0
    ? Math.min(...opponentStories.map((s) => s.data.equityVsRange))
    : null;

  if (bestOppEquity !== null) {
    const eqPct = (bestOppEquity * 100).toFixed(0);
    if (bestOppEquity < 0.3) {
      return `Your ${heroHandDesc} is behind — only ${eqPct}% equity against their likely range. But pot odds may justify continuing.`;
    }
    if (bestOppEquity < 0.45) {
      return `Your ${heroHandDesc} has ${eqPct}% equity against their range — marginal. This is a spot where your story needs to be convincing or you fold.`;
    }
    if (bestOppEquity > 0.6) {
      return `Your ${heroHandDesc} is strong against their range — ${eqPct}% equity. You have a story worth telling.`;
    }
    return `Your ${heroHandDesc} has ${eqPct}% equity — it's close. Position and pot odds matter here.`;
  }

  // No opponent story — use hand strength alone
  if (strength > 0.7) {
    return `Your ${heroHandDesc} is strong. You have a clear story to tell.`;
  }
  if (strength > 0.4) {
    return `Your ${heroHandDesc} is playable but not premium. Choose your story carefully.`;
  }
  return `Your ${heroHandDesc} is weak. You'll need a convincing story or the right price to continue.`;
}

// ═══════════════════════════════════════════════════════
// RECOMMENDATION
// ═══════════════════════════════════════════════════════

function buildRecommendation(
  handCat: HandCategorization | undefined,
  opponentStories: OpponentStory[] | undefined,
  actionStories: ActionStory[] | undefined,
  gtoFrequencies: ActionFrequencies | undefined,
  gtoOptimalAction: string | undefined,
  legal: LegalActions,
  street: Street,
  counterAdvice?: CounterAdvice,
  confidenceTier?: ConfidenceTier,
): { recommendation: string; confidence: HandCommentary["confidence"]; recommendedAction: ActionType | null } {
  // Determine the recommended action from GTO or opponent story
  let recommendedAction: ActionType | null = null;
  let confidence: HandCommentary["confidence"] = "close_spot";

  // GTO is the primary recommendation — opponent story provides narrative context
  if (gtoOptimalAction) {
    if (gtoOptimalAction === "fold") recommendedAction = "fold";
    else if (gtoOptimalAction === "check") recommendedAction = legal.canCheck ? "check" : "call";
    else if (gtoOptimalAction === "call") recommendedAction = "call";
    else if (gtoOptimalAction.startsWith("bet")) recommendedAction = "bet";
    else if (gtoOptimalAction.startsWith("raise")) recommendedAction = "raise";
  }

  // Opponent story adds narrative tension but does NOT override GTO
  const strongestOpp = opponentStories?.length
    ? opponentStories.reduce((a, b) => a.data.equityVsRange < b.data.equityVsRange ? a : b)
    : undefined;

  // Determine confidence
  if (gtoFrequencies) {
    const values = Object.values(gtoFrequencies).filter((v) => (v ?? 0) > 0);
    const maxFreq = Math.max(...values.map((v) => v ?? 0));
    if (maxFreq > 0.7) confidence = "clear";
    else if (maxFreq > 0.5) confidence = "leaning";
    else confidence = "close_spot";
  }

  // Build the recommendation text
  const gtoConfirmation = gtoFrequencies ? buildGtoConfirmation(gtoFrequencies, gtoOptimalAction, confidenceTier) : "";

  // Find the matching action story
  const actionNarrative = actionStories?.find((s) => s.action === recommendedAction);

  let recommendation: string;

  // Detect tension: GTO says continue but equity says fold (MDF / bluff-catching spots)
  const equityVsStory = strongestOpp?.data.equityVsRange;
  const gtoSaysContinue = recommendedAction && recommendedAction !== "fold";
  const equitySaysFold = equityVsStory !== undefined && equityVsStory < 0.3 && strongestOpp?.confidence !== "speculative";
  const isMdfSpot = gtoSaysContinue && equitySaysFold;

  if (recommendedAction === "fold") {
    const reason = actionNarrative?.counterNarrative ?? "The math doesn't support continuing.";
    recommendation = `Fold. ${reason}${gtoConfirmation}`;
  } else if (isMdfSpot && recommendedAction === "call") {
    // Special MDF narrative: equity is low but pot odds demand a call
    const eqPct = equityVsStory !== undefined ? (equityVsStory * 100).toFixed(0) : "?";
    recommendation = `Call. Your equity is only ${eqPct}% against their likely range, but the pot odds demand it — at these odds, they must be bluffing often enough to make this profitable. This is a bluff-catching spot where folding lets them exploit you.${gtoConfirmation}`;
  } else if (isMdfSpot) {
    const eqPct = equityVsStory !== undefined ? (equityVsStory * 100).toFixed(0) : "?";
    const label = recommendedAction === "bet" ? "Bet" : recommendedAction === "raise" ? "Raise" : recommendedAction === "check" ? "Check" : "Continue";
    recommendation = `${label}. Despite only ${eqPct}% equity against their range, the pot odds and position justify continuing.${gtoConfirmation}`;
  } else if (recommendedAction === "check") {
    const reason = actionNarrative?.counterNarrative ?? "Control the pot and see what develops.";
    recommendation = `Check. ${reason}${gtoConfirmation}`;
  } else if (recommendedAction === "call") {
    const reason = actionNarrative?.counterNarrative ?? "The price is right to continue.";
    recommendation = `Call. ${reason}${gtoConfirmation}`;
  } else if (recommendedAction === "bet" || recommendedAction === "raise") {
    const reason = actionNarrative?.counterNarrative ?? "You have a story worth telling.";
    recommendation = `${recommendedAction === "bet" ? "Bet" : "Raise"}. ${reason}${gtoConfirmation}`;
  } else {
    recommendation = `This is a close spot.${gtoConfirmation}`;
  }

  // Hole 2: Append counter-strategy advice when confidence > 50%
  if (counterAdvice && counterAdvice.confidence > 0.5) {
    recommendation += ` ${counterAdvice.narrative}`;
  }

  return { recommendation, confidence, recommendedAction };
}

function buildGtoConfirmation(
  frequencies: ActionFrequencies,
  optimalAction?: string,
  confidenceTier?: ConfidenceTier,
): string {
  if (!optimalAction) return "";
  const freq = frequencies[optimalAction as keyof ActionFrequencies] ?? 0;
  const pct = (freq * 100).toFixed(0);
  const actionLabel = optimalAction.replace("_", " ");

  // Modulate language strength based on data confidence tier
  const verb = confidenceTierVerb(confidenceTier);

  if (freq > 0.7) return ` ${verb} ${actionLabel} ${pct}% of the time.`;
  if (freq > 0.5) return ` ${verb.replace("strongly recommends", "leans toward").replace("recommends", "leans toward").replace("leans toward", "leans toward").replace("best estimate suggests", "best estimate leans toward").replace("absence of better data, consider", "limited data, consider")} ${actionLabel} (${pct}%).`;
  return ` GTO is mixed here — ${actionLabel} ${pct}%, close spot.`;
}

/**
 * Map confidence tier to coaching language verb/phrasing.
 */
function confidenceTierVerb(tier?: ConfidenceTier): string {
  switch (tier) {
    case "solver-verified": return "GTO strongly recommends";
    case "high-confidence": return "GTO recommends";
    case "directional": return "GTO leans toward";
    case "approximate": return "Our best estimate suggests";
    case "speculative": return "In the absence of better data, consider";
    default: return "GTO confirms:";
  }
}

// ═══════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════

function buildSummary(
  handDesc: string,
  posLabel: string,
  action: ActionType | null,
  confidence: HandCommentary["confidence"],
  street: Street,
): string {
  const confLabel = confidence === "clear" ? "Clear" : confidence === "leaning" ? "Leaning" : "Close";
  const actionLabel = action ? action.charAt(0).toUpperCase() + action.slice(1) : "Deciding";
  return `${confLabel}: ${actionLabel} with ${handDesc} from ${posLabel}`;
}
