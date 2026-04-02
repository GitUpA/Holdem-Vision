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
import type { PreflopClassification } from "../gto/preflopClassification";
import { classifyPreflopHand, classificationToCoachingText } from "../gto/preflopClassification";
import { cardToDisplay, rankValue, suitValue } from "../primitives/card";
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
  /** Preflop range classification — replaces fake GTO percentages for preflop */
  preflopClassification?: PreflopClassification;
  /** Pre-computed grid result — coaching reads the grid's R/C/F as source of truth */
  preflopGridResult?: import("./preflopGrid").PreflopGridResult;
}

// ═══════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════

export function commentateHand(input: CommentaryInput): HandCommentary {
  const {
    heroCards, communityCards, gameState, heroSeat, legal,
    handCat, archetype, opponentStories, actionStories, gtoFrequencies, gtoOptimalAction,
    counterAdvice, inferredBehavior, confidenceTier, preflopClassification,
    preflopGridResult,
  } = input;

  const street = gameState.currentStreet;
  const hero = gameState.players[heroSeat];
  const heroPosition = hero?.position;
  const heroCardStr = heroCards.length >= 2
    ? `${cardToDisplay(heroCards[0])} ${cardToDisplay(heroCards[1])}`
    : "unknown cards";
  const heroHandDesc = handCat?.description ?? "unknown hand";
  const posLabel = heroPosition ? positionDisplayName(heroPosition) : "unknown position";

  // ── Grid-driven preflop: read action from VHG ──
  const gridHeroCell = preflopGridResult?.cells.find(c => c.isHero);
  const gridAction = gridHeroCell?.action; // R, C, or F
  const gridClassification = gridHeroCell
    ? classifyPreflopHand(gridHeroCell.handClass, preflopGridResult!.situation.id, heroPosition ?? "btn", preflopGridResult!.situation.openerPosition ?? undefined)
    : undefined;

  // Use grid classification for preflop if available, fall back to provided
  const effectiveClassification = (street === "preflop" && gridClassification) ? gridClassification : preflopClassification;

  // Gather active opponents (not folded, not hero)
  const activeOpponents = gameState.players.filter(
    (p) => p.seatIndex !== heroSeat && (p.status === "active" || p.status === "all_in"),
  );

  const parts: string[] = [];

  // ── Part 1: The Scene ──
  if (street === "preflop") {
    parts.push(buildPreflopScene(gameState, heroSeat, heroCardStr, posLabel, archetype, preflopGridResult?.situation));
  } else {
    parts.push(buildPostflopScene(communityCards, street, heroCardStr, heroHandDesc, posLabel, archetype));
  }

  // ── Part 2: Opponent Stories ──
  if (opponentStories && opponentStories.length > 0) {
    const oppSection = buildOpponentSection(opponentStories, activeOpponents, gameState, inferredBehavior);
    if (oppSection) parts.push(oppSection);
  } else if (activeOpponents.length > 0) {
    const basicOpp = buildBasicOpponentSection(activeOpponents, gameState);
    if (basicOpp) parts.push(basicOpp);
  }

  // ── Part 3: Hero Assessment ──
  parts.push(buildHeroAssessment(
    heroCardStr, heroHandDesc, handCat, street,
    opponentStories, legal, gameState,
  ));

  // ── Part 4: Recommendation ──
  let recommendation: string;
  let confidence: "clear" | "leaning" | "close_spot";
  let recommendedAction: ActionType | null;

  if (street === "preflop" && gridAction && effectiveClassification) {
    // Grid-driven: R/C/F is the truth, classification provides the narrative
    const actionWord = gridAction === "R" ? "Raise" : gridAction === "C" ? "Call" : "Fold";
    recommendedAction = (gridAction === "R" ? (legal.canRaise ? "raise" : "bet")
      : gridAction === "C" ? (legal.canCall ? "call" : "check")
      : "fold") as ActionType;
    confidence = gridHeroCell!.actionConfidence === "clear" ? "clear"
      : gridHeroCell!.actionConfidence === "edge" ? "close_spot" : "leaning";
    const classText = classificationToCoachingText(effectiveClassification);
    recommendation = `${actionWord}.${classText}`;
  } else {
    // Postflop or no grid: fall back to existing recommendation logic
    const rec = buildRecommendation(
      handCat, opponentStories, actionStories, gtoFrequencies, gtoOptimalAction,
      legal, street, counterAdvice, confidenceTier, gameState, heroSeat, effectiveClassification,
    );
    recommendation = rec.recommendation;
    confidence = rec.confidence;
    recommendedAction = rec.recommendedAction;
  }
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
  situationCtx?: import("../preflop/situationRegistry").PreflopSituationContext,
): string {
  // When situation context is available, use it directly
  if (situationCtx) {
    const base = `You're on the ${posLabel} with ${heroCardStr}.`;

    switch (situationCtx.id) {
      case "rfi":
        return `${base} No one has entered the pot. You're deciding whether to open.`;
      case "facing_open":
      case "facing_open_multiway": {
        const openerPos = situationCtx.openerPosition ? positionDisplayName(situationCtx.openerPosition) : "a player";
        const callerText = situationCtx.numCallers > 0 ? ` ${situationCtx.numCallers} caller${situationCtx.numCallers > 1 ? "s" : ""} in.` : "";
        return `${base} ${openerPos} opened — you're deciding whether to enter this pot.${callerText}`;
      }
      case "facing_3bet": {
        const threeBettor = situationCtx.threeBettorPosition ? positionDisplayName(situationCtx.threeBettorPosition) : "a player";
        return `${base} You raised, and ${threeBettor} 3-bet. This is a 3-bet pot.`;
      }
      case "facing_4bet":
        return `${base} This is a 4-bet pot. Stacks are on the line.`;
      case "blind_vs_blind":
        return `${base} Folded to the blinds.`;
      case "facing_limpers":
        return `${base} ${situationCtx.numLimpers} limper${situationCtx.numLimpers > 1 ? "s" : ""} ahead — their range is capped. Iso-raise, over-limp, or fold.`;
      case "bb_vs_limpers":
        return `${base} ${situationCtx.numLimpers} limper${situationCtx.numLimpers > 1 ? "s" : ""} to you — you can raise for value or check for a free flop.`;
      case "bb_vs_sb_complete":
        return `${base} SB completed — their range is wide and capped. You can raise or check.`;
      case "bb_uncontested":
        return `${base} Everyone folded. You win the blinds.`;
      default:
        return base;
    }
  }

  // Fallback: derive from action history (for non-grid paths like snapshot)
  const raises = state.actionHistory.filter(
    (a) => a.street === "preflop" && (a.actionType === "raise" || a.actionType === "bet"),
  );
  const heroRaises = raises.filter((a) => a.seatIndex === heroSeat);
  const villainRaises = raises.filter((a) => a.seatIndex !== heroSeat);

  if (villainRaises.length === 0) {
    const preflopActions = state.actionHistory.filter((a) => a.street === "preflop");
    const limpers = preflopActions.filter((a) => a.actionType === "call" && a.seatIndex !== heroSeat);
    if (limpers.length > 0) {
      return `You're on the ${posLabel} with ${heroCardStr}. ${limpers.length} limper${limpers.length > 1 ? "s" : ""} ahead.`;
    }
    return `You're on the ${posLabel} with ${heroCardStr}. No one has raised yet — you have the initiative.`;
  }

  if (villainRaises.length === 1) {
    const raiser = state.players.find((p) => p.seatIndex === villainRaises[0].seatIndex);
    const raiserPos = raiser ? positionDisplayName(raiser.position) : "a player";
    const raiseAmount = villainRaises[0].amount ?? 0;
    if (heroRaises.length === 0) {
      return `You're on the ${posLabel} with ${heroCardStr}. ${raiserPos} opened to ${raiseAmount} BB — you're deciding whether to enter this pot.`;
    }
    return `You're on the ${posLabel} with ${heroCardStr}. You raised, and ${raiserPos} 3-bet to ${raiseAmount} BB.`;
  }

  return `You're on the ${posLabel} with ${heroCardStr}. There have been ${raises.length} raises. This is a multi-bet pot.`;
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

  // Detect paired/trip boards for warnings
  const boardRanks = communityCards.map(rankValue);
  const rankCounts = new Map<number, number>();
  for (const r of boardRanks) rankCounts.set(r, (rankCounts.get(r) ?? 0) + 1);
  const maxCount = Math.max(...rankCounts.values());

  // Detect flush-possible boards (3+ of same suit)
  const boardSuits = communityCards.map(suitValue);
  const suitCounts = new Map<number, number>();
  for (const s of boardSuits) suitCounts.set(s, (suitCounts.get(s) ?? 0) + 1);
  const maxSuitCount = Math.max(...suitCounts.values());

  let boardWarning = "";
  if (maxCount >= 3) {
    boardWarning = " The board has trips — only one card in the deck makes quads, but full houses are very live.";
  } else if (maxCount === 2) {
    boardWarning = " The board is paired — full houses and trips are in play.";
  }
  // Add flush warning on turn/river when 3+ of a suit appear
  if (maxSuitCount >= 4) {
    boardWarning += " Four to a flush on board — anyone with one card of that suit has a flush.";
  } else if (maxSuitCount === 3 && street !== "flop") {
    boardWarning += " Three to a flush on board — flush draws have arrived.";
  }

  return `${streetName}: ${boardStr}. You're on the ${posLabel} with ${heroCardStr} (${heroHandDesc}).${archetypeLabel ? ` This is a ${archetypeLabel} board.` : ""}${boardWarning}`;
}

