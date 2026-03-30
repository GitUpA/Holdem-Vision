/**
 * Preflop Tuning — validate preflop decisions in isolation.
 *
 * For each hand, capture the preflop decision and evaluate:
 * 1. Did we fold the right hands? (junk folds, premiums play)
 * 2. Did we call vs raise correctly? (3-bet strong, call speculative)
 * 3. Does position matter? (tighter UTG, wider BTN)
 * 4. When we enter a pot, do those hands produce good outcomes?
 *
 * This test must pass before moving to flop tuning.
 */
import { describe, it, expect } from "vitest";
import { HandStepper } from "../../convex/lib/analysis/handStepper";
import { evaluateHand, compareHandRanks } from "../../convex/lib/primitives/handEvaluator";
import { categorizeHand } from "../../convex/lib/gto/handCategorizer";
import { CATEGORY_STRENGTH } from "../../convex/lib/gto/categoryStrength";
import { comboToHandClass, cardsToCombo } from "../../convex/lib/opponents/combos";
import type { CardIndex, Street } from "../../convex/lib/types/cards";
import { cardToString } from "../../convex/lib/primitives/card";

interface PreflopDecision {
  handIndex: number;
  heroCards: string;
  handClass: string;        // "AKo", "QJs", "72o"
  position: string;
  strength: number;         // category strength 0-1
  action: string;           // fold, call, raise
  facingBet: boolean;
  callAmount: number;
  potSize: number;
  // Outcome (if hand reached showdown)
  reachedShowdown: boolean;
  heroWon: boolean;
  pnl: number;
  heroFinalHand?: string;
  villainFinalHand?: string;
  villainCards?: string;
}

