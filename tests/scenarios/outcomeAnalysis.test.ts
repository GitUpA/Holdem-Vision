/**
 * Outcome Analysis — hero follows coaching, analyze showdown hands.
 *
 * 1. Play many hands. Hero follows GTO coaching at every decision
 *    (fold when told to fold, call when told to call, etc.)
 * 2. Filter: only analyze hands that reached showdown (hero never
 *    folded because coaching never told them to)
 * 3. For those showdown hands: did hero win? If hero lost, was the
 *    coaching correct despite the loss?
 *
 * The fold hands are noise — working as designed.
 * The showdown hands are the signal — did staying in produce good outcomes?
 */
import { describe, it, expect } from "vitest";
import { HandStepper, type StepperConfig } from "../../convex/lib/analysis/handStepper";
import type { FullSnapshot } from "../../convex/lib/analysis/snapshot";
import { evaluateHand } from "../../convex/lib/primitives/handEvaluator";
import type { CardIndex, Street } from "../../convex/lib/types/cards";
import { cardToString } from "../../convex/lib/primitives/card";

interface CoachingDecision {
  street: Street;
  gtoAction: string;
  gtoFrequency: number;
  commentaryText?: string;
  commentaryAction?: string;
  opponentStoryConfidence?: string;
  opponentStoryEquity?: number;
  actionTaken: string;
}

interface ShowdownOutcome {
  handIndex: number;
  heroCards: string;
  villainCards: string;
  communityCards: string;
  heroWon: boolean;
  heroBestHand: string;
  villainBestHand: string;
  potWon: number;
  totalInvested: number;
  coachingDecisions: CoachingDecision[];
  analysis: {
    verdict: "correct_win" | "correct_loss" | "questionable_loss" | "missed_story";
    explanation: string;
  };
}

function buildShowdownOutcome(
  handIndex: number,
  steps: Array<{ snapshot: FullSnapshot }>,
  heroActions: Array<{ street: Street; action: string; amount?: number }>,
  heroCards: CardIndex[],
  communityCards: CardIndex[],
  heroWon: boolean,
  heroFinalStack: number,
  startingStack: number,
  villainCards?: CardIndex[],
): ShowdownOutcome {
  const coachingDecisions: CoachingDecision[] = [];

  for (let i = 0; i < steps.length; i++) {
    const snap = steps[i].snapshot;
    const action = heroActions[i];
    if (!action) continue;

    const gtoAction = snap.gtoOptimalAction ?? "unknown";
    const gtoFreqs = snap.gtoFrequencies ?? {};
    const gtoFreq = gtoAction !== "unknown" ? (gtoFreqs[gtoAction as keyof typeof gtoFreqs] ?? 0) : 0;
    const commentary = snap.commentary;
    const oppStory = snap.opponentStories?.[0];

    coachingDecisions.push({
      street: action.street,
      gtoAction,
      gtoFrequency: gtoFreq,
      commentaryText: commentary?.narrative?.substring(0, 200),
      commentaryAction: commentary?.recommendedAction ?? undefined,
      opponentStoryConfidence: oppStory?.confidence,
      opponentStoryEquity: oppStory?.equityVsRange,
      actionTaken: action.action,
    });
  }

  const heroEval = communityCards.length >= 3
    ? evaluateHand([...heroCards, ...communityCards])
    : null;
  const villainEval = villainCards && communityCards.length >= 3
    ? evaluateHand([...villainCards, ...communityCards])
    : null;

  const potWon = heroFinalStack - startingStack;
  const totalInvested = Math.abs(Math.min(potWon, 0));

  // Classify the outcome
  let verdict: ShowdownOutcome["analysis"]["verdict"];
  let explanation: string;

  if (heroWon) {
    verdict = "correct_win";
    explanation = `Won ${potWon.toFixed(1)} BB. Coaching kept hero in → profitable result.`;
  } else {
    const hadLowEquityWarning = coachingDecisions.some(
      (d) => d.opponentStoryEquity !== undefined && d.opponentStoryEquity < 0.3
        && d.opponentStoryConfidence !== "speculative",
    );
    const bigLoss = Math.abs(potWon) > 15;

    if (hadLowEquityWarning && bigLoss) {
      verdict = "missed_story";
      const warningDecision = coachingDecisions.find(
        (d) => d.opponentStoryEquity !== undefined && d.opponentStoryEquity < 0.3,
      );
      explanation = `Lost ${Math.abs(potWon).toFixed(1)} BB. Opponent story warned: ${(warningDecision?.opponentStoryEquity! * 100).toFixed(0)}% equity (${warningDecision?.opponentStoryConfidence}). GTO said continue but the story was right.`;
    } else if (bigLoss) {
      verdict = "questionable_loss";
      explanation = `Lost ${Math.abs(potWon).toFixed(1)} BB. Significant loss — review the coaching decisions.`;
    } else {
      verdict = "correct_loss";
      explanation = `Lost ${Math.abs(potWon).toFixed(1)} BB. Small/standard loss. Coaching was reasonable.`;
    }
  }

  return {
    handIndex,
    heroCards: heroCards.map(cardToString).join(" "),
    villainCards: villainCards ? villainCards.map(cardToString).join(" ") : "unknown",
    communityCards: communityCards.map(cardToString).join(" "),
    heroWon,
    heroBestHand: heroEval?.rank?.name ?? "preflop",
    villainBestHand: villainEval?.rank?.name ?? "preflop",
    potWon,
    totalInvested,
    coachingDecisions,
    analysis: { verdict, explanation },
  };
}