// ═══════════════════════════════════════════════════════
// OPPONENT SECTION
// ═══════════════════════════════════════════════════════

function rangeLabelFor(pct: number): string {
  return pct < 10 ? "very narrow" : pct < 20 ? "narrow" : pct < 35 ? "moderate" : "wide";
}

function buildOpponentSection(
  stories: OpponentStory[],
  activeOpponents: GameState["players"],
  state: GameState,
  inferredBehavior?: InferredBehavior,
): string {
  if (stories.length === 0) return "";

  const parts: string[] = [];

  // In multiway pots, focus on the most threatening opponent and summarize the rest
  if (stories.length > 1) {
    // Sort: lowest equity = most threatening first
    const sorted = [...stories].sort((a, b) => a.data.equityVsRange - b.data.equityVsRange);
    const primary = sorted[0];
    const primaryNarrative = primary.streetNarratives[primary.streetNarratives.length - 1];
    const rangeLabel = rangeLabelFor(primary.data.rangePercent);

    if (primaryNarrative) {
      parts.push(
        `${stories.length} opponents still in. The most threatening shows a ${rangeLabel} range (~${primary.data.rangePercent.toFixed(0)}% of hands). ` +
        `${primaryNarrative.interpretation}`,
      );
    }
  } else {
    const story = stories[0];
    const lastNarrative = story.streetNarratives[story.streetNarratives.length - 1];
    if (lastNarrative) {
      const rangeLabel = rangeLabelFor(story.data.rangePercent);
      parts.push(
        `Their story: ${rangeLabel} range (~${story.data.rangePercent.toFixed(0)}% of hands). ` +
        `${lastNarrative.interpretation}`,
      );
    }
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
      return `Your ${heroHandDesc} is behind — only ${eqPct}% equity against their likely range.`;
    }
    if (bestOppEquity < 0.45) {
      if (strength < 0.2) {
        return `Your ${heroHandDesc} has only ${eqPct}% equity — you're behind and need to improve or fold.`;
      }
      if (strength < 0.4) {
        return `Your ${heroHandDesc} has ${eqPct}% equity against their range — marginal. The right price or position could make this playable.`;
      }
      return `Your ${heroHandDesc} has ${eqPct}% equity against their range — a competitive spot. Position, fold equity, and pot odds decide whether this is profitable.`;
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
  if (strength >= 0.35) {
    return `Your ${heroHandDesc} has some potential but isn't premium. Position and price will determine if it's worth playing.`;
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
  gameState?: GameState,
  heroSeat?: number,
  preflopClassification?: PreflopClassification,
): { recommendation: string; confidence: HandCommentary["confidence"]; recommendedAction: ActionType | null } {
  // ── SPR (stack-to-pot ratio) — detect pot-committed situations ──
  const hero = gameState && heroSeat !== undefined ? gameState.players[heroSeat] : undefined;
  const potTotal = gameState?.pot.total ?? 0;
  const heroStack = hero?.currentStack ?? 0;
  const spr = potTotal > 0 ? heroStack / potTotal : Infinity;
  const isPotCommitted = spr < 0.5 && potTotal > 0;
  // Determine the recommended action from GTO or opponent story
  let recommendedAction: ActionType | null = null;
  let confidence: HandCommentary["confidence"] = "close_spot";

  // GTO is the primary recommendation — opponent story provides narrative context
  if (gtoOptimalAction) {
    if (gtoOptimalAction === "fold") recommendedAction = "fold";
    else if (gtoOptimalAction === "check") recommendedAction = legal.canCheck ? "check" : "call";
    else if (gtoOptimalAction === "call") recommendedAction = "call";
    else if (gtoOptimalAction.startsWith("bet")) recommendedAction = legal.canBet ? "bet" : "raise";
    else if (gtoOptimalAction.startsWith("raise")) recommendedAction = legal.canRaise ? "raise" : "bet";
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

  // Max GTO frequency — used for override guards throughout
  const gtoMaxFreq = gtoFrequencies
    ? Math.max(...Object.values(gtoFrequencies).map(v => v ?? 0))
    : 0;

  // Build the recommendation text — use original GTO action for frequency lookup,
  // but display the remapped action label (check→call, bet→raise when facing a bet)
  const gtoDisplayLabel = (recommendedAction === "call" && gtoOptimalAction === "check")
    ? "call"
    : (recommendedAction === "raise" && gtoOptimalAction?.startsWith("bet"))
      ? gtoOptimalAction.replace("bet", "raise")
      : gtoOptimalAction;
  const gtoConfirmation = gtoFrequencies
    ? buildGtoConfirmation(gtoFrequencies, gtoOptimalAction, gtoDisplayLabel, confidenceTier, preflopClassification)
    : "";

  // Find the matching action story
  const actionNarrative = actionStories?.find((s) => s.action === recommendedAction);

  let recommendation: string;

  // Detect tension: GTO says continue but equity says fold (MDF / bluff-catching spots)
  const equityVsStory = strongestOpp?.data.equityVsRange;
  const handStrength = handCat?.relativeStrength ?? 0.5;
  const gtoSaysContinue = recommendedAction && recommendedAction !== "fold";
  const equitySaysFold = equityVsStory !== undefined && equityVsStory < 0.3 && strongestOpp?.confidence !== "speculative";
  // MDF only applies when:
  // 1. We have SOME showdown value (can beat bluffs). Pure air can't bluff-catch.
  // 2. Equity isn't deeply underwater (>18%). At <18% even MDF doesn't justify calling.
  const equityNotHopeless = equityVsStory === undefined || equityVsStory >= 0.18;
  const isMdfSpot = gtoSaysContinue && equitySaysFold && handStrength >= 0.15 && equityNotHopeless;

  // ── Pot odds override: if equity clearly beats pot odds, call regardless of GTO frequency ──
  // Guards: only override when the math is unambiguous
  const potOddsNeeded = strongestOpp?.data.potOddsNeeded;
  const gtoFoldFreq = gtoFrequencies?.fold ?? 0;
  const numActiveOpponents = (opponentStories?.length ?? 0);
  // Only override when the math is clearly favorable AND we trust the equity estimate.
  // Against very narrow ranges (<5%), equity estimates are noisy — don't override.
  const oppRangePct = strongestOpp?.data.rangePercent ?? 50;
  // Scale the GTO fold threshold with equity — higher equity = more willing to override
  const gtoFoldThreshold = (equityVsStory ?? 0) >= 0.60 ? 0.65 : 0.55;
  const equityBeatsPotOdds = equityVsStory !== undefined && potOddsNeeded !== undefined
    && equityVsStory > potOddsNeeded + 0.10 // 10% margin to account for equity noise
    && equityVsStory >= 0.38 // must have meaningful equity
    && gtoFoldFreq < gtoFoldThreshold // scale with equity strength
    && numActiveOpponents <= 1 // equity is vs one opponent — unreliable multiway
    && oppRangePct >= 5; // don't override against very narrow ranges (equity unreliable)

  if (recommendedAction === "fold" && equityBeatsPotOdds && legal.canCall) {
    // GTO says fold but math says call — pot odds override
    const eqPct = (equityVsStory! * 100).toFixed(0);
    const neededPct = (potOddsNeeded! * 100).toFixed(0);
    recommendation = `Call. You have ${eqPct}% equity and only need ${neededPct}% — the pot odds clearly favor calling here. GTO may fold this in theory, but at these specific odds, folding is leaving money on the table.`;
    recommendedAction = "call";
  } else if (recommendedAction === "fold" && isPotCommitted && legal.canCall) {
    // SPR override: pot-committed — but ONLY if equity covers the pot odds.
    // At SPR 0.3, you need ~23% equity to call. Don't override if equity is worse.
    const callNeeded = legal.callAmount ?? 0;
    const potAfterCall = potTotal + callNeeded;
    const equityNeeded = potAfterCall > 0 ? callNeeded / potAfterCall : 1;
    const hasOdds = equityVsStory !== undefined && equityVsStory >= equityNeeded;
    const stackBB = heroStack;
    const potBB = potTotal;

    if (hasOdds) {
      // Don't append gtoConfirmation — it would say "fold is standard" which contradicts the pot-committed call
      recommendation = `Call. You're pot-committed — with only ${stackBB.toFixed(0)} BB left and ${potBB.toFixed(0)} BB in the pot, folding wastes the chips you've already invested. The math heavily favors continuing.`;
      recommendedAction = "call";
    } else {
      // SPR is low but equity doesn't cover the price — tough fold
      const eqPct = equityVsStory !== undefined ? (equityVsStory * 100).toFixed(0) : "?";
      recommendation = `Fold. Even though you have only ${stackBB.toFixed(0)} BB left, your ${eqPct}% equity isn't enough to justify calling. Sometimes the disciplined fold saves the chips that matter.${gtoConfirmation}`;
    }
  } else if (recommendedAction === "fold") {
    // When equity seems favorable but GTO still says fold, explain WHY
    const equityLooksFavorable = equityVsStory !== undefined && potOddsNeeded !== undefined
      && equityVsStory > potOddsNeeded;
    if (equityLooksFavorable) {
      const eqPct = (equityVsStory! * 100).toFixed(0);
      // Explain why GTO folds despite favorable equity — reason depends on street and position
      const heroPos = hero?.position;
      const isIP = heroPos === "btn" || heroPos === "co";
      const isRiver = street === "river";
      let posReason: string;
      if (isRiver) {
        posReason = "the opponent's betting range is stronger than their overall range — your equity against hands that bet is lower than your equity against their full range";
      } else if (isIP) {
        posReason = "reverse implied odds mean you'll lose more on future streets than the raw equity suggests";
      } else {
        posReason = "reverse implied odds and positional disadvantage mean you'll lose more on future streets than the raw equity suggests";
      }
      recommendation = `Fold. You have ${eqPct}% equity which looks sufficient, but GTO still folds here — ${posReason}.${gtoConfirmation}`;
    } else {
      const reason = actionNarrative?.counterNarrative ?? "The math doesn't support continuing.";
      recommendation = `Fold. ${reason}${gtoConfirmation}`;
    }
  } else if (isMdfSpot && recommendedAction === "call") {
    // Special MDF narrative: equity is low but continuing is correct
    const eqPct = equityVsStory !== undefined ? (equityVsStory * 100).toFixed(0) : "?";
    const isDraw = handCat?.category === "straight_draw" || handCat?.category === "flush_draw"
      || handCat?.category === "combo_draw" || handCat?.category === "weak_draw";
    if (isDraw) {
      recommendation = `Call. You're behind with ${eqPct}% equity, but your draw gives you outs to improve. The pot odds justify calling — you'll hit often enough to make this profitable.${gtoConfirmation}`;
    } else {
      // Check if equity actually covers pot odds before claiming "pot odds demand it"
      const potOddsOk = equityVsStory !== undefined && equityVsStory >= 0.25;
      if (potOddsOk) {
        recommendation = `Call. Your equity is ${eqPct}% against their likely range — marginal, but the pot odds justify it. This is a bluff-catching spot where folding lets them exploit you.${gtoConfirmation}`;
      } else {
        recommendation = `Call. Your equity is only ${eqPct}% — you're behind, but GTO says you must defend some of your range here to avoid being exploited. This is a discipline call, not a value call.${gtoConfirmation}`;
      }
    }
  } else if (isMdfSpot && recommendedAction === "check") {
    recommendation = `Check. You're behind their range — checking avoids further investment while keeping your options open.${gtoConfirmation}`;
  } else if (isMdfSpot && (recommendedAction === "bet" || recommendedAction === "raise")) {
    const eqPct = equityVsStory !== undefined ? (equityVsStory * 100).toFixed(0) : "?";
    const label = recommendedAction === "bet" ? "Bet" : "Raise";
    recommendation = `${label}. Only ${eqPct}% equity, but aggression here leverages fold equity — you win the pot when they fold.${gtoConfirmation}`;
  } else if (recommendedAction === "check" && isPotCommitted && legal.canBet
    && equityVsStory !== undefined && equityVsStory >= 0.6
    && gtoMaxFreq < 0.8) {
    // SPR override for CHECK→BET: only when we have strong equity (60%+) AND GTO
    // isn't overwhelmingly check. Checking costs nothing, so the override should be
    // conservative — only bet when it's clearly +EV to put the last chips in.
    const stackBB = heroStack;
    const potBB = potTotal;
    recommendation = `Bet. You're essentially committed — with only ${stackBB.toFixed(0)} BB behind and ${potBB.toFixed(0)} BB in the pot, just put the rest in.${gtoConfirmation}`;
    recommendedAction = "bet";
  } else if (recommendedAction === "check") {
    // Use equity-aware check narrative
    let reason: string;
    const isDraw = handCat?.category === "flush_draw" || handCat?.category === "straight_draw"
      || handCat?.category === "combo_draw" || handCat?.category === "weak_draw";
    if (equityVsStory !== undefined && equityVsStory >= 0.6 && isDraw) {
      reason = "You have a strong draw with great equity. Checking lets you see another card cheaply and realize your outs.";
    } else if (equityVsStory !== undefined && equityVsStory >= 0.6) {
      reason = "You're ahead but GTO prefers a check here — trapping or keeping their bluffs in the pot.";
    } else if (equityVsStory !== undefined && equityVsStory >= 0.45 && isDraw) {
      reason = "Your draw gives you decent equity but checking lets you see a card without bloating the pot.";
    } else if (equityVsStory !== undefined && equityVsStory >= 0.45) {
      reason = "Pot control — your hand has showdown value but the risk-reward of betting is marginal.";
    } else {
      reason = actionNarrative?.counterNarrative ?? "Control the pot and see what develops.";
    }
    recommendation = `Check. ${reason}${gtoConfirmation}`;
  } else if (recommendedAction === "call") {
    // Use the pro-call narrative, not the counter (which argues AGAINST calling)
    const reason = actionNarrative?.narrative ?? "The price is right to continue.";
    recommendation = `Call. ${reason}${gtoConfirmation}`;
  } else if (recommendedAction === "bet" || recommendedAction === "raise") {
    const label = recommendedAction === "bet" ? "Bet" : "Raise";
    const strength = handCat?.relativeStrength ?? 0.5;
    const isLowEquity = equityVsStory !== undefined && equityVsStory < 0.4;
    const isRiver = street === "river";
    let defaultReason: string;
    if (strength < 0.35 || (isLowEquity && strength < 0.5)) {
      // Weak hand or low equity — this is a bluff / fold equity play
      defaultReason = street === "preflop"
        ? "Your hand is weak, but position and fold equity make this a profitable steal."
        : isRiver
          ? "This is a bluff — you can't win at showdown, so aggression is your only path to the pot."
          : "Aggression here leverages fold equity — you win the pot when they fold.";
    } else if (strength < 0.5) {
      defaultReason = street === "preflop"
        ? "Not premium, but the position and price justify an open."
        : isRiver
          ? "Their range is mixed. A bet tests their story and extracts thin value."
          : "A bet here defines your hand and charges draws.";
    } else {
      defaultReason = recommendedAction === "bet"
        ? "You're likely ahead — betting builds the pot when you have the edge."
        : "You're likely ahead — raising builds the pot when you have the edge.";
    }
    const reason = actionNarrative?.counterNarrative ?? defaultReason;
    recommendation = `${label}. ${reason}${gtoConfirmation}`;
  } else {
    recommendation = `This is a close spot.${gtoConfirmation}`;
  }

  // Hole 2: Append counter-strategy advice when confidence > 50%
  // Require high confidence before showing exploit advice in the recommendation.
  // Low-confidence reads from single-hand inference are unreliable — a GTO villain
  // who raises AA looks "loose-aggressive" after 5 actions. Require 80%+ confidence
  // which needs 10+ observations with a clear pattern.
  // Exploit overrides: "stop bluffing" with weak hand needs less confidence (0.5+)
  // than value-bet overrides (0.7+) because the downside of bluffing a station is higher
  const exploitConfidenceThreshold = 0.5;
  if (counterAdvice && counterAdvice.confidence >= exploitConfidenceThreshold) {
    // Detect contradiction: exploit says "don't bluff" but we recommend aggression with a weak hand
    // Only override when GTO doesn't strongly recommend the action (< 70%)
    // A GTO 82% c-bet on a paired board isn't a "bluff" — it's standard play
    // (gtoMaxFreq computed above, shared across all override checks)
    // A bet is effectively a "bluff" if either hand strength is very low OR equity is very low
    const isWeakHand = (handCat?.relativeStrength ?? 0.5) < 0.3;
    const isLowEquity = equityVsStory !== undefined && equityVsStory < 0.25;
    const isBluffing = (recommendedAction === "bet" || recommendedAction === "raise")
      && (isWeakHand || isLowEquity)
      && gtoMaxFreq < 0.7;
    const exploitSaysNoBluff = counterAdvice.narrative.toLowerCase().includes("stop bluffing")
      || counterAdvice.narrative.toLowerCase().includes("don't bluff");
    const exploitSaysCallDown = counterAdvice.narrative.toLowerCase().includes("call them down");

    // Reverse override: GTO says fold but exploit says "call them down" and we have decent equity
    const isFoldingWithEquity = recommendedAction === "fold"
      && equityVsStory !== undefined && equityVsStory > 0.45
      && legal.canCall;
    const gtoFoldIsClose = gtoMaxFreq < 0.65; // GTO fold isn't overwhelming

    // Exploit value-bet override: GTO says check, but villain calls too much and hero has a value hand
    const exploitSaysValueBet = counterAdvice.narrative.toLowerCase().includes("value bet")
      || (exploitSaysNoBluff && !isWeakHand);
    // Value hand = decent equity OR strong hand category (top pair+, two pair+)
    const isValueHand = (handCat?.relativeStrength ?? 0) >= 0.4;
    const hasDecentEquity = equityVsStory !== undefined && equityVsStory >= 0.45;
    // Higher equity = more willing to override GTO check (65%+ equity overrides even 90% GTO check)
    const equityOverrideThreshold = equityVsStory !== undefined && equityVsStory >= 0.65 ? 0.95 : 0.75;
    const isCheckingWithValue = recommendedAction === "check"
      && isValueHand && hasDecentEquity
      && legal.canBet
      && gtoMaxFreq < equityOverrideThreshold;

    if (isCheckingWithValue && exploitSaysValueBet) {
      // Override: hero has a value hand against a calling station — bet for value
      const eqPct = (equityVsStory * 100).toFixed(0);
      recommendation = `Bet. You have ${eqPct}% equity and this opponent calls too much — bet for value. GTO might check here, but against a calling station, every check with a strong hand is money left on the table.`;
      recommendedAction = "bet";
    } else if (isFoldingWithEquity && exploitSaysCallDown && gtoFoldIsClose) {
      // Override: with >45% equity against a bluffer, calling is correct
      const eqPct = (equityVsStory * 100).toFixed(0);
      recommendation = `Call. You have ${eqPct}% equity and this opponent bluffs too much — folding here lets them steal pots they don't deserve.${gtoConfirmation}`;
      recommendedAction = "call";
    } else if (isBluffing && exploitSaysNoBluff && legal.canCheck && !isPotCommitted) {
      // Override: exploit advice takes priority when hero is clearly bluffing against a calling station
      // But NOT when pot-committed — with SPR < 0.5 there are no chips to "save"
      recommendation = `Check. ${counterAdvice.narrative} With a weak hand, save your chips.${gtoConfirmation}`;
      recommendedAction = "check";
    } else if (isBluffing && exploitSaysCallDown && recommendedAction === "raise") {
      // Override: exploit says "call them down" but we want to raise-bluff — call instead
      recommendation = `Call. ${counterAdvice.narrative} Raising folds out their bluffs — calling traps them.${gtoConfirmation}`;
      recommendedAction = "call";
    } else {
      // Only append exploit advice if it doesn't contradict the recommendation.
      // "Call them down" contradicts a bet/raise rec. "Stop bluffing" contradicts a bet rec with air.
      const isBetting = recommendedAction === "bet" || recommendedAction === "raise";
      const isFolding = recommendedAction === "fold";
      const isChecking = recommendedAction === "check";
      const exploitContradictsAction =
        (isBetting && exploitSaysCallDown) || // "call them down" while we're betting
        (isBetting && exploitSaysNoBluff && isWeakHand) || // "stop bluffing" while we're bluff-betting
        (isFolding && exploitSaysCallDown) || // "call them down" while we're folding
        (isChecking && exploitSaysCallDown && !legal.canCall); // "call them down" when we can't call (bet/check only)

      if (!exploitContradictsAction) {
        recommendation += ` ${counterAdvice.narrative}`;
      }
      // If contradictory, just skip the exploit advice — the action speaks for itself
    }
  }

  return { recommendation, confidence, recommendedAction };
}

function buildGtoConfirmation(
  frequencies: ActionFrequencies,
  lookupAction?: string,
  displayAction?: string,
  confidenceTier?: ConfidenceTier,
  preflopClassification?: PreflopClassification,
): string {
  // Preflop: use range classification text instead of fake percentages
  if (preflopClassification) {
    return classificationToCoachingText(preflopClassification);
  }

  // Postflop: existing frequency-based text
  if (!lookupAction) return "";
  const freq = frequencies[lookupAction as keyof ActionFrequencies] ?? 0;
  const pct = (freq * 100).toFixed(0);
  const actionLabel = (displayAction ?? lookupAction).replace("_", " ");

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