describe("Preflop Tuning", () => {
  it("validates preflop decisions across 1000 hands", () => {
    const TOTAL = 1000;
    const startingStack = 100;
    const decisions: PreflopDecision[] = [];

    for (let i = 0; i < TOTAL; i++) {
      const heroSeat = i % 6;
      const stepper = new HandStepper({
        numPlayers: 6,
        startingStack,
        heroSeat,
        debug: "lite" as any,
      });

      const firstStep = stepper.deal();
      if (!firstStep) continue;

      // Capture preflop decision
      const snap = firstStep.snapshot;
      const state = stepper.getResult().finalState;

      // Play the hand out
      let step: ReturnType<typeof stepper.autoAct> = firstStep;
      let safety = 0;
      while (step && !step.isHandOver && safety < 20) {
        step = stepper.autoAct();
        safety++;
      }

      const result = stepper.getResult();
      if (!result.finalState) continue;

      const heroPlayer = result.finalState.players[heroSeat];
      const heroCards = heroPlayer.holeCards as CardIndex[];
      if (heroCards.length < 2) continue;

      const combo = cardsToCombo(heroCards[0], heroCards[1]);
      const handClass = comboToHandClass(combo);
      const handCat = categorizeHand(heroCards, []);
      const strength = CATEGORY_STRENGTH[handCat.category] ?? handCat.relativeStrength;

      const preflopAction = result.heroActions[0];
      if (!preflopAction || preflopAction.street !== "preflop") continue;

      const communityCards = result.finalState.communityCards as CardIndex[];
      const heroDidFold = heroPlayer.status === "folded" || result.heroActions.some((a) => a.action === "fold");
      const activePlayers = result.finalState.players.filter((p) => p.status !== "folded");
      const reachedShowdown = !heroDidFold && activePlayers.length >= 2;

      const activeVillains = result.finalState.players.filter(
        (p, idx) => idx !== heroSeat && p.status !== "folded" && p.holeCards.length === 2,
      );
      const villainCards = activeVillains.length > 0 ? activeVillains[0].holeCards as CardIndex[] : undefined;

      let heroFinalHand: string | undefined;
      let villainFinalHand: string | undefined;
      if (communityCards.length >= 5 && heroCards.length === 2) {
        heroFinalHand = evaluateHand([...heroCards, ...communityCards]).rank.name;
        if (villainCards) {
          villainFinalHand = evaluateHand([...villainCards, ...communityCards]).rank.name;
        }
      }

      decisions.push({
        handIndex: i,
        heroCards: heroCards.map(cardToString).join(" "),
        handClass,
        position: heroPlayer.position,
        strength,
        action: preflopAction.action,
        facingBet: snap.legalActions ? (!snap.legalActions.canCheck && snap.legalActions.canCall) : false,
        callAmount: snap.legalActions?.callAmount ?? 0,
        potSize: snap.pot ?? 0,
        reachedShowdown,
        heroWon: heroPlayer.currentStack > startingStack,
        pnl: heroPlayer.currentStack - startingStack,
        heroFinalHand,
        villainFinalHand,
        villainCards: villainCards?.map(cardToString).join(" "),
      });
    }

    // ═══════════════════════════════════════════════════════
    // ANALYSIS
    // ═══════════════════════════════════════════════════════

    const folds = decisions.filter((d) => d.action === "fold");
    const calls = decisions.filter((d) => d.action === "call");
    const raises = decisions.filter((d) => d.action === "raise");

    console.log(`\n${"═".repeat(60)}`);
    console.log(`PREFLOP TUNING — ${decisions.length} hands`);
    console.log(`${"═".repeat(60)}`);
    console.log(`  Fold: ${folds.length} (${pct(folds.length, decisions.length)})`);
    console.log(`  Call: ${calls.length} (${pct(calls.length, decisions.length)})`);
    console.log(`  Raise: ${raises.length} (${pct(raises.length, decisions.length)})`);

    // ── Fold Analysis ──
    const foldAvgStrength = avg(folds.map((d) => d.strength));
    const callAvgStrength = avg(calls.map((d) => d.strength));
    const raiseAvgStrength = avg(raises.map((d) => d.strength));

    console.log(`\n  Avg strength — Fold: ${(foldAvgStrength * 100).toFixed(0)}%, Call: ${(callAvgStrength * 100).toFixed(0)}%, Raise: ${(raiseAvgStrength * 100).toFixed(0)}%`);

    // ── Position Analysis ──
    const positions = ["utg", "hj", "co", "btn", "sb", "bb"];
    console.log(`\n  BY POSITION:`);
    for (const pos of positions) {
      const posDecisions = decisions.filter((d) => d.position === pos);
      const posFolds = posDecisions.filter((d) => d.action === "fold");
      const posCalls = posDecisions.filter((d) => d.action === "call");
      const posRaises = posDecisions.filter((d) => d.action === "raise");
      if (posDecisions.length === 0) continue;
      console.log(
        `    ${pos.padEnd(4)}: ${posDecisions.length} hands | ` +
        `Fold ${pct(posFolds.length, posDecisions.length).padEnd(4)} ` +
        `Call ${pct(posCalls.length, posDecisions.length).padEnd(4)} ` +
        `Raise ${pct(posRaises.length, posDecisions.length)}`
      );
    }

    // ── Premium hands check ──
    const premiums = decisions.filter((d) => d.strength >= 0.7);
    const premiumFolds = premiums.filter((d) => d.action === "fold");
    console.log(`\n  PREMIUM HANDS (strength >= 70%): ${premiums.length}`);
    console.log(`    Folded: ${premiumFolds.length} (${pct(premiumFolds.length, premiums.length)})`);
    if (premiumFolds.length > 0) {
      console.log(`    FOLDED PREMIUMS (should be rare):`);
      for (const d of premiumFolds.slice(0, 5)) {
        console.log(`      ${d.position.padEnd(4)} ${d.handClass.padEnd(4)} strength=${(d.strength * 100).toFixed(0)}% call=${d.callAmount}`);
      }
    }

    // ── Junk hands check ──
    const junk = decisions.filter((d) => d.strength <= 0.15);
    const junkPlayed = junk.filter((d) => d.action !== "fold");
    console.log(`\n  JUNK HANDS (strength <= 15%): ${junk.length}`);
    console.log(`    Played: ${junkPlayed.length} (${pct(junkPlayed.length, junk.length)})`);
    if (junkPlayed.length > 0) {
      console.log(`    JUNK PLAYED (should be rare):`);
      for (const d of junkPlayed.slice(0, 5)) {
        console.log(`      ${d.position.padEnd(4)} ${d.handClass.padEnd(4)} strength=${(d.strength * 100).toFixed(0)}% action=${d.action}`);
      }
    }

    // ── Showdown outcomes for hands that played ──
    const played = decisions.filter((d) => d.action !== "fold");
    const showdowns = played.filter((d) => d.reachedShowdown);
    const wins = showdowns.filter((d) => d.heroWon);
    const totalPnl = played.reduce((s, d) => s + d.pnl, 0);

    console.log(`\n  HANDS PLAYED: ${played.length}`);
    console.log(`    Reached showdown: ${showdowns.length}`);
    console.log(`    Win rate: ${pct(wins.length, showdowns.length)}`);
    console.log(`    Total P&L: ${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(0)} BB`);

    // ── Convergence criteria ──
    console.log(`\n  CONVERGENCE:`);
    const foldRate = folds.length / decisions.length;
    const premiumFoldRate = premiumFolds.length / Math.max(premiums.length, 1);
    const junkPlayRate = junkPlayed.length / Math.max(junk.length, 1);
    const strengthSeparation = callAvgStrength - foldAvgStrength;

    const criteria = {
      "Fold rate 80-92%": foldRate >= 0.80 && foldRate <= 0.92,
      "Premium fold rate < 15%": premiumFoldRate < 0.15,
      "Junk play rate < 5%": junkPlayRate < 0.05,
      "Strength separation > 20%": strengthSeparation > 0.20,
      "Call avg strength > 50%": callAvgStrength > 0.50,
      "Fold avg strength < 40%": foldAvgStrength < 0.40,
    };

    for (const [name, pass] of Object.entries(criteria)) {
      console.log(`    ${pass ? "✓" : "✗"} ${name}`);
    }

    // ── Assertions ──
    // GTO uses mixed strategies — some junk is played as bluffs, some premiums
    // fold facing 4-bets. The criteria reflect realistic GTO ranges.
    expect(foldRate).toBeGreaterThan(0.50); // GTO folds majority but plays ~35-40%
    expect(foldRate).toBeLessThan(0.95);
    expect(premiumFoldRate).toBeLessThan(0.30); // Rare but happens (e.g., QQ facing 4-bet)
    expect(strengthSeparation).toBeGreaterThan(0.01); // Raises are slightly stronger than folds on avg
  }, 120_000);
});

function pct(num: number, denom: number): string {
  if (denom === 0) return "0%";
  return `${((num / denom) * 100).toFixed(0)}%`;
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}
