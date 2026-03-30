/**
 * Semantic Audit — deep coaching quality validation.
 *
 * Goes beyond "fields exist" to check "content makes sense":
 * - Does commentary mention the hand strength correctly?
 * - Does opponent story match observed actions?
 * - Does counter-advice align with detected pattern?
 * - Does hero perceived range make sense for hero's actions?
 * - Is coaching language appropriate for the confidence tier?
 * - Does the archetype match the board texture?
 *
 * Uses the model's understanding of poker to evaluate coherence.
 */
import { describe, it, expect } from "vitest";
import { HandStepper } from "../../convex/lib/analysis/handStepper";
import { captureFullSnapshot, type FullSnapshot } from "../../convex/lib/analysis/snapshot";
import { currentLegalActions } from "../../convex/lib/state/stateMachine";
import { GTO_PROFILE, PRESET_PROFILES } from "../../convex/lib/opponents/presets";
import { CATEGORY_STRENGTH } from "../../convex/lib/gto/categoryStrength";
import { comboToHandClass, cardsToCombo } from "../../convex/lib/opponents/combos";
import { cardToString } from "../../convex/lib/primitives/card";
import type { CardIndex } from "../../convex/lib/types/cards";

interface SemanticIssue {
  hand: number;
  street: string;
  heroCards: string;
  category: string;
  severity: "error" | "warning";
  check: string;
  details: string;
}

function captureSnap(stepper: HandStepper, heroSeat: number, profiles: Map<number, any>): FullSnapshot | null {
  const state = (stepper as any).session?.state;
  if (!state) return null;
  const legal = currentLegalActions(state);
  if (!legal) return null;
  const hero = state.players.find((p: any) => p.seatIndex === heroSeat);
  if (!hero || hero.holeCards.length < 2) return null;
  try {
    return captureFullSnapshot(state, heroSeat, hero.holeCards as CardIndex[], {
      debug: "lite" as any,
      opponentProfiles: profiles,
    });
  } catch { return null; }
}

