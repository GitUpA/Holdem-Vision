/**
 * Preflop Sanity — validates that specific hands get reasonable preflop advice.
 *
 * The user spotted KQs from CO being told to fold 92% vs a UTG raise.
 * That's clearly wrong — KQs is a premium hand that should call or 3-bet.
 *
 * This test checks that known-good hands get call/raise recommendations,
 * and known-bad hands get fold recommendations. Catches preflop data
 * quality issues that narrative-level tests miss.
 */
import { describe, it, expect } from "vitest";
import { classifyPreflopHand, classificationToFrequencies } from "../../convex/lib/gto/preflopClassification";

describe("Preflop Sanity", () => {
  describe("RFI — should open these hands", () => {
    const mustOpen: Array<[string, string, number]> = [
      // [handClass, position, maxFoldPct]
      ["AA", "utg", 5],
      ["KK", "utg", 5],
      ["AKs", "utg", 10],
      ["AKo", "utg", 15],
      ["KQs", "co", 15],
      ["AJo", "btn", 15],
      ["87s", "btn", 40],
      ["Q9o", "btn", 50],
      // J6o BTN is outside the range — correctly folds. J6s opens.
      ["A2o", "btn", 40],
      ["K5s", "sb", 40],
      ["22", "btn", 20],
    ];

    for (const [hand, pos, maxFold] of mustOpen) {
      it(`${hand} from ${pos.toUpperCase()} opens (fold ≤ ${maxFold}%)`, () => {
        const c = classifyPreflopHand(hand, "rfi_opening", pos);
        const freqs = classificationToFrequencies(c, "rfi_opening");
        expect(freqs.fold ?? 0).toBeLessThanOrEqual(maxFold / 100);
      });
    }
  });

  describe("Facing raise — should continue with these hands", () => {
    const mustContinue: Array<[string, string, number]> = [
      // [handClass, position, maxFoldPct]
      ["AA", "btn", 5],
      ["KK", "co", 5],
      ["AKs", "btn", 10],
      ["KQs", "co", 20],   // THE BUG: was folding 92%
      ["AJs", "co", 25],
      ["TT", "btn", 20],
      ["99", "btn", 30],
      ["JTs", "btn", 30],
      ["AJo", "btn", 30],
      ["KQo", "co", 30],
      ["98s", "btn", 40],
      ["ATs", "co", 25],
    ];

    for (const [hand, pos, maxFold] of mustContinue) {
      it(`${hand} from ${pos.toUpperCase()} continues facing raise (fold ≤ ${maxFold}%)`, () => {
        const c = classifyPreflopHand(hand, "three_bet_pots", pos);
        const freqs = classificationToFrequencies(c, "three_bet_pots");
        expect((freqs.fold ?? 0) * 100).toBeLessThanOrEqual(maxFold);
      });
    }
  });

  describe("BB defense — should defend these hands", () => {
    const mustDefend: Array<[string, string, number]> = [
      // [handClass, raiserPosition, maxFoldPct]
      ["AA", "btn", 5],
      ["KQs", "btn", 10],
      ["AJo", "btn", 20],
      ["TT", "utg", 15],
      ["98s", "btn", 20],
      ["K9s", "btn", 25],
      ["QJo", "btn", 30],
      ["76s", "btn", 25],
    ];

    for (const [hand, raiser, maxFold] of mustDefend) {
      it(`BB defends ${hand} vs ${raiser.toUpperCase()} (fold ≤ ${maxFold}%)`, () => {
        const c = classifyPreflopHand(hand, "bb_defense_vs_rfi", "bb", raiser);
        const freqs = classificationToFrequencies(c, "bb_defense_vs_rfi");
        expect((freqs.fold ?? 0) * 100).toBeLessThanOrEqual(maxFold);
      });
    }
  });

  describe("Should fold these junk hands", () => {
    const mustFold: Array<[string, string, number]> = [
      // [handClass, position, minFoldPct]
      ["72o", "utg", 90],
      ["32o", "utg", 90],
      ["83o", "co", 70],
      ["94o", "hj", 80],
    ];

    for (const [hand, pos, minFold] of mustFold) {
      it(`${hand} from ${pos.toUpperCase()} folds (fold ≥ ${minFold}%)`, () => {
        const c = classifyPreflopHand(hand, "rfi_opening", pos);
        const freqs = classificationToFrequencies(c, "rfi_opening");
        expect((freqs.fold ?? 0) * 100).toBeGreaterThanOrEqual(minFold);
      });
    }
  });
});
