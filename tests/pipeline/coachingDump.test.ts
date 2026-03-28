/**
 * Coaching Dump — plays hands and outputs FULL coaching for LLM review.
 *
 * This isn't a pass/fail test. It outputs coaching narratives for
 * manual semantic evaluation. The LLM reads these and identifies
 * issues that programmatic checks can't catch.
 */
import { describe, it } from "vitest";
import { HandStepper } from "../../convex/lib/analysis/handStepper";
import { captureFullSnapshot, formatSnapshot } from "../../convex/lib/analysis/snapshot";
import { currentLegalActions } from "../../convex/lib/state/stateMachine";
import { GTO_PROFILE, PRESET_PROFILES } from "../../convex/lib/opponents/presets";
import { comboToHandClass, cardsToCombo } from "../../convex/lib/opponents/combos";
import { cardToString } from "../../convex/lib/primitives/card";
import type { CardIndex } from "../../convex/lib/types/cards";

describe("Coaching Dump", () => {
  it("dumps 10 hands with full coaching for review", () => {
    for (let i = 0; i < 10; i++) {
      const stepper = new HandStepper({
        numPlayers: 6, startingStack: 100, heroSeat: 0,
        dealerSeat: i % 6, heroProfile: GTO_PROFILE,
        villainProfile: PRESET_PROFILES.tag, seed: 55000 + i,
      });

      const firstStep = stepper.deal();
      if (!firstStep) continue;

      let step: ReturnType<typeof stepper.autoAct> = firstStep;
      let decisionNum = 0;
      let safety = 0;

      while (step && !step.isHandOver && safety < 20) {
        const state = (stepper as any).session?.state;
        if (!state) { step = stepper.autoAct(); safety++; continue; }

        const legal = currentLegalActions(state);
        const hero = state.players.find((p: any) => p.seatIndex === 0);
        if (!legal || !hero || hero.holeCards.length < 2) {
          step = stepper.autoAct(); safety++; continue;
        }

        const heroCards = hero.holeCards as CardIndex[];
        const profiles = new Map<number, any>();
        for (const p of state.players) {
          if (p.seatIndex !== 0) profiles.set(p.seatIndex, PRESET_PROFILES.tag);
        }

        try {
          const snap = captureFullSnapshot(state, 0, heroCards, {
            debug: "lite" as any, opponentProfiles: profiles,
          });

          const handClass = comboToHandClass(cardsToCombo(heroCards[0], heroCards[1]));
          const board = state.communityCards.map((c: number) => cardToString(c as CardIndex)).join(" ");

          console.log(`\n${"━".repeat(70)}`);
          console.log(`HAND #${i} DECISION #${decisionNum} | ${snap.street.toUpperCase()}`);
          console.log(`Hero: ${heroCards.map(c => cardToString(c as CardIndex)).join(" ")} (${handClass}) | ${snap.heroPosition}`);
          console.log(`Board: ${board || "(preflop)"} | Pot: ${snap.pot} BB`);
          console.log(`Hand: ${snap.handStrength?.description} (${snap.handStrength?.category}, ${((snap.handStrength?.relativeStrength ?? 0) * 100).toFixed(0)}%)`);
          console.log(`GTO: ${snap.gtoOptimalAction} | Archetype: ${snap.archetype?.id}`);

          if (snap.commentary) {
            console.log(`\nCOACH: ${snap.commentary.narrative}`);
            console.log(`Recommendation: ${snap.commentary.recommendedAction} (${snap.commentary.confidence})`);
          }

          if (snap.opponentStories.length > 0) {
            const s = snap.opponentStories[0];
            console.log(`\nOPPONENT: ${s.rangeNarrative} (equity: ${(s.equityVsRange * 100).toFixed(0)}%, conf: ${s.confidence})`);
          }

          if (snap.heroPerceivedRange) {
            console.log(`\nYOUR STORY: ${snap.heroPerceivedRange.narrative}`);
          }

          if (snap.counterAdvice) {
            console.log(`\nEXPLOIT: ${snap.counterAdvice.narrative} (${snap.counterAdvice.confidenceLabel})`);
          }

          if (snap.actionStories.length > 0) {
            console.log(`\nACTIONS:`);
            for (const s of snap.actionStories) {
              console.log(`  ${s.action}: ${s.narrative}`);
            }
          }

          decisionNum++;
        } catch { /* skip */ }

        step = stepper.autoAct();
        safety++;
      }

      // Show outcome
      const result = stepper.getResult();
      if (result.finalState) {
        const heroPlayer = result.finalState.players[0];
        const pnl = heroPlayer.currentStack - 100;
        console.log(`\nOUTCOME: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(1)} BB | Actions: ${result.heroActions.map(a => a.action).join(" → ")}`);
      }
    }
  }, 30_000);
});