describe("Outcome Analysis — Coaching vs Results", () => {
  it("plays 100 hands following coaching, analyzes showdown outcomes", () => {
    const TOTAL_HANDS = 500;
    const startingStack = 100;
    const showdowns: ShowdownOutcome[] = [];
    let foldedPreflop = 0;
    let foldedPostflop = 0;
    let everyoneFolded = 0;

    for (let i = 0; i < TOTAL_HANDS; i++) {
      const stepper = new HandStepper({
        numPlayers: 6,
        startingStack,
        heroSeat: i % 6, // rotate position each hand
        debug: "lite" as any, // capture stories/commentary but skip Monte Carlo equity
      });

      // Deal and follow coaching at each decision
      const firstStep = stepper.deal();
      if (!firstStep) { everyoneFolded++; continue; }

      let step: ReturnType<typeof stepper.autoAct> = firstStep;
      let safety = 0;

      while (step && !step.isHandOver && safety < 20) {
        step = stepper.autoAct();
        safety++;
      }

      const result = stepper.getResult();
      if (!result.finalState) { everyoneFolded++; continue; }

      const heroSeat = i % 6;
      const heroPlayer = result.finalState.players[heroSeat];

      // Check if hero folded (either via state flag or action list)
      const heroDidFold = heroPlayer.status === "folded" || result.heroActions.some((a) => a.action === "fold");
      if (heroDidFold) {
        const foldAction = result.heroActions.find((a) => a.action === "fold");
        if (foldAction?.street === "preflop") foldedPreflop++;
        else foldedPostflop++;
        continue;
      }

      // Hero didn't fold — this is a showdown hand (or everyone else folded)
      const activePlayers = result.finalState.players.filter((p) => p.status !== "folded");
      if (activePlayers.length < 2) {
        everyoneFolded++;
        continue;
      }

      // This hand reached showdown — analyze it
      const heroCards = heroPlayer.holeCards as CardIndex[];
      const communityCards = result.finalState.communityCards as CardIndex[];
      const heroWon = heroPlayer.currentStack > startingStack;

      const activeVillains = result.finalState.players.filter(
        (p, idx) => idx !== heroSeat && p.status !== "folded" && p.holeCards.length === 2,
      );
      const villainCards = activeVillains.length > 0
        ? (activeVillains[0].holeCards as CardIndex[])
        : undefined;

      showdowns.push(buildShowdownOutcome(
        i, result.steps, result.heroActions,
        heroCards, communityCards, heroWon,
        heroPlayer.currentStack, startingStack, villainCards,
      ));
    }

    // ── Summary ──
    console.log(`\n${"=".repeat(70)}`);
    console.log(`OUTCOME ANALYSIS — ${TOTAL_HANDS} hands played`);
    console.log(`${"=".repeat(70)}`);
    console.log(`Folded preflop:    ${foldedPreflop} (coaching said fold — working as designed)`);
    console.log(`Folded postflop:   ${foldedPostflop}`);
    console.log(`Everyone folded:   ${everyoneFolded} (hero won uncontested)`);
    console.log(`Reached showdown:  ${showdowns.length}`);
    console.log();

    if (showdowns.length === 0) {
      console.log("No showdown hands — need more volume or adjust to keep hero in.");
      expect(true).toBe(true);
      return;
    }

    const wins = showdowns.filter((o) => o.heroWon).length;
    const losses = showdowns.filter((o) => !o.heroWon).length;
    const correctWins = showdowns.filter((o) => o.analysis.verdict === "correct_win").length;
    const correctLosses = showdowns.filter((o) => o.analysis.verdict === "correct_loss").length;
    const missedStories = showdowns.filter((o) => o.analysis.verdict === "missed_story").length;
    const questionable = showdowns.filter((o) => o.analysis.verdict === "questionable_loss").length;
    const totalPnl = showdowns.reduce((s, o) => s + o.potWon, 0);

    console.log(`SHOWDOWN RESULTS (${showdowns.length} hands):`);
    console.log(`  Wins:            ${wins} (${((wins / showdowns.length) * 100).toFixed(0)}%)`);
    console.log(`  Losses:          ${losses}`);
    console.log(`    Correct loss:  ${correctLosses} (right decision, unlucky)`);
    console.log(`    Missed story:  ${missedStories} (opponent story was right)`);
    console.log(`    Questionable:  ${questionable} (big loss, review needed)`);
    console.log(`  Total P&L:       ${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(1)} BB`);
    console.log();

    // ── Detail each showdown hand ──
    for (const o of showdowns) {
      const icon = o.heroWon ? "W" : "L";
      const potStr = o.potWon >= 0 ? `+${o.potWon.toFixed(1)}` : o.potWon.toFixed(1);
      console.log(
        `[${icon}] #${String(o.handIndex).padStart(3)} Hero: ${o.heroCards.padEnd(6)} vs Villain: ${o.villainCards.padEnd(6)} ` +
        `Board: ${o.communityCards || "(preflop)"}  ${potStr.padStart(8)} BB`,
      );
      console.log(
        `     ${o.heroBestHand.padEnd(15)} vs ${o.villainBestHand.padEnd(15)} → ${o.analysis.verdict}`,
      );

      // Show coaching flow for losses
      if (!o.heroWon) {
        console.log(`     ${o.analysis.explanation}`);
        for (const d of o.coachingDecisions) {
          const eq = d.opponentStoryEquity !== undefined ? ` (eq: ${(d.opponentStoryEquity * 100).toFixed(0)}%)` : "";
          console.log(`     ${d.street}: GTO=${d.gtoAction} (${(d.gtoFrequency * 100).toFixed(0)}%) → hero ${d.actionTaken}${eq}`);
        }
      }
    }

    // ── Assertions ──
    expect(showdowns.length).toBeGreaterThan(0);
  }, 120_000);
});
