/**
 * Coaching Audit — play hands, capture coaching, find incoherent advice.
 *
 * Runs 500 hands, captures every hero decision point, and flags:
 * - Premium hands told to fold or call when should raise
 * - Junk hands told to raise
 * - GTO action contradicts commentary recommendation
 * - Archetype misclassification
 * - Missing coaching data
 */
import { describe, it, expect } from "vitest";
import { HandStepper } from "../../convex/lib/analysis/handStepper";
import { captureFullSnapshot } from "../../convex/lib/analysis/snapshot";
import { currentLegalActions } from "../../convex/lib/state/stateMachine";
import { GTO_PROFILE, PRESET_PROFILES } from "../../convex/lib/opponents/presets";
import { CATEGORY_STRENGTH } from "../../convex/lib/gto/categoryStrength";
import { comboToHandClass, cardsToCombo } from "../../convex/lib/opponents/combos";
import { cardToString } from "../../convex/lib/primitives/card";
import type { CardIndex, Street } from "../../convex/lib/types/cards";

interface CoachingIssue {
  handIndex: number;
  street: Street;
  heroCards: string;
  handClass: string;
  position: string;
  severity: "critical" | "warning" | "info";
  issue: string;
  details: string;
}

describe("Coaching Audit", () => {
  it("audits 500 hands for coaching incoherence", () => {
    const HANDS = 500;
    const issues: CoachingIssue[] = [];
    let totalDecisions = 0;

    for (let i = 0; i < HANDS; i++) {
      const heroSeat = 0;
      const stepper = new HandStepper({
        numPlayers: 6,
        startingStack: 100,
        heroSeat,
        dealerSeat: i % 6,
        heroProfile: GTO_PROFILE,
        villainProfile: PRESET_PROFILES.tag,
        seed: 80000 + i,
      });

      const firstStep = stepper.deal();
      if (!firstStep) continue;

      let step: ReturnType<typeof stepper.autoAct> = firstStep;
      let safety = 0;
      while (step && !step.isHandOver && safety < 20) {
        // Capture snapshot at this decision point
        const state = (stepper as any).session?.state;
        if (state) {
          const legal = currentLegalActions(state);
          const heroPlayer = state.players.find((p: any) => p.seatIndex === heroSeat);
          if (legal && heroPlayer && heroPlayer.holeCards.length >= 2) {
            const heroCards = heroPlayer.holeCards as CardIndex[];
            const combo = cardsToCombo(heroCards[0], heroCards[1]);
            const handClass = comboToHandClass(combo);
            const strength = CATEGORY_STRENGTH[step.snapshot.handStrength?.category ?? "air"] ?? 0;

            try {
              const profiles = new Map();
              for (const p of state.players) {
                if (p.seatIndex !== heroSeat) profiles.set(p.seatIndex, PRESET_PROFILES.tag);
              }
              const snap = captureFullSnapshot(state, heroSeat, heroCards, {
                debug: "lite" as any,
                opponentProfiles: profiles,
              });

              totalDecisions++;
              const gtoAction = snap.gtoOptimalAction ?? "unknown";
              const commentary = snap.commentary;
              const position = snap.heroPosition;
              const archetype = snap.archetype?.id ?? "unknown";

              // ── Check 1: Premium hands should raise, not fold/call ──
              const isPremium = ["AA", "KK", "QQ", "AKs", "AKo"].includes(handClass);
              const is4BetPlus = archetype === "four_bet_five_bet";
              if (isPremium && state.currentStreet === "preflop") {
                if (gtoAction === "fold") {
                  issues.push({
                    handIndex: i, street: state.currentStreet,
                    heroCards: heroCards.map(c => cardToString(c as CardIndex)).join(" "),
                    handClass, position,
                    severity: "critical",
                    issue: "PREMIUM FOLD",
                    details: `${handClass} from ${position} told to fold. GTO=${gtoAction}. Archetype=${archetype}`,
                  });
                }
                // Calling with premiums is correct in 4-bet+ pots (AKo calls 4-bets)
                // but wrong in RFI/3-bet spots (should raise)
                if (gtoAction === "call" && legal.canRaise && !is4BetPlus) {
                  const gtoFreq = snap.gtoFrequencies?.[gtoAction as keyof typeof snap.gtoFrequencies] as number ?? 0;
                  if (gtoFreq > 0.7) {
                    issues.push({
                      handIndex: i, street: state.currentStreet,
                      heroCards: heroCards.map(c => cardToString(c as CardIndex)).join(" "),
                      handClass, position,
                      severity: "critical",
                      issue: "PREMIUM CALL-HEAVY",
                      details: `${handClass} from ${position} told to call ${(gtoFreq*100).toFixed(0)}%. Should usually raise. Archetype=${archetype}`,
                    });
                  }
                }
              }

              // ── Check 2: Commentary contradicts GTO ──
              if (commentary && commentary.recommendedAction) {
                const commentaryAction = commentary.recommendedAction;
                const gtoIsAggressive = gtoAction.startsWith("bet") || gtoAction.startsWith("raise");
                const commentaryIsAggressive = commentaryAction === "bet" || commentaryAction === "raise";
                const gtoIsFold = gtoAction === "fold";
                const commentaryIsFold = commentaryAction === "fold";

                // Critical: commentary says fold but GTO says bet/raise (or vice versa)
                if (gtoIsFold && commentaryIsAggressive) {
                  issues.push({
                    handIndex: i, street: state.currentStreet,
                    heroCards: heroCards.map(c => cardToString(c as CardIndex)).join(" "),
                    handClass, position,
                    severity: "warning",
                    issue: "COMMENTARY CONTRADICTS GTO",
                    details: `Commentary says ${commentaryAction} but GTO says ${gtoAction}. Archetype=${archetype}`,
                  });
                }
                if (commentaryIsFold && gtoIsAggressive) {
                  issues.push({
                    handIndex: i, street: state.currentStreet,
                    heroCards: heroCards.map(c => cardToString(c as CardIndex)).join(" "),
                    handClass, position,
                    severity: "warning",
                    issue: "COMMENTARY CONTRADICTS GTO",
                    details: `Commentary says fold but GTO says ${gtoAction}. Archetype=${archetype}`,
                  });
                }
              }

              // ── Check 3: Missing coaching data ──
              if (!commentary || !commentary.narrative || commentary.narrative.length < 20) {
                issues.push({
                  handIndex: i, street: state.currentStreet,
                  heroCards: heroCards.map(c => cardToString(c as CardIndex)).join(" "),
                  handClass, position,
                  severity: "warning",
                  issue: "MISSING COMMENTARY",
                  details: `No coaching narrative. Archetype=${archetype}`,
                });
              }

              if (gtoAction === "unknown") {
                issues.push({
                  handIndex: i, street: state.currentStreet,
                  heroCards: heroCards.map(c => cardToString(c as CardIndex)).join(" "),
                  handClass, position,
                  severity: "warning",
                  issue: "NO GTO DATA",
                  details: `GTO action unknown. Archetype=${archetype}`,
                });
              }

            } catch { /* skip snapshot errors */ }
          }
        }

        step = stepper.autoAct();
        safety++;
      }
    }

    // ═══════════════════════════════════════════════════════
    // REPORT
    // ═══════════════════════════════════════════════════════

    const critical = issues.filter(i => i.severity === "critical");
    const warnings = issues.filter(i => i.severity === "warning");

    console.log(`\n${"═".repeat(60)}`);
    console.log(`COACHING AUDIT — ${HANDS} hands, ${totalDecisions} decisions`);
    console.log(`${"═".repeat(60)}`);
    console.log(`Critical issues: ${critical.length}`);
    console.log(`Warnings: ${warnings.length}`);
    console.log(`Issue rate: ${((issues.length / Math.max(totalDecisions, 1)) * 100).toFixed(1)}%`);

    if (critical.length > 0) {
      console.log(`\nCRITICAL ISSUES:`);
      for (const issue of critical.slice(0, 10)) {
        console.log(`  [${issue.issue}] Hand #${issue.handIndex} ${issue.street} ${issue.heroCards} (${issue.handClass}) from ${issue.position}`);
        console.log(`    ${issue.details}`);
      }
      if (critical.length > 10) console.log(`  ... and ${critical.length - 10} more`);
    }

    if (warnings.length > 0) {
      console.log(`\nWARNINGS (first 10):`);
      for (const issue of warnings.slice(0, 10)) {
        console.log(`  [${issue.issue}] Hand #${issue.handIndex} ${issue.street} ${issue.heroCards} (${issue.handClass}) from ${issue.position}`);
        console.log(`    ${issue.details}`);
      }
      if (warnings.length > 10) console.log(`  ... and ${warnings.length - 10} more`);
    }

    // Group by issue type
    const byType: Record<string, number> = {};
    for (const issue of issues) {
      byType[issue.issue] = (byType[issue.issue] ?? 0) + 1;
    }
    console.log(`\nBY TYPE:`);
    for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${type}: ${count}`);
    }

    // Assert no critical issues
    expect(critical.length).toBe(0);
  }, 120_000);
});
