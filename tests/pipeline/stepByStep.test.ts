/**
 * Step-by-Step Hand Analysis — structured output for LLM poker reasoning.
 *
 * Plays hands and at each hero decision point outputs:
 * 1. Observable state (what a player would see)
 * 2. System coaching (what the system recommends)
 *
 * The LLM reads (1), reasons about what IT would do,
 * then compares against (2) to find coaching issues.
 *
 * Output format is optimized for LLM analysis, not human reading.
 */
import { describe, it } from "vitest";
import { HandStepper } from "../../convex/lib/analysis/handStepper";
import { captureFullSnapshot } from "../../convex/lib/analysis/snapshot";
import { currentLegalActions } from "../../convex/lib/state/stateMachine";
import { GTO_PROFILE, PRESET_PROFILES } from "../../convex/lib/opponents/presets";
import { comboToHandClass, cardsToCombo } from "../../convex/lib/opponents/combos";
import { cardToString, rankValue } from "../../convex/lib/primitives/card";
import { computeHandGrid } from "../../convex/lib/analysis/handGrid";
import { computePreflopHandGrid, type PreflopGridResult } from "../../convex/lib/analysis/preflopGrid";
import type { Position } from "../../convex/lib/types/cards";
import { positionDisplayName } from "../../convex/lib/primitives/position";
import type { CardIndex } from "../../convex/lib/types/cards";
import type { GameState, PlayerState } from "../../convex/lib/state/gameState";

/** Format a player's visible action history for this street */
function streetActions(state: GameState, street: string): string[] {
  return state.actionHistory
    .filter(a => a.street === street)
    .map(a => {
      const p = state.players.find(pl => pl.seatIndex === a.seatIndex);
      const pos = p ? positionDisplayName(p.position) : `Seat${a.seatIndex}`;
      const amt = a.amount ? ` ${a.amount} BB` : "";
      return `${pos}: ${a.actionType}${amt}`;
    });
}

/** Format pot structure */
function potInfo(state: GameState): string {
  const mainPot = state.pot.total;
  const sidePots = state.pot.sidePots?.length ?? 0;
  return sidePots > 0 ? `${mainPot} BB (${sidePots} side pots)` : `${mainPot} BB`;
}

/** Format active players with their committed amounts */
function activePlayers(state: GameState, heroSeat: number): string[] {
  return state.players
    .filter(p => p.status === "active" || p.status === "all_in")
    .map(p => {
      const pos = positionDisplayName(p.position);
      const hero = p.seatIndex === heroSeat ? " (HERO)" : "";
      const stack = p.currentStack.toFixed(1);
      const committed = p.streetCommitted > 0 ? ` [${p.streetCommitted} BB in]` : "";
      return `${pos}${hero}: ${stack} BB stack${committed}`;
    });
}

/** Format legal actions available to hero */
function legalActionsStr(legal: ReturnType<typeof currentLegalActions>): string {
  if (!legal) return "none";
  const actions: string[] = [];
  if (legal.canFold) actions.push("fold");
  if (legal.canCheck) actions.push("check");
  if (legal.canCall) actions.push(`call ${legal.callAmount} BB`);
  if (legal.canBet) actions.push(`bet (${legal.betMin}-${legal.betMax} BB)`);
  if (legal.canRaise) actions.push(`raise (${legal.raiseMin}-${legal.raiseMax} BB)`);
  return actions.join(" | ");
}

/** Board texture description */
function boardTextureStr(snap: ReturnType<typeof captureFullSnapshot>): string {
  if (!snap.boardTexture) return "n/a";
  const bt = snap.boardTexture;
  const traits: string[] = [];
  if (bt.isPaired) traits.push("paired");
  if (bt.isMonotone) traits.push("monotone");
  if (bt.isTwoTone) traits.push("two-tone");
  if (bt.flushPossible) traits.push("flush possible");
  if (bt.straightHeavy) traits.push("straight-heavy");
  return `${bt.description} (wetness: ${(bt.wetness * 100).toFixed(0)}%)${traits.length ? " [" + traits.join(", ") + "]" : ""}`;
}

