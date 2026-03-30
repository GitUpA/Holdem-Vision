/**
 * Full Hand Review — shows ALL player cards, ALL actions, ALL reasoning.
 *
 * Unlike stepByStep (hero perspective only), this shows the COMPLETE hand
 * from a god-view: every player's hole cards, every decision with engine
 * reasoning, and sanity-checks whether villain actions make sense.
 *
 * The key question: "Would a competent poker player watching this table
 * say 'that makes no sense'?"
 */
import { describe, it, expect } from "vitest";
import { HandStepper } from "../../convex/lib/analysis/handStepper";
import { GTO_PROFILE, PRESET_PROFILES } from "../../convex/lib/opponents/presets";
import { cardToString, rankValue, suitValue } from "../../convex/lib/primitives/card";
import { positionDisplayName } from "../../convex/lib/primitives/position";
import { comboToHandClass, cardsToCombo } from "../../convex/lib/opponents/combos";
import { evaluateHand } from "../../convex/lib/primitives/handEvaluator";
import type { CardIndex } from "../../convex/lib/types/cards";
import type { GameState } from "../../convex/lib/state/gameState";

interface ActionTrace {
  seatIndex: number;
  position: string;
  street: string;
  action: string;
  amount?: number;
  holeCards: string;
  board: string;
  potBefore: number;
  stackBefore: number;
}

interface HandReview {
  handNum: number;
  seed: number;
  players: Array<{ seat: number; position: string; cards: string }>;
  actions: ActionTrace[];
  outcome: { winner: string; pot: number; heroCards: string; board: string };
  issues: string[];
}

