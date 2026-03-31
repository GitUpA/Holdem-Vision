/**
 * Preflop Grid Pipeline — unit tests for each stage.
 */
import { describe, it, expect } from "vitest";
import {
  classifyPreflopSituation,
  computePotAtAction,
  getOpponentRange,
  getHeroContinueRange,
  classifyFacing,
  classifyFacingGrid,
  computeEquityGrid,
  computePreflopHandGrid,
  getHeroHandClass,
  type PreflopSituation,
} from "../../convex/lib/analysis/preflopGrid";
import type { CardIndex } from "../../convex/lib/types/cards";
import { getPreflopEquity } from "../../convex/lib/gto/preflopEquityTable";

// ═══════════════════════════════════════════════════════
// STAGE B: classifyPreflopSituation
// ═══════════════════════════════════════════════════════

describe("classifyPreflopSituation", () => {
  it("RFI when no opener", () => {
    const s = classifyPreflopSituation("co", null, 0, false);
    expect(s.type).toBe("rfi");
  });

  it("facing_open when single raiser", () => {
    const s = classifyPreflopSituation("btn", "utg", 0, false);
    expect(s.type).toBe("facing_open");
    if (s.type === "facing_open") expect(s.opener).toBe("utg");
  });

  it("facing_open_multiway when raiser + callers", () => {
    const s = classifyPreflopSituation("btn", "utg", 2, false);
    expect(s.type).toBe("facing_open_multiway");
    if (s.type === "facing_open_multiway") {
      expect(s.opener).toBe("utg");
      expect(s.callers).toBe(2);
    }
  });

  it("facing_3bet when hero opened and got re-raised", () => {
    const s = classifyPreflopSituation("utg", "btn", 0, true);
    expect(s.type).toBe("facing_3bet");
  });

  it("blind_vs_blind when SB opens and hero is BB", () => {
    const s = classifyPreflopSituation("bb", "sb", 0, false);
    expect(s.type).toBe("blind_vs_blind");
  });

  it("facing_open when SB opens with callers (not pure BvB)", () => {
    const s = classifyPreflopSituation("bb", "sb", 1, false);
    expect(s.type).toBe("facing_open_multiway");
  });
});

// ═══════════════════════════════════════════════════════
// STAGE G: computePotAtAction
// ═══════════════════════════════════════════════════════

describe("computePotAtAction", () => {
  const blinds = { sb: 0.5, bb: 1 };

  it("RFI pot is just blinds", () => {
    expect(computePotAtAction(blinds, 0, 0, false, null)).toBe(1.5);
  });

  it("single raise to 3BB", () => {
    // blinds (1.5) + raiser (3) = 4.5
    expect(computePotAtAction(blinds, 3, 0, false, null)).toBe(4.5);
  });

  it("raise to 3BB + 1 caller", () => {
    // blinds (1.5) + raiser (3) + caller (3) = 7.5
    expect(computePotAtAction(blinds, 3, 1, false, null)).toBe(7.5);
  });

  it("raise to 3BB + 2 callers", () => {
    // blinds (1.5) + raiser (3) + 2 callers (6) = 10.5
    expect(computePotAtAction(blinds, 3, 2, false, null)).toBe(10.5);
  });

  it("3-bet pot: open 3BB + 3-bet 10BB", () => {
    // blinds (1.5) + opener (3) + 3-bettor (10) = 14.5
    expect(computePotAtAction(blinds, 3, 0, true, 10)).toBe(14.5);
  });
});

// ═══════════════════════════════════════════════════════
// STAGE C: getOpponentRange
// ═══════════════════════════════════════════════════════