describe("Step-by-Step Analysis", () => {
  const SEED_START = parseInt(process.env.STEP_SEED ?? "90000", 10);
  const NUM_HANDS = parseInt(process.env.STEP_HANDS ?? "50", 10);
  const NUM_PLAYERS = parseInt(process.env.STEP_PLAYERS ?? "6", 10);
  const VILLAIN_TYPE = (process.env.STEP_VILLAIN ?? "tag") as keyof typeof PRESET_PROFILES;

  it("plays hands step-by-step for LLM analysis", () => {
    const villainProfile = PRESET_PROFILES[VILLAIN_TYPE] ?? PRESET_PROFILES.tag;

    for (let h = 0; h < NUM_HANDS; h++) {
      const seed = SEED_START + h;
      const stepper = new HandStepper({
        numPlayers: NUM_PLAYERS, startingStack: 100, heroSeat: 0,
        dealerSeat: h % NUM_PLAYERS, heroProfile: GTO_PROFILE,
        villainProfile, seed,
      });

      const firstStep = stepper.deal();
      if (!firstStep) continue;

      let step: ReturnType<typeof stepper.autoAct> = firstStep;
      let decisionNum = 0;
      let safety = 0;

      console.log(`\n${"═".repeat(70)}`);
      console.log(`HAND ${h + 1}/${NUM_HANDS} (seed=${seed}, ${NUM_PLAYERS}-max, villain=${VILLAIN_TYPE})`);
      console.log(`${"═".repeat(70)}`);

      while (step && !step.isHandOver && safety < 20) {
        const state = (stepper as any).session?.state as GameState | undefined;
        if (!state) { step = stepper.autoAct(); safety++; continue; }

        const legal = currentLegalActions(state);
        const hero = state.players.find(p => p.seatIndex === 0);
        if (!legal || !hero || hero.holeCards.length < 2) {
          step = stepper.autoAct(); safety++; continue;
        }

        const heroCards = hero.holeCards as CardIndex[];
        const profiles = new Map<number, any>();
        for (const p of state.players) {
          if (p.seatIndex !== 0) profiles.set(p.seatIndex, villainProfile);
        }

        try {
          const snap = captureFullSnapshot(state, 0, heroCards, {
            debug: true as any, opponentProfiles: profiles,
          });

          const handClass = comboToHandClass(cardsToCombo(heroCards[0], heroCards[1]));
          const board = state.communityCards.map(c => cardToString(c as CardIndex)).join(" ");
          const heroCardDisplay = heroCards.map(c => cardToString(c as CardIndex)).join(" ");

          // ── OBSERVABLE STATE (what a player sees) ──
          console.log(`\n── Decision #${decisionNum} | ${snap.street.toUpperCase()} ──`);
          console.log(`Hero: ${heroCardDisplay} (${handClass}) | Position: ${snap.heroPosition}`);
          if (board) console.log(`Board: ${board}`);
          console.log(`Pot: ${potInfo(state)} | Stack: ${hero.currentStack.toFixed(1)} BB`);
          if (snap.street !== "preflop") console.log(`Board texture: ${boardTextureStr(snap)}`);
          console.log(`Hand: ${snap.handStrength?.description} (${snap.handStrength?.category})`);

          // Action history this street
          const actions = streetActions(state, state.currentStreet);
          if (actions.length > 0) {
            console.log(`Actions this street: ${actions.join(" → ")}`);
          }

          // Players still in
          console.log(`Active: ${activePlayers(state, 0).join(" | ")}`);
          console.log(`Legal: ${legalActionsStr(legal)}`);

          // ── VISION GRID ──
          if (state.currentStreet === "preflop") {
            const preflopRaises = state.actionHistory.filter(
              (a: { street: string; actionType: string; seatIndex: number }) => a.street === "preflop" && (a.actionType === "raise" || a.actionType === "bet")
            );
            const heroPosition = state.players[0]?.position as Position;
            // Detect situation: did hero raise and then get re-raised?
            const heroRaised = preflopRaises.some((a: { seatIndex: number }) => a.seatIndex === 0);
            const nonHeroRaises = preflopRaises.filter((a: { seatIndex: number }) => a.seatIndex !== 0);
            const firstOpener = nonHeroRaises.length > 0 ? nonHeroRaises[0] : null;
            const lastRaiser = preflopRaises.length > 0 ? preflopRaises[preflopRaises.length - 1] : null;
            const is3Bet = heroRaised && nonHeroRaises.length > 0;
            const heroOpenAmt = preflopRaises.find((a: { seatIndex: number }) => a.seatIndex === 0)?.amount ?? 0;
            const openerPos = is3Bet ? undefined : (firstOpener?.position as Position | undefined);
            const openerAmt = is3Bet ? heroOpenAmt : (firstOpener?.amount ?? 0);

            const gridResult: PreflopGridResult = computePreflopHandGrid({
              heroCards,
              heroPosition,
              openerPosition: openerPos,
              openerSizingBB: openerAmt,
              facing3Bet: is3Bet,
              threeBettorPosition: is3Bet ? (lastRaiser?.position as Position) : undefined,
              threeBetSizeBB: is3Bet ? (lastRaiser?.amount ?? 0) : undefined,
            }, 0); // 0 trials = static equity (fast)

            const heroCell = gridResult.cells.find(c => c.isHero);
            const actionLabel = heroCell?.action ? ` | Action: ${heroCell.action}` : "";
            const vsLabel = is3Bet ? ` vs ${(lastRaiser?.position ?? "?").toUpperCase()} 3bet` : openerPos ? ` vs ${openerPos.toUpperCase()}` : "";
            console.log(`  [GRID] Hero: ${gridResult.heroHandClass} (${(gridResult.heroEquity * 100).toFixed(0)}% eq) | Situation: ${gridResult.situation.id}${vsLabel}${actionLabel}`);
            console.log(`  [GRID] In hero range: ${heroCell?.inHeroRange ? "YES" : "NO"} | In opp range: ${heroCell?.inOpponentRange ? "YES" : "NO"} | Pot: ${gridResult.potSizeBB.toFixed(1)}BB`);
          } else {
            const gridData = computeHandGrid(heroCards, state.communityCards as CardIndex[]);
            console.log(`  [GRID] Postflop: ${gridData.totalBeats} beat, ${gridData.totalTies} tie, ${gridData.totalLoses} win (of ${gridData.totalBeats + gridData.totalTies + gridData.totalLoses} combos)`);
          }

          // ── SYSTEM COACHING ──
          console.log(`\n  [COACHING]`);
          if (snap.commentary) {
            console.log(`  Recommendation: ${snap.commentary.recommendedAction} (${snap.commentary.confidence})`);
            console.log(`  Narrative: ${snap.commentary.narrative}`);
          }
          if (snap.gtoOptimalAction && snap.gtoFrequencies) {
            const freqStr = Object.entries(snap.gtoFrequencies)
              .filter(([, v]) => (v ?? 0) > 0.01)
              .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
              .map(([k, v]) => `${k}: ${((v ?? 0) * 100).toFixed(0)}%`)
              .join(", ");
            console.log(`  GTO: ${snap.gtoOptimalAction} | Frequencies: ${freqStr}`);
          }
          if (snap.opponentStories.length > 0) {
            for (const s of snap.opponentStories) {
              console.log(`  Opponent (${s.position}): ${s.rangeNarrative} (equity: ${(s.equityVsRange * 100).toFixed(0)}%)`);
            }
          }
          if (snap.counterAdvice) {
            console.log(`  Exploit: ${snap.counterAdvice.narrative} (${snap.counterAdvice.confidenceLabel})`);
          }
          if (snap.heroPerceivedRange) {
            console.log(`  Hero image: ${snap.heroPerceivedRange.narrative}`);
          }

          console.log(`  ───`);
          decisionNum++;
        } catch { /* skip snapshot errors */ }

        step = stepper.autoAct();
        safety++;
      }

      // Show outcome
      const result = stepper.getResult();
      if (result.finalState) {
        const heroPlayer = result.finalState.players[0];
        const pnl = heroPlayer.currentStack - 100;
        console.log(`\nOUTCOME: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(1)} BB`);
        console.log(`Actions: ${result.heroActions.map(a => `${a.action}${a.amount ? " " + a.amount : ""}`).join(" → ")}`);
      }
    }
  }, 60_000);
});
