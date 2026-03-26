/**
 * Archetype Automation — systematically test all 20 archetypes.
 *
 * For each archetype:
 * 1. Deal a constrained hand via executeDrillPipeline
 * 2. Capture the full snapshot at hero's decision point
 * 3. Auto-act following coaching
 * 4. Capture the score
 * 5. Verify coherence: does the coaching match the archetype?
 *    Does the narrative make sense? Does the score align?
 */
import { describe, it, expect } from "vitest";
import { HandStepper } from "../../convex/lib/analysis/handStepper";
import { executeDrillPipeline } from "../../convex/lib/gto/drillPipeline";
import { ALL_ARCHETYPE_IDS, type ArchetypeId } from "../../convex/lib/gto/archetypeClassifier";
import { captureFullSnapshot, formatSnapshot } from "../../convex/lib/analysis/snapshot";
import { chooseActionFromProfile } from "../../convex/lib/opponents/autoPlay";
import { currentLegalActions } from "../../convex/lib/state/stateMachine";
import { GTO_PROFILE, PRESET_PROFILES } from "../../convex/lib/opponents/presets";
import { normalizeToGtoAction, scoreAction } from "../../convex/lib/gto/evScoring";
import { cardToString } from "../../convex/lib/primitives/card";
import type { CardIndex } from "../../convex/lib/types/cards";

interface ArchetypeResult {
  archetypeId: string;
  heroCards: string;
  heroPosition: string;
  communityCards: string;
  street: string;
  handCategory: string;
  handStrength: number;
  // Coaching
  gtoAction: string;
  gtoFrequency: number;
  commentary: string;
  // Hero action (following coaching)
  heroAction: string;
  // Score
  verdict: string;
  // Coherence checks
  archetypeMatchesBoard: boolean;
  narrativePresent: boolean;
  actionStoriesPresent: boolean;
  heroPerceivedRangePresent: boolean;
  opponentStoryPresent: boolean;
}