describe("getOpponentRange", () => {
  it("returns null for RFI (no opponent)", () => {
    const s: PreflopSituation = { type: "rfi" };
    expect(getOpponentRange(s)).toBeNull();
  });

  it("returns UTG range when facing UTG open", () => {
    const s: PreflopSituation = { type: "facing_open", opener: "utg" };
    const range = getOpponentRange(s)!;
    expect(range).not.toBeNull();
    expect(range.has("AA")).toBe(true);
    expect(range.has("72o")).toBe(false);
    expect(range.size).toBeLessThan(40); // UTG ~15% = ~25 hand classes
  });

  it("returns BTN range (wider) when facing BTN open", () => {
    const s: PreflopSituation = { type: "facing_open", opener: "btn" };
    const range = getOpponentRange(s)!;
    expect(range.size).toBeGreaterThan(50); // BTN ~44%
  });
});

// ═══════════════════════════════════════════════════════
// STAGE D: getHeroContinueRange
// ═══════════════════════════════════════════════════════

describe("getHeroContinueRange", () => {
  it("RFI uses opening range", () => {
    const s: PreflopSituation = { type: "rfi" };
    const range = getHeroContinueRange(s, "btn");
    expect(range.has("AA")).toBe(true);
    expect(range.has("K8o")).toBe(true); // BTN opens wide
  });

  it("facing_open uses cold-call + 3-bet, NOT RFI", () => {
    const s: PreflopSituation = { type: "facing_open", opener: "utg" };
    const range = getHeroContinueRange(s, "btn");
    expect(range.has("AA")).toBe(true); // 3-bet range
    expect(range.has("TT")).toBe(true); // cold-call range
    // J6o is in BTN RFI but NOT in cold-call or 3-bet
    expect(range.has("J6o")).toBe(false);
  });

  it("BB defense vs BTN is wide", () => {
    const s: PreflopSituation = { type: "facing_open", opener: "btn" };
    const range = getHeroContinueRange(s, "bb");
    expect(range.has("AA")).toBe(true);
    expect(range.has("76s")).toBe(true); // BB defends wide vs BTN
    expect(range.size).toBeGreaterThan(40);
  });

  it("BB defense vs UTG is tight", () => {
    const s: PreflopSituation = { type: "facing_open", opener: "utg" };
    const range = getHeroContinueRange(s, "bb");
    expect(range.has("AA")).toBe(true);
    expect(range.size).toBeLessThan(40); // tighter vs UTG
  });

  it("BB vs SB uses BvB data", () => {
    const s: PreflopSituation = { type: "blind_vs_blind" };
    const range = getHeroContinueRange(s, "bb");
    expect(range.has("AA")).toBe(true);
    expect(range.size).toBeGreaterThan(30);
  });
});

// ═══════════════════════════════════════════════════════
// STAGE F: classifyFacing
// ═══════════════════════════════════════════════════════

describe("classifyFacing", () => {
  it("F when not in hero range", () => {
    expect(classifyFacing(0.55, 3, 4.5, false)).toBe("F");
  });

  it("V for AA (85%) in range facing 3BB into 4.5BB pot", () => {
    // potOdds = 3 / (4.5 + 3) = 0.40
    expect(classifyFacing(0.85, 3, 4.5, true)).toBe("V");
  });

  it("V for KQs (63%) in range facing 3BB", () => {
    expect(classifyFacing(0.63, 3, 4.5, true)).toBe("V");
  });

  it("M for 87s (53%) in range facing 3BB", () => {
    expect(classifyFacing(0.53, 3, 4.5, true)).toBe("M");
  });

  it("M when no bet (check)", () => {
    expect(classifyFacing(0.50, 0, 1.5, true)).toBe("M");
  });

  it("F for weak hand (35%) in range facing 10BB", () => {
    // potOdds = 10 / (1.5 + 10 + 10) = 10/21.5 = 0.465
    // surplus = 0.35 - 0.465 = -0.115
    expect(classifyFacing(0.35, 10, 11.5, true)).toBe("F");
  });
});

// ═══════════════════════════════════════════════════════
// HERO HAND CLASS
// ═══════════════════════════════════════════════════════