function reviewHand(seed: number, numPlayers: number, villainProfile: any): HandReview {
  const stepper = new HandStepper({
    numPlayers, startingStack: 100, heroSeat: 0,
    dealerSeat: seed % numPlayers, heroProfile: GTO_PROFILE,
    villainProfile, seed,
  });

  const step = stepper.deal();
  if (!step) return { handNum: 0, seed, players: [], actions: [], outcome: { winner: "", pot: 0, heroCards: "", board: "" }, issues: [] };

  // Auto-play the full hand
  let s: ReturnType<typeof stepper.autoAct> = step;
  let safety = 0;
  while (s && !s.isHandOver && safety < 30) {
    s = stepper.autoAct();
    safety++;
  }

  const result = stepper.getResult();
  const state = result.finalState;
  if (!state) return { handNum: 0, seed, players: [], actions: [], outcome: { winner: "", pot: 0, heroCards: "", board: "" }, issues: [] };

  // Collect player info
  const players = state.players.map(p => ({
    seat: p.seatIndex,
    position: positionDisplayName(p.position),
    cards: p.holeCards.map(c => cardToString(c as CardIndex)).join(" "),
  }));

  // Collect action traces
  const actions: ActionTrace[] = [];
  for (const a of state.actionHistory) {
    const player = state.players.find(p => p.seatIndex === a.seatIndex);
    // Reconstruct board at time of action
    let boardCards: CardIndex[] = [];
    if (a.street === "flop") boardCards = state.communityCards.slice(0, 3) as CardIndex[];
    else if (a.street === "turn") boardCards = state.communityCards.slice(0, 4) as CardIndex[];
    else if (a.street === "river") boardCards = state.communityCards.slice(0, 5) as CardIndex[];

    actions.push({
      seatIndex: a.seatIndex,
      position: player ? positionDisplayName(player.position) : `S${a.seatIndex}`,
      street: a.street,
      action: a.actionType,
      amount: a.amount,
      holeCards: player ? player.holeCards.map(c => cardToString(c as CardIndex)).join(" ") : "??",
      board: boardCards.map(c => cardToString(c)).join(" "),
      potBefore: state.pot.total, // approximate
      stackBefore: player?.currentStack ?? 0,
    });
  }

  // Determine outcome
  const heroPlayer = state.players[0];
  const pnl = heroPlayer.currentStack - 100;
  const board = state.communityCards.map(c => cardToString(c as CardIndex)).join(" ");
  const heroCards = heroPlayer.holeCards.map(c => cardToString(c as CardIndex)).join(" ");

  // ═══════════════════════════════════════════════════════
  // SANITY CHECKS — would a poker player say "that makes no sense"?
  // ═══════════════════════════════════════════════════════
  const issues: string[] = [];
  const communityCards = state.communityCards as CardIndex[];

  for (const player of state.players) {
    if (player.holeCards.length < 2) continue;
    const hc = player.holeCards as CardIndex[];
    const pos = positionDisplayName(player.position);
    const cardsStr = hc.map(c => cardToString(c)).join(" ");

    const playerActions = state.actionHistory.filter(a => a.seatIndex === player.seatIndex);

    // CHECK 0: Top-tier hands folding preflop (not facing extreme action)
    const preflopActions = playerActions.filter(a => a.street === "preflop");
    const foldedPreflop = preflopActions.some(a => a.actionType === "fold");
    if (foldedPreflop) {
      // Count raises before this player folded
      const allPreflopActions = state.actionHistory.filter(a => a.street === "preflop");
      const playerFoldIdx = allPreflopActions.findIndex(
        a => a.seatIndex === player.seatIndex && a.actionType === "fold"
      );
      const raisesBefore = allPreflopActions
        .slice(0, playerFoldIdx)
        .filter(a => a.actionType === "raise" || a.actionType === "bet")
        .length;

      const handClass = comboToHandClass(cardsToCombo(hc[0], hc[1]));

      // Top-tier hands should NEVER fold preflop (even facing 3-bets)
      const neverFold = new Set(["AA", "KK", "AKs"]);
      // Strong hands should not fold facing a single raise
      const shouldContinue = new Set([
        "QQ", "JJ", "TT", "AKo", "AQs", "AQo", "AJs",
        "KQs",
      ]);

      if (neverFold.has(handClass)) {
        issues.push(
          `${pos} (${cardsStr}) folded ${handClass} preflop — should NEVER fold`
        );
      } else if (shouldContinue.has(handClass) && raisesBefore <= 1) {
        issues.push(
          `${pos} (${cardsStr}) folded ${handClass} facing only ${raisesBefore} raise(s) — should continue`
        );
      }
    }

    // Get this player's postflop actions
    const postflopCalls = playerActions.filter(a =>
      a.street !== "preflop" && a.actionType === "call"
    );
    const totalCalledPostflop = postflopCalls.reduce((s, a) => s + (a.amount ?? 0), 0);

    if (totalCalledPostflop < 10) continue; // Only check significant action

    // CHECK 1: Calling big bets without flush card on 3-flush board
    if (communityCards.length >= 3) {
      const boardSuits = communityCards.map(suitValue);
      const suitCounts = new Map<number, number>();
      for (const s of boardSuits) suitCounts.set(s, (suitCounts.get(s) ?? 0) + 1);
      const flushSuit = [...suitCounts.entries()].find(([, c]) => c >= 3)?.[0];
      const flushCount = flushSuit !== undefined ? suitCounts.get(flushSuit)! : 0;

      if (flushSuit !== undefined) {
        const heroHasFlushCard = hc.some(c => suitValue(c) === flushSuit);

        if (!heroHasFlushCard) {
          // Evaluate hand tier: trips+ (tier >= 3) are strong enough to call on flush boards
          const allCards = [...hc, ...communityCards];
          const handTier = allCards.length >= 5 ? evaluateHand(allCards).rank.tier : 0;

          // Trips/straights still vulnerable on 4-flush boards; full house+ always safe
          const isSafe = handTier >= 6; // full house or better beats any flush
          const isStrong = handTier >= 3; // trips, straight — can call but with limits

          // Check if hero has overpair or TPTK (strong but not immune)
          const heroRanks = hc.map(rankValue);
          const boardRanks = communityCards.map(rankValue).sort((a, b) => b - a);
          const isOverpair = heroRanks[0] === heroRanks[1] && heroRanks[0] > boardRanks[0];

          if (!isSafe) {
            // 4-flush board: even straights/trips should fold for big amounts
            if (flushCount >= 4 && !isStrong && totalCalledPostflop >= 20) {
              issues.push(
                `${pos} (${cardsStr}) called ${totalCalledPostflop} BB postflop on a 4-flush board without a flush card`
              );
            } else if (flushCount >= 4 && isStrong && totalCalledPostflop >= 50) {
              issues.push(
                `${pos} (${cardsStr}) called ${totalCalledPostflop} BB postflop on a 4-flush board with only ${evaluateHand(allCards).rank.name}`
              );
            }
            // 3-flush board: threshold depends on hand strength
            if (flushCount === 3) {
              const threshold = isOverpair ? 60 : isStrong ? 50 : 30;
              if (totalCalledPostflop >= threshold) {
                issues.push(
                  `${pos} (${cardsStr}) called ${totalCalledPostflop} BB postflop on a 3-flush board without a flush card`
                );
              }
            }
          }
        }
      }
    }

    // CHECK 2: Calling big bets with bottom pair or worse on very wet boards
    if (communityCards.length >= 4) {
      // Evaluate actual hand tier — skip if hero has trips+ (tier >= 3)
      const allCards2 = [...hc, ...communityCards];
      const handTier2 = allCards2.length >= 5 ? evaluateHand(allCards2).rank.tier : 0;
      if (handTier2 < 3) { // only flag one pair or worse
        const boardRanks = communityCards.map(rankValue).sort((a, b) => b - a);
        const heroRanks = hc.map(rankValue);
        const hasPair = heroRanks.some(r => boardRanks.includes(r)) || heroRanks[0] === heroRanks[1];

        if (hasPair) {
          const pairedRank = heroRanks.find(r => boardRanks.includes(r));
          const isBottomPair = pairedRank !== undefined && pairedRank === boardRanks[boardRanks.length - 1];
          const isPocketPairBelow = heroRanks[0] === heroRanks[1] && heroRanks[0] < boardRanks[boardRanks.length - 1];

          if ((isBottomPair || isPocketPairBelow) && totalCalledPostflop >= 30) {
            issues.push(
              `${pos} (${cardsStr}) called ${totalCalledPostflop} BB postflop with only bottom pair/underpair on a ${communityCards.length}-card board`
            );
          }
        }
      }
    }

    // CHECK 3: Raising with air (no pair, no draw) on dry boards
    const postflopRaises = playerActions.filter(a =>
      a.street !== "preflop" && (a.actionType === "raise" || a.actionType === "bet")
    );
    const totalRaisedPostflop = postflopRaises.reduce((s, a) => s + (a.amount ?? 0), 0);

    if (totalRaisedPostflop >= 30 && communityCards.length >= 3) {
      const heroRanks = hc.map(rankValue);
      const boardRanks = communityCards.map(rankValue);
      const hasPair = heroRanks.some(r => boardRanks.includes(r)) || heroRanks[0] === heroRanks[1];
      const heroSuits = hc.map(suitValue);
      const boardSuits = communityCards.map(suitValue);
      const hasFlushDraw = heroSuits.some(s => boardSuits.filter(bs => bs === s).length >= 2);
      // Simple straight draw check
      const allRanks = [...heroRanks, ...boardRanks].sort((a, b) => a - b);
      const uniqueRanks = [...new Set(allRanks)];
      let maxConsecutive = 1, curr = 1;
      for (let i = 1; i < uniqueRanks.length; i++) {
        if (uniqueRanks[i] - uniqueRanks[i-1] === 1) { curr++; maxConsecutive = Math.max(maxConsecutive, curr); }
        else curr = 1;
      }
      const hasStraightDraw = maxConsecutive >= 4;

      if (!hasPair && !hasFlushDraw && !hasStraightDraw) {
        issues.push(
          `${pos} (${cardsStr}) bet/raised ${totalRaisedPostflop} BB postflop with no pair, no flush draw, no straight draw`
        );
      }
    }
  }

  return {
    handNum: 0,
    seed,
    players,
    actions,
    outcome: { winner: pnl >= 0 ? "hero" : "villain", pot: state.pot.total, heroCards, board },
    issues,
  };
}

