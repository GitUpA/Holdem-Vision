/**
 * Diagnostic Runner — find where GTO vs GTO chips leak.
 *
 * Runs 1000 hands GTO vs GTO heads-up with detailed per-street,
 * per-position, per-action-type tracking. Identifies exactly which
 * decisions cause the -75 BB/100 bias.
 *
 * This is the automated tuning diagnostic from first-principles Layer 9.
 */
import { describe, it, expect } from "vitest";
import { HandStepper } from "../../convex/lib/analysis/handStepper";
import { GTO_PROFILE } from "../../convex/lib/opponents/presets";
import { cardToString } from "../../convex/lib/primitives/card";
import type { CardIndex, Street } from "../../convex/lib/types/cards";

interface HandDiagnostic {
  heroPosition: string;
  heroCards: string;
  streets: Street[];
  heroActions: Array<{ street: Street; action: string; amount?: number }>;
  pnl: number;
  reachedShowdown: boolean;
  foldStreet?: Street;
}

describe("Diagnostic Runner", () => {
  it("diagnoses GTO vs GTO bias by street, position, and action", () => {
    const HANDS = 2000;
    const startingStack = 100;
    const diagnostics: HandDiagnostic[] = [];

    for (let i = 0; i < HANDS; i++) {
      const stepper = new HandStepper({
        numPlayers: 2,
        startingStack,
        heroSeat: 0,
        dealerSeat: i % 2, // alternate BTN/BB
        heroProfile: GTO_PROFILE,
        villainProfile: GTO_PROFILE,
        seed: 10000 + i,
      });

      const result = stepper.playFullHand();
      if (!result.finalState) continue;

      const heroPlayer = result.finalState.players[0];
      const pnl = heroPlayer.currentStack - startingStack;
      const heroDidFold = heroPlayer.status === "folded" || result.heroActions.some(a => a.action === "fold");
      const foldAction = result.heroActions.find(a => a.action === "fold");
      const streetsPlayed = [...new Set(result.heroActions.map(a => a.street))] as Street[];

      diagnostics.push({
        heroPosition: heroPlayer.position,
        heroCards: heroPlayer.holeCards.length >= 2
          ? heroPlayer.holeCards.map(c => cardToString(c as CardIndex)).join("")
          : "??",
        streets: streetsPlayed,
        heroActions: result.heroActions,
        pnl,
        reachedShowdown: !heroDidFold && result.finalState.players.filter(p => p.status !== "folded").length >= 2,
        foldStreet: heroDidFold ? foldAction?.street as Street : undefined,
      });
    }

    // ═══════════════════════════════════════════════════════
    // ANALYSIS
    // ═══════════════════════════════════════════════════════

    const totalPnl = diagnostics.reduce((s, d) => s + d.pnl, 0);
    const bbPer100 = (totalPnl / diagnostics.length) * 100;

    console.log(`\n${"═".repeat(60)}`);
    console.log(`GTO vs GTO DIAGNOSTIC — ${diagnostics.length} hands`);
    console.log(`${"═".repeat(60)}`);
    console.log(`Total P&L: ${totalPnl.toFixed(1)} BB | BB/100: ${bbPer100.toFixed(2)}`);

    // ── By position ──
    console.log(`\nBY POSITION:`);
    const positions = [...new Set(diagnostics.map(d => d.heroPosition))];
    for (const pos of positions) {
      const posHands = diagnostics.filter(d => d.heroPosition === pos);
      const posPnl = posHands.reduce((s, d) => s + d.pnl, 0);
      const posBbPer100 = (posPnl / posHands.length) * 100;
      console.log(`  ${pos.padEnd(15)}: ${posHands.length} hands | ${posPnl >= 0 ? "+" : ""}${posPnl.toFixed(1)} BB | ${posBbPer100.toFixed(2)} BB/100`);
    }

    // ── By outcome ──
    const foldedPreflop = diagnostics.filter(d => d.foldStreet === "preflop");
    const foldedPostflop = diagnostics.filter(d => d.foldStreet && d.foldStreet !== "preflop");
    const showdowns = diagnostics.filter(d => d.reachedShowdown);
    const wonUncontested = diagnostics.filter(d => !d.reachedShowdown && !d.foldStreet && d.pnl > 0);

    console.log(`\nBY OUTCOME:`);
    console.log(`  Folded preflop:  ${foldedPreflop.length} (${pct(foldedPreflop.length, diagnostics.length)}) | P&L: ${sum(foldedPreflop).toFixed(1)} BB`);
    console.log(`  Folded postflop: ${foldedPostflop.length} (${pct(foldedPostflop.length, diagnostics.length)}) | P&L: ${sum(foldedPostflop).toFixed(1)} BB`);
    console.log(`  Won uncontested: ${wonUncontested.length} (${pct(wonUncontested.length, diagnostics.length)}) | P&L: ${sum(wonUncontested).toFixed(1)} BB`);
    console.log(`  Showdown:        ${showdowns.length} (${pct(showdowns.length, diagnostics.length)}) | P&L: ${sum(showdowns).toFixed(1)} BB`);

    // ── Showdown wins vs losses ──
    const showdownWins = showdowns.filter(d => d.pnl > 0);
    const showdownLosses = showdowns.filter(d => d.pnl < 0);
    console.log(`    Won:  ${showdownWins.length} | avg +${showdownWins.length > 0 ? (sum(showdownWins) / showdownWins.length).toFixed(1) : 0} BB`);
    console.log(`    Lost: ${showdownLosses.length} | avg ${showdownLosses.length > 0 ? (sum(showdownLosses) / showdownLosses.length).toFixed(1) : 0} BB`);

    // ── By fold street ──
    console.log(`\nFOLD BREAKDOWN:`);
    const foldStreets: Street[] = ["preflop", "flop", "turn", "river"];
    for (const street of foldStreets) {
      const streetFolds = diagnostics.filter(d => d.foldStreet === street);
      if (streetFolds.length === 0) continue;
      const streetPnl = sum(streetFolds);
      console.log(`  Folded ${street.padEnd(8)}: ${streetFolds.length} (${pct(streetFolds.length, diagnostics.length)}) | P&L: ${streetPnl.toFixed(1)} BB | avg ${(streetPnl / streetFolds.length).toFixed(2)} BB/fold`);
    }

    // ── By action type per street ──
    console.log(`\nACTION DISTRIBUTION:`);
    for (const street of foldStreets) {
      const streetActions = diagnostics.flatMap(d => d.heroActions.filter(a => a.street === street));
      if (streetActions.length === 0) continue;
      const folds = streetActions.filter(a => a.action === "fold").length;
      const checks = streetActions.filter(a => a.action === "check").length;
      const calls = streetActions.filter(a => a.action === "call").length;
      const bets = streetActions.filter(a => a.action === "bet").length;
      const raises = streetActions.filter(a => a.action === "raise").length;
      console.log(
        `  ${street.padEnd(8)}: ${streetActions.length} actions | ` +
        `F:${pct(folds, streetActions.length)} C:${pct(checks, streetActions.length)} ` +
        `Ca:${pct(calls, streetActions.length)} B:${pct(bets, streetActions.length)} R:${pct(raises, streetActions.length)}`
      );
    }

    // ── Biggest losses ──
    const sorted = [...diagnostics].sort((a, b) => a.pnl - b.pnl);
    console.log(`\nBIGGEST LOSSES (top 5):`);
    for (const d of sorted.slice(0, 5)) {
      console.log(`  ${d.heroCards.padEnd(5)} ${d.heroPosition.padEnd(15)} ${d.pnl.toFixed(1)} BB | ${d.heroActions.map(a => `${a.street[0]}:${a.action}`).join(" ")}`);
    }

    console.log(`\nBIGGEST WINS (top 5):`);
    for (const d of sorted.slice(-5).reverse()) {
      console.log(`  ${d.heroCards.padEnd(5)} ${d.heroPosition.padEnd(15)} +${d.pnl.toFixed(1)} BB | ${d.heroActions.map(a => `${a.street[0]}:${a.action}`).join(" ")}`);
    }

    // Assert: diagnostic ran
    expect(diagnostics.length).toBeGreaterThan(500);
  }, 60_000);
});

function sum(arr: HandDiagnostic[]): number {
  return arr.reduce((s, d) => s + d.pnl, 0);
}

function pct(n: number, d: number): string {
  return d === 0 ? "0%" : `${((n / d) * 100).toFixed(0)}%`;
}