describe("getHeroHandClass", () => {
  it("AKs", () => {
    // A=48+suit, K=44+suit. Same suit = suited.
    expect(getHeroHandClass([48 as CardIndex, 44 as CardIndex])).toBe("AKs");
  });

  it("AKo", () => {
    expect(getHeroHandClass([48 as CardIndex, 45 as CardIndex])).toBe("AKo");
  });

  it("AA", () => {
    expect(getHeroHandClass([48 as CardIndex, 49 as CardIndex])).toBe("AA");
  });

  it("72o", () => {
    // 7 = rank 5, card 20+suit. 2 = rank 0, card 0+suit
    expect(getHeroHandClass([20 as CardIndex, 1 as CardIndex])).toBe("72o");
  });
});

// ═══════════════════════════════════════════════════════
// STAGE E: computeEquityGrid (smoke test)
// ═══════════════════════════════════════════════════════

describe("computeEquityGrid", () => {
  it("returns static equity when no opponent range", () => {
    const eq = computeEquityGrid([48 as CardIndex, 49 as CardIndex], null, 0);
    expect(eq.get("AA")).toBe(getPreflopEquity("AA"));
    expect(eq.get("72o")).toBe(getPreflopEquity("72o"));
    expect(eq.size).toBe(169);
  });

  it("AA has higher equity vs UTG range than 72o", () => {
    const utgRange = new Set(["AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "66", "AKs", "AQs", "AJs", "ATs", "AKo", "AQo", "AJo", "KQs", "KJs", "KTs", "QJs", "QTs", "JTs", "T9s", "98s", "87s", "76s", "65s", "A5s", "A4s"]);
    const eq = computeEquityGrid([48 as CardIndex, 49 as CardIndex], utgRange, 100);
    const aaEq = eq.get("AA")!;
    const junkEq = eq.get("72o")!;
    expect(aaEq).toBeGreaterThan(junkEq);
    expect(aaEq).toBeGreaterThan(0.7); // AA dominates even tight ranges
  });
});

// ═══════════════════════════════════════════════════════
// STAGE H: computePreflopHandGrid (integration)
// ═══════════════════════════════════════════════════════

describe("computePreflopHandGrid", { timeout: 30_000 }, () => {
  it("produces 169 cells", () => {
    const result = computePreflopHandGrid({
      heroCards: [48 as CardIndex, 45 as CardIndex], // AKo
      heroPosition: "btn",
    });
    expect(result.cells.length).toBe(169);
    expect(result.heroHandClass).toBe("AKo");
  });

  it("hero cell is flagged", () => {
    const result = computePreflopHandGrid({
      heroCards: [48 as CardIndex, 45 as CardIndex],
      heroPosition: "btn",
    });
    const heroCell = result.cells.find(c => c.isHero);
    expect(heroCell).toBeDefined();
    expect(heroCell!.handClass).toBe("AKo");
  });

  it("facing an open produces facing classifications", () => {
    const result = computePreflopHandGrid({
      heroCards: [48 as CardIndex, 45 as CardIndex],
      heroPosition: "btn",
      openerPosition: "utg",
      openerSizingBB: 3,
    }, 50); // low trials for test speed
    // AKo should be V facing UTG open
    const heroCell = result.cells.find(c => c.isHero)!;
    expect(heroCell.facing).toBe("V");
    expect(heroCell.inHeroRange).toBe(true);

    // 72o should be F
    const junk = result.cells.find(c => c.handClass === "72o")!;
    expect(junk.facing).toBe("F");
    expect(junk.inHeroRange).toBe(false);
  });

  it("RFI has no facing classifications", () => {
    const result = computePreflopHandGrid({
      heroCards: [48 as CardIndex, 45 as CardIndex],
      heroPosition: "btn",
    });
    const heroCell = result.cells.find(c => c.isHero)!;
    expect(heroCell.facing).toBeNull();
  });

  it("pot size is correct for 3BB open", () => {
    const result = computePreflopHandGrid({
      heroCards: [48 as CardIndex, 45 as CardIndex],
      heroPosition: "btn",
      openerPosition: "utg",
      openerSizingBB: 3,
    }, 50);
    expect(result.potSizeBB).toBe(4.5);
  });
});