describe("Full Hand Review", () => {
  const SEED_START = parseInt(process.env.REVIEW_SEED ?? "40000", 10);
  const NUM_HANDS = parseInt(process.env.REVIEW_HANDS ?? "100", 10);
  const VILLAIN_TYPE = (process.env.REVIEW_VILLAIN ?? "gto") as keyof typeof PRESET_PROFILES;

  it("reviews hands for villain action sanity", () => {
    const villainProfile = PRESET_PROFILES[VILLAIN_TYPE] ?? PRESET_PROFILES.gto;
    let totalIssues = 0;
    const issuesByType: Record<string, number> = {};

    for (let i = 0; i < NUM_HANDS; i++) {
      const review = reviewHand(SEED_START + i, 6, villainProfile);

      if (review.issues.length > 0) {
        console.log(`\n── HAND ${i + 1} (seed=${SEED_START + i}) ──`);
        console.log(`Board: ${review.outcome.board}`);
        console.log(`Players:`);
        for (const p of review.players) {
          console.log(`  ${p.position}: ${p.cards}`);
        }
        for (const issue of review.issues) {
          console.log(`  ⚠️ ${issue}`);
          totalIssues++;
          const type = issue.split(")")[1]?.trim().split(" ").slice(0, 3).join(" ") ?? "unknown";
          issuesByType[type] = (issuesByType[type] ?? 0) + 1;
        }
      }
    }

    console.log(`\n${"═".repeat(60)}`);
    console.log(`FULL HAND REVIEW — ${NUM_HANDS} hands, villain=${VILLAIN_TYPE}`);
    console.log(`${"═".repeat(60)}`);
    console.log(`Issues found: ${totalIssues}`);
    if (Object.keys(issuesByType).length > 0) {
      console.log(`By type:`);
      for (const [type, count] of Object.entries(issuesByType).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${type}: ${count}`);
      }
    }
    const issueRate = (totalIssues / NUM_HANDS) * 100;
    console.log(`Issue rate: ${issueRate.toFixed(1)}%`);

    // Regression threshold: fail if issue rate is too high
    // Current baseline: GTO ~0.7%, FISH ~0.8% on 2000-hand runs
    // Threshold set at 2x worst baseline to allow for seed variance
    const MAX_ISSUE_RATE = 1.5;
    expect(issueRate).toBeLessThanOrEqual(MAX_ISSUE_RATE);
  }, 120_000);

  it("multi-profile regression: all profiles under threshold", () => {
    const profiles = ["gto", "tag", "fish"] as const;
    const REGRESSION_HANDS = 200;

    for (const profileName of profiles) {
      const profile = PRESET_PROFILES[profileName] ?? PRESET_PROFILES.gto;
      let issues = 0;

      for (let i = 0; i < REGRESSION_HANDS; i++) {
        const review = reviewHand(80000 + i, 6, profile);
        issues += review.issues.length;
      }

      const rate = (issues / REGRESSION_HANDS) * 100;
      console.log(`  ${profileName}: ${issues} issues in ${REGRESSION_HANDS} hands (${rate.toFixed(1)}%)`);
      expect(rate).toBeLessThanOrEqual(2.0);
    }
  }, 120_000);
});