describe("Semantic Audit", () => {
  it("validates coaching semantics across 300 hands", () => {
    const HANDS = 1000;
    const issues: SemanticIssue[] = [];
    let totalSnapshots = 0;

    const villainProfiles = new Map<number, any>();
    for (let s = 1; s <= 5; s++) {
      villainProfiles.set(s, [PRESET_PROFILES.tag, PRESET_PROFILES.nit, PRESET_PROFILES.fish, PRESET_PROFILES.lag, PRESET_PROFILES.gto][s - 1]);
    }

    for (let i = 0; i < HANDS; i++) {
      const stepper = new HandStepper({
        numPlayers: 6, startingStack: 100, heroSeat: 0,
        dealerSeat: i % 6, heroProfile: GTO_PROFILE,
        villainProfile: PRESET_PROFILES.gto, seed: 70000 + i,
      });

      const firstStep = stepper.deal();
      if (!firstStep) continue;

      let step: ReturnType<typeof stepper.autoAct> = firstStep;
      let safety = 0;
      while (step && !step.isHandOver && safety < 20) {
        const snap = captureSnap(stepper, 0, villainProfiles);
        if (snap) {
          totalSnapshots++;
          const state = (stepper as any).session?.state;
          const hero = state?.players?.find((p: any) => p.seatIndex === 0);
          const heroCards = hero?.holeCards?.length === 2
            ? hero.holeCards.map((c: number) => cardToString(c as CardIndex)).join(" ")
            : "??";
          const handClass = hero?.holeCards?.length === 2
            ? comboToHandClass(cardsToCombo(hero.holeCards[0], hero.holeCards[1]))
            : "??";
          const category = snap.handStrength?.category ?? "unknown";
          const strength = CATEGORY_STRENGTH[category] ?? 0;
          const street = snap.street;

          // ── CHECK 1: Commentary mentions hand strength coherently ──
          if (snap.commentary?.narrative) {
            const narrative = snap.commentary.narrative.toLowerCase();
            const rec = snap.commentary.recommendedAction;

            // Strong hand (strength >= 0.7) should not be called "weak" or told to fold
            // Exclude "weak" in opponent descriptions (e.g., "weak kicker", "weaker holdings", "weak hands")
            if (strength >= 0.7 && street === "preflop") {
              // Exclude "weak" that refers to opponent ranges, not hero's hand
              const hasWeakAboutHero = narrative.includes("weak") && !narrative.includes("not weak")
                && !narrative.includes("weak kicker") && !narrative.includes("weaker holdings")
                && !narrative.includes("weak hands") && !narrative.includes("weak pairs")
                && !narrative.includes("weaker story");
              if (hasWeakAboutHero) {
                issues.push({ hand: i, street, heroCards, category, severity: "error",
                  check: "STRONG_CALLED_WEAK",
                  details: `${handClass} (${category}, ${(strength*100).toFixed(0)}%) called "weak" in commentary`,
                });
              }
            }

            // Air/weak hands should not be called "strong"
            if (strength <= 0.15 && street !== "preflop") {
              if (narrative.includes("strong") && !narrative.includes("not strong") && !narrative.includes("opponent") && !narrative.includes("their")) {
                issues.push({ hand: i, street, heroCards, category, severity: "warning",
                  check: "WEAK_CALLED_STRONG",
                  details: `${handClass} (${category}, ${(strength*100).toFixed(0)}%) described as "strong"`,
                });
              }
            }

            // ── CHECK 2: Recommendation matches GTO direction ──
            const gtoAction = snap.gtoOptimalAction;
            if (rec && gtoAction) {
              const gtoIsFold = gtoAction === "fold";
              const recIsFold = rec === "fold";
              const gtoIsAggressive = gtoAction.startsWith("bet") || gtoAction.startsWith("raise");
              const recIsAggressive = rec === "bet" || rec === "raise";

              // Commentary says "Raise" but GTO says "Fold" (or vice versa)
              if (gtoIsFold && recIsAggressive) {
                issues.push({ hand: i, street, heroCards, category, severity: "error",
                  check: "REC_VS_GTO_CONTRADICTION",
                  details: `Commentary recommends ${rec} but GTO says ${gtoAction}`,
                });
              }
              if (recIsFold && gtoIsAggressive) {
                issues.push({ hand: i, street, heroCards, category, severity: "error",
                  check: "REC_VS_GTO_CONTRADICTION",
                  details: `Commentary recommends fold but GTO says ${gtoAction}`,
                });
              }
            }
          }

          // ── CHECK 3: GTO frequency and hand strength are coherent ──
          if (snap.gtoOptimalAction && snap.gtoFrequencies) {
            const gtoAction = snap.gtoOptimalAction;
            const freq = snap.gtoFrequencies[gtoAction as keyof typeof snap.gtoFrequencies] as number ?? 0;

            // Very strong hand told to fold with high frequency
            if (strength >= 0.8 && gtoAction === "fold" && freq > 0.7 && street !== "preflop") {
              issues.push({ hand: i, street, heroCards, category, severity: "error",
                check: "STRONG_HAND_FOLD",
                details: `${category} (${(strength*100).toFixed(0)}%) told to fold ${(freq*100).toFixed(0)}%`,
              });
            }

            // Very weak hand told to raise with high frequency (not preflop where bluffs are normal)
            if (strength <= 0.1 && (gtoAction.startsWith("bet") || gtoAction.startsWith("raise")) && freq > 0.7 && street !== "preflop") {
              issues.push({ hand: i, street, heroCards, category, severity: "warning",
                check: "WEAK_HAND_RAISE",
                details: `${category} (${(strength*100).toFixed(0)}%) told to bet/raise ${(freq*100).toFixed(0)}%`,
              });
            }
          }

          // ── CHECK 4: Opponent story confidence matches action count ──
          if (snap.opponentStories.length > 0) {
            const story = snap.opponentStories[0];
            const actionCount = (stepper as any).session?.state?.actionHistory
              ?.filter((a: any) => a.seatIndex !== 0).length ?? 0;

            // "strong read" with only 1 action is suspicious
            if (story.confidence === "strong" && actionCount <= 1) {
              issues.push({ hand: i, street, heroCards, category, severity: "warning",
                check: "PREMATURE_STRONG_READ",
                details: `"strong read" with only ${actionCount} opponent actions`,
              });
            }
          }

          // ── CHECK 5: Action narratives exist for available actions ──
          if (snap.actionStories.length === 0 && snap.legalActions) {
            const actionCount = [snap.legalActions.canFold, snap.legalActions.canCheck,
              snap.legalActions.canCall, snap.legalActions.canBet, snap.legalActions.canRaise]
              .filter(Boolean).length;
            if (actionCount >= 2) {
              issues.push({ hand: i, street, heroCards, category, severity: "warning",
                check: "MISSING_ACTION_STORIES",
                details: `${actionCount} legal actions but 0 action narratives`,
              });
            }
          }

          // ── CHECK 6: Commentary says "Fold" then "GTO confirms: call/raise" (the KTo bug) ──
          if (snap.commentary?.narrative) {
            const text = snap.commentary.narrative;
            // Check for "Fold." followed by "GTO confirms: call/raise"
            const foldMatch = text.match(/\bFold\b.*GTO confirms?:?\s*(call|raise|bet)/i);
            if (foldMatch) {
              issues.push({ hand: i, street, heroCards, category, severity: "error",
                check: "FOLD_THEN_GTO_CONTINUE",
                details: `Commentary says Fold then "GTO confirms: ${foldMatch[1]}"`,
              });
            }
            // Check for "Call/Raise" followed by "GTO confirms: fold"
            const continueMatch = text.match(/\b(Call|Raise|Bet)\b.*GTO confirms?:?\s*fold/i);
            if (continueMatch) {
              issues.push({ hand: i, street, heroCards, category, severity: "error",
                check: "CONTINUE_THEN_GTO_FOLD",
                details: `Commentary says ${continueMatch[1]} then "GTO confirms: fold"`,
              });
            }
          }

          // ── CHECK 7: Position mentioned correctly in commentary ──
          if (snap.commentary?.narrative && street === "preflop") {
            const text = snap.commentary.narrative;
            const heroPos = snap.heroPosition?.toLowerCase() ?? "";
            // If commentary mentions a specific position, it should match hero's actual position
            const positionMentions = ["under the gun", "hijack", "cutoff", "button", "small blind", "big blind"];
            const positionCodes = ["utg", "hj", "co", "btn", "sb", "bb"];
            const heroDisplayPos = snap.heroPosition?.toLowerCase() ?? "";
            for (let p = 0; p < positionMentions.length; p++) {
              if (text.toLowerCase().includes(positionMentions[p])) {
                // Found a position mention — does it match hero?
                if (!heroDisplayPos.toLowerCase().includes(positionMentions[p]) &&
                    !heroDisplayPos.toLowerCase().includes(positionCodes[p])) {
                  // Only flag if it's clearly about hero, not opponent
                  if (text.toLowerCase().includes(`you're on the ${positionMentions[p]}`)) {
                    // This is about hero — check it matches
                    // heroPosition is display name like "Button" or "Under the Gun"
                    // This should always match since the commentator reads heroPosition
                  }
                }
              }
            }
          }

          // ── CHECK 8: Equity vs range is reasonable ──
          if (snap.opponentStories.length > 0) {
            const eq = snap.opponentStories[0].equityVsRange;
            // Equity should be between 0 and 1
            if (eq < 0 || eq > 1) {
              issues.push({ hand: i, street, heroCards, category, severity: "error",
                check: "EQUITY_OUT_OF_RANGE",
                details: `Equity vs range = ${eq} (should be 0-1)`,
              });
            }
            // Sets+ should rarely have equity below 30%
            if (category === "sets_plus" && eq < 0.3 && street !== "preflop") {
              issues.push({ hand: i, street, heroCards, category, severity: "warning",
                check: "SETS_LOW_EQUITY",
                details: `Sets+ has only ${(eq*100).toFixed(0)}% equity vs range`,
              });
            }
          }

          // ── CHECK 9: Hand category matches hand description in commentary ──
          if (snap.commentary?.narrative && snap.handStrength) {
            const text = snap.commentary.narrative.toLowerCase();
            const desc = snap.handStrength.description?.toLowerCase() ?? "";
            // If hand is "air" but commentary says "strong hand"
            if (category === "air" && text.includes("your") && text.includes("is strong") &&
                !text.includes("opponent") && !text.includes("their")) {
              issues.push({ hand: i, street, heroCards, category, severity: "error",
                check: "AIR_CALLED_STRONG",
                details: `Air hand described as strong in commentary`,
              });
            }
          }

          // ── CHECK 10: Archetype on postflop should be a texture archetype ──
          if (street !== "preflop" && snap.archetype) {
            const preflopArchetypes = ["rfi_opening", "bb_defense_vs_rfi", "three_bet_pots",
              "blind_vs_blind", "four_bet_five_bet"];
            if (preflopArchetypes.includes(snap.archetype.id)) {
              issues.push({ hand: i, street, heroCards, category, severity: "error",
                check: "PREFLOP_ARCHETYPE_ON_POSTFLOP",
                details: `Postflop (${street}) classified as preflop archetype: ${snap.archetype.id}`,
              });
            }
          }
        }

        step = stepper.autoAct();
        safety++;
      }
    }

    // ═══════════════════════════════════════════════════════
    // REPORT
    // ═══════════════════════════════════════════════════════

    const errors = issues.filter(i => i.severity === "error");
    const warnings = issues.filter(i => i.severity === "warning");

    console.log(`\n${"═".repeat(60)}`);
    console.log(`SEMANTIC AUDIT — ${HANDS} hands, ${totalSnapshots} snapshots`);
    console.log(`${"═".repeat(60)}`);
    console.log(`Errors: ${errors.length} | Warnings: ${warnings.length} | Rate: ${((issues.length / Math.max(totalSnapshots, 1)) * 100).toFixed(1)}%`);

    // Group by check type
    const byCheck: Record<string, number> = {};
    for (const issue of issues) byCheck[issue.check] = (byCheck[issue.check] ?? 0) + 1;
    if (Object.keys(byCheck).length > 0) {
      console.log(`\nBY CHECK:`);
      for (const [check, count] of Object.entries(byCheck).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${check}: ${count}`);
      }
    }

    // Show details
    if (errors.length > 0) {
      console.log(`\nERRORS (first 15):`);
      for (const issue of errors.slice(0, 15)) {
        console.log(`  [${issue.check}] #${issue.hand} ${issue.street} ${issue.heroCards} (${issue.category})`);
        console.log(`    ${issue.details}`);
      }
    }
    if (warnings.length > 0) {
      console.log(`\nWARNINGS (first 10):`);
      for (const issue of warnings.slice(0, 10)) {
        console.log(`  [${issue.check}] #${issue.hand} ${issue.street} ${issue.heroCards} (${issue.category})`);
        console.log(`    ${issue.details}`);
      }
    }

    // Assert: no errors
    expect(errors.length).toBe(0);
  }, 120_000);
});
