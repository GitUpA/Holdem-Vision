/**
 * Preflop Coverage — verifies EVERY position × situation returns
 * hand-specific classifications with sensible results.
 *
 * Preflop is solved via range classification: each hand × position × situation
 * maps to always_play / marginal / always_fold.
 */
import { describe, it, expect } from "vitest";
import {
  classifyPreflopHand,
  classificationToFrequencies,
  type PreflopRangeClass,
} from "../../convex/lib/gto/preflopClassification";

const POSITIONS = ["utg", "hj", "co", "btn", "sb", "bb"] as const;

const SAMPLE_HANDS = {
  premium: ["AA", "KK", "QQ", "AKs"],
  strong: ["JJ", "TT", "AQs", "AKo", "KQs"],
  medium: ["99", "ATs", "KJs", "QJs", "JTs"],
  marginal: ["88", "A9s", "KTo", "Q9s", "87s"],
  weak: ["72o", "83o", "94o", "32o", "J2o"],
};

const PLAY_CLASSES = new Set<PreflopRangeClass>(["clear_raise", "raise", "mixed_raise", "call"]);

describe("Preflop Coverage — Free Play", () => {
  describe("RFI (open action)", () => {
    for (const pos of POSITIONS) {
      it(`${pos.toUpperCase()} premiums always play`, () => {
        for (const hand of SAMPLE_HANDS.premium) {
          const c = classifyPreflopHand(hand, "rfi_opening", pos);
          expect(PLAY_CLASSES.has(c.rangeClass)).toBe(true);
        }
      });

      if (!["btn", "sb", "bb"].includes(pos)) {
        it(`${pos.toUpperCase()} junk hands fold from early positions`, () => {
          for (const hand of SAMPLE_HANDS.weak) {
            const c = classifyPreflopHand(hand, "rfi_opening", pos);
            expect(c.rangeClass).toBe("clear_fold");
          }
        });
      }
    }
  });

  describe("BB defense vs RFI", () => {
    const openers = ["utg", "hj", "co", "btn"] as const;
    for (const opener of openers) {
      it(`BB vs ${opener.toUpperCase()} — premiums always continue`, () => {
        for (const hand of SAMPLE_HANDS.premium) {
          const c = classifyPreflopHand(hand, "bb_defense_vs_rfi", "bb", opener);
          expect(PLAY_CLASSES.has(c.rangeClass)).toBe(true);
        }
      });

      it(`BB vs ${opener.toUpperCase()} — junk folds`, () => {
        for (const hand of SAMPLE_HANDS.weak) {
          const c = classifyPreflopHand(hand, "bb_defense_vs_rfi", "bb", opener);
          expect(c.rangeClass).toBe("clear_fold");
        }
      });
    }
  });

  describe("Three-bet pots (facing a raise)", () => {
    for (const pos of POSITIONS) {
      it(`${pos.toUpperCase()} — AA always continues`, () => {
        const c = classifyPreflopHand("AA", "three_bet_pots", pos);
        expect(PLAY_CLASSES.has(c.rangeClass)).toBe(true);
      });
    }
  });

  describe("Four-bet / five-bet pots", () => {
    for (const pos of POSITIONS) {
      it(`${pos.toUpperCase()} — AA always continues`, () => {
        const c = classifyPreflopHand("AA", "four_bet_five_bet", pos);
        expect(PLAY_CLASSES.has(c.rangeClass)).toBe(true);
      });

      it(`${pos.toUpperCase()} — junk folds facing 4-bet`, () => {
        const c = classifyPreflopHand("72o", "four_bet_five_bet", pos);
        expect(c.rangeClass).toBe("clear_fold");
      });
    }
  });

  describe("Blind vs blind", () => {
    it("SB premiums raise", () => {
      const c = classifyPreflopHand("AA", "blind_vs_blind", "sb");
      expect(c.rangeClass).toBe("clear_raise");
    });

    it("BB premiums raise vs SB", () => {
      const c = classifyPreflopHand("AA", "blind_vs_blind", "bb");
      expect(c.rangeClass).toBe("clear_raise");
    });
  });

  describe("Position sensitivity", () => {
    it("BTN opens wider than UTG", () => {
      // K8o: in BTN range, not in UTG range
      const btn = classifyPreflopHand("K8o", "rfi_opening", "btn");
      const utg = classifyPreflopHand("K8o", "rfi_opening", "utg");
      expect(PLAY_CLASSES.has(btn.rangeClass)).toBe(true);
      expect(utg.rangeClass).toBe("clear_fold");
    });

    it("BB defends wider vs BTN than vs UTG", () => {
      // K9o: defends vs BTN but not vs UTG
      const vsBtn = classifyPreflopHand("K9o", "bb_defense_vs_rfi", "bb", "btn");
      const vsUtg = classifyPreflopHand("K9o", "bb_defense_vs_rfi", "bb", "utg");
      expect(PLAY_CLASSES.has(vsBtn.rangeClass)).toBe(true);
      expect(vsUtg.rangeClass).toMatch(/fold|borderline/);
    });
  });

  describe("Frequency derivation", () => {
    it("frequencies sum to ~1.0", () => {
      for (const hand of [...SAMPLE_HANDS.premium, ...SAMPLE_HANDS.weak]) {
        const c = classifyPreflopHand(hand, "rfi_opening", "utg");
        const freqs = classificationToFrequencies(c, "rfi_opening");
        const sum = Object.values(freqs).reduce((s, v) => s + (v ?? 0), 0);
        expect(sum).toBeCloseTo(1, 1);
      }
    });

    it("clear_raise has high raise frequency", () => {
      const c = classifyPreflopHand("AA", "rfi_opening", "utg");
      const freqs = classificationToFrequencies(c, "rfi_opening");
      const raiseFreq = (freqs.bet_medium ?? 0) + (freqs.raise_large ?? 0);
      expect(raiseFreq).toBeGreaterThan(0.9);
    });

    it("clear_fold has high fold frequency", () => {
      const c = classifyPreflopHand("72o", "rfi_opening", "utg");
      const freqs = classificationToFrequencies(c, "rfi_opening");
      expect(freqs.fold ?? 0).toBeGreaterThan(0.85);
    });
  });

  describe("Teaching notes", () => {
    it("classification includes reason and teaching note", () => {
      const c = classifyPreflopHand("AKs", "rfi_opening", "co");
      expect(c.reason).toBeTruthy();
      expect(c.teachingNote).toBeTruthy();
      expect(c.reason.length).toBeGreaterThan(10);
    });
  });
});