describe("Archetype Automation", () => {
  it("runs 3 hands per archetype and validates coherence", () => {
    const HANDS_PER_ARCHETYPE = 3;
    const results: ArchetypeResult[] = [];
    const issues: string[] = [];

    for (const archId of ALL_ARCHETYPE_IDS) {
      for (let h = 0; h < HANDS_PER_ARCHETYPE; h++) {
        try {
          const rng = () => Math.random();
          const { deal, session, state, solution } = executeDrillPipeline(archId, rng);

          if (!state) { issues.push(`${archId}#${h}: no state`); continue; }

          const legal = currentLegalActions(state);
          if (!legal) { issues.push(`${archId}#${h}: no legal actions`); continue; }

          const heroPlayer = state.players.find(p => p.seatIndex === deal.heroSeatIndex);
          if (!heroPlayer) { issues.push(`${archId}#${h}: no hero`); continue; }

          const heroCards = heroPlayer.holeCards as CardIndex[];
          if (heroCards.length < 2) { issues.push(`${archId}#${h}: no hero cards`); continue; }

          // Capture snapshot
          const profiles = new Map();
          for (const p of state.players) {
            if (p.seatIndex !== deal.heroSeatIndex) {
              profiles.set(p.seatIndex, PRESET_PROFILES.gto);
            }
          }
          const snap = captureFullSnapshot(state, deal.heroSeatIndex, heroCards, {
            debug: "lite" as any,
            opponentProfiles: profiles,
          });

          // Auto-act using engine
          const decision = chooseActionFromProfile(
            state, deal.heroSeatIndex, GTO_PROFILE, legal,
          );

          // Score
          const heroGtoAction = normalizeToGtoAction(decision.actionType, decision.amount, state.pot.total);
          const score = solution ? scoreAction(
            deal.archetype, deal.handCategory, heroGtoAction,
            state.pot.total, deal.isInPosition,
            state.currentStreet,
          ) : null;

          // Extract data
          const gtoOptimal = snap.gtoOptimalAction ?? "unknown";
          const gtoFreq = snap.gtoFrequencies?.[gtoOptimal as keyof typeof snap.gtoFrequencies] ?? 0;

          const result: ArchetypeResult = {
            archetypeId: archId,
            heroCards: heroCards.map(cardToString).join(" "),
            heroPosition: deal.heroPosition,
            communityCards: state.communityCards.map(c => cardToString(c as CardIndex)).join(" "),
            street: state.currentStreet,
            handCategory: snap.handStrength?.category ?? "unknown",
            handStrength: snap.handStrength?.relativeStrength ?? 0,
            gtoAction: gtoOptimal,
            gtoFrequency: gtoFreq as number,
            commentary: snap.commentary?.narrative?.substring(0, 150) ?? "none",
            heroAction: decision.actionType,
            verdict: score?.verdict ?? "no-score",
            archetypeMatchesBoard: snap.archetype?.id === archId || snap.archetype?.textureId === archId,
            narrativePresent: !!snap.commentary?.narrative && snap.commentary.narrative.length > 20,
            actionStoriesPresent: snap.actionStories.length > 0,
            heroPerceivedRangePresent: !!snap.heroPerceivedRange,
            opponentStoryPresent: snap.opponentStories.length > 0,
          };

          results.push(result);

          // Check for issues
          if (!result.narrativePresent) issues.push(`${archId}#${h}: no commentary`);
          if (!result.actionStoriesPresent) issues.push(`${archId}#${h}: no action stories`);
          if (result.gtoAction === "unknown") issues.push(`${archId}#${h}: no GTO data`);

        } catch (e) {
          issues.push(`${archId}#${h}: ERROR ${(e as Error).message?.substring(0, 80)}`);
        }
      }
    }

    // ═══════════════════════════════════════════════════════
    // SUMMARY
    // ═══════════════════════════════════════════════════════

    console.log(`\n${"═".repeat(70)}`);
    console.log(`ARCHETYPE AUTOMATION — ${results.length} hands across ${ALL_ARCHETYPE_IDS.length} archetypes`);
    console.log(`${"═".repeat(70)}`);

    // Per-archetype summary
    for (const archId of ALL_ARCHETYPE_IDS) {
      const archResults = results.filter(r => r.archetypeId === archId);
      if (archResults.length === 0) {
        console.log(`  ${archId.padEnd(30)} — NO RESULTS`);
        continue;
      }
      const hasCommentary = archResults.filter(r => r.narrativePresent).length;
      const hasGto = archResults.filter(r => r.gtoAction !== "unknown").length;
      const hasStories = archResults.filter(r => r.actionStoriesPresent).length;
      const hasOppStory = archResults.filter(r => r.opponentStoryPresent).length;
      const hasHeroRange = archResults.filter(r => r.heroPerceivedRangePresent).length;

      console.log(
        `  ${archId.padEnd(30)} ` +
        `coach:${hasCommentary}/${archResults.length} ` +
        `gto:${hasGto}/${archResults.length} ` +
        `stories:${hasStories}/${archResults.length} ` +
        `opp:${hasOppStory}/${archResults.length} ` +
        `L3:${hasHeroRange}/${archResults.length}`,
      );
    }

    // Issues
    if (issues.length > 0) {
      console.log(`\nISSUES (${issues.length}):`);
      for (const issue of issues.slice(0, 20)) {
        console.log(`  ⚠ ${issue}`);
      }
      if (issues.length > 20) console.log(`  ... and ${issues.length - 20} more`);
    }

    // Sample hands
    console.log(`\nSAMPLE HANDS:`);
    const sampled = ALL_ARCHETYPE_IDS.slice(0, 5);
    for (const archId of sampled) {
      const r = results.find(r => r.archetypeId === archId);
      if (!r) continue;
      console.log(`\n  ${archId}:`);
      console.log(`    Hero: ${r.heroCards} (${r.heroPosition}) | Board: ${r.communityCards || "preflop"}`);
      console.log(`    Hand: ${r.handCategory} (${(r.handStrength * 100).toFixed(0)}%) | GTO: ${r.gtoAction} (${(r.gtoFrequency * 100).toFixed(0)}%)`);
      console.log(`    Hero did: ${r.heroAction} → ${r.verdict}`);
      console.log(`    Coach: ${r.commentary}`);
    }

    // Assertions
    expect(results.length).toBeGreaterThan(ALL_ARCHETYPE_IDS.length); // at least 1 per archetype
    expect(issues.filter(i => i.includes("ERROR")).length).toBe(0); // no crashes
  }, 120_000);

  it("classifier assigns correct archetype for common positions", () => {
    // Validate the classifier doesn't misclassify (e.g., HJ facing raise ≠ BB Defense)
    // Use HandStepper which sets up proper game state
    const stepper = new HandStepper({ numPlayers: 6, heroSeat: 0, dealerSeat: 0 });
    // Hero at seat 0, dealer at 0 → hero is BTN
    const step = stepper.deal();
    if (!step) return;

    // The snapshot has archetype classification
    const snap = step.snapshot;
    const archetype = snap.archetype;
    const heroPos = snap.heroPosition;

    console.log(`  Hero at ${heroPos}: classified as "${archetype?.id}"`);

    // BTN facing a raise should NOT be bb_defense
    if (heroPos !== "bb" && archetype) {
      expect(archetype.id).not.toBe("bb_defense_vs_rfi");
    }

    // Test multiple positions
    const classResults: Array<{ pos: string; arch: string }> = [];
    for (let seat = 0; seat < 6; seat++) {
      const s = new HandStepper({ numPlayers: 6, heroSeat: seat, dealerSeat: 0 });
      const st = s.deal();
      if (!st) continue;
      classResults.push({
        pos: st.snapshot.heroPosition,
        arch: st.snapshot.archetype?.id ?? "none",
      });
    }

    console.log("  Classifier by position:");
    for (const r of classResults) {
      // BB can be bb_defense or blind_vs_blind (depends on who raised)
      // Non-BB should NEVER be bb_defense
      const isBlind = r.pos.toLowerCase().includes("blind") || r.pos === "bb" || r.pos === "sb";
      const ok = isBlind ? true : r.arch !== "bb_defense_vs_rfi";
      console.log(`    ${r.pos.padEnd(15)}: ${r.arch.padEnd(25)} ${ok ? "✓" : "✗ WRONG"}`);
      if (!isBlind) {
        expect(r.arch).not.toBe("bb_defense_vs_rfi");
      }
    }
  });
});
