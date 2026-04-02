/**
 * Preflop Grid Pipeline — unit tests for each stage.
 */
import { describe, it, expect } from "vitest";
import {
  computePotAtAction,
  classifyAction,
  computeEquityGrid,
  computePreflopHandGrid,
  getHeroHandClass,
} from "../../convex/lib/analysis/preflopGrid";
import {
  classifySituation,
  classifySituationFromState,
  type PreflopSituationContext,
} from "../../convex/lib/preflop/situationRegistry";
import { resolveOpponentRange, resolveHeroRange } from "../../convex/lib/preflop/situationRanges";
import { normalize6Max, compressRangeByStack } from "../../convex/lib/preflop/rangeUtils";
import type { CardIndex, Position } from "../../convex/lib/types/cards";
import { getPreflopEquity } from "../../convex/lib/gto/preflopEquityTable";

// ═══════════════════════════════════════════════════════
// Situation Classification (via registry)
// ═══════════════════════════════════════════════════════

/** Helper to classify with defaults. */
function classify(overrides: Partial<Parameters<typeof classifySituation>[0]>): PreflopSituationContext {
  return classifySituation({
    heroPosition: "btn",
    openerPosition: null,
    numCallers: 0,
    numLimpers: 0,
    facing3Bet: false,
    ...overrides,
  });
}

describe("classifySituation", () => {
  it("RFI when no opener", () => {
    const s = classify({ heroPosition: "co" });
    expect(s.id).toBe("rfi");
  });

  it("facing_open when single raiser", () => {
    const s = classify({ heroPosition: "btn", openerPosition: "utg" });
    expect(s.id).toBe("facing_open");
    expect(s.openerPosition).toBe("utg");
  });

  it("facing_open_multiway when raiser + callers", () => {
    const s = classify({ heroPosition: "btn", openerPosition: "utg", numCallers: 2 });
    expect(s.id).toBe("facing_open_multiway");
    expect(s.openerPosition).toBe("utg");
    expect(s.numCallers).toBe(2);
  });

  it("facing_3bet when hero opened and got re-raised", () => {
    const s = classify({ heroPosition: "utg", openerPosition: "btn", facing3Bet: true, threeBettorPosition: "btn" });
    expect(s.id).toBe("facing_3bet");
    expect(s.threeBettorPosition).toBe("btn");
  });

  it("facing_3bet without threeBettor falls to rfi", () => {
    const s = classify({ heroPosition: "utg", facing3Bet: true });
    expect(s.id).toBe("rfi");
  });

  it("blind_vs_blind when SB opens and hero is BB", () => {
    const s = classify({ heroPosition: "bb", openerPosition: "sb" });
    expect(s.id).toBe("blind_vs_blind");
  });

  it("facing_open_multiway when SB opens with callers (not pure BvB)", () => {
    const s = classify({ heroPosition: "bb", openerPosition: "sb", numCallers: 1 });
    expect(s.id).toBe("facing_open_multiway");
  });

  it("facing_limpers when limpers and hero is not BB", () => {
    const s = classify({ heroPosition: "co", numLimpers: 1 });
    expect(s.id).toBe("facing_limpers");
  });

  it("bb_vs_limpers when limpers and hero is BB", () => {
    const s = classify({ heroPosition: "bb", numLimpers: 2 });
    expect(s.id).toBe("bb_vs_limpers");
  });

  it("bb_vs_sb_complete when SB limps and hero is BB", () => {
    const s = classify({ heroPosition: "bb", numLimpers: 1, isSBComplete: true });
    expect(s.id).toBe("bb_vs_sb_complete");
  });

  // ── HU (heads-up) BvB detection ──
  it("HU: BTN raises, hero is BB → blind_vs_blind", () => {
    const s = classify({ heroPosition: "bb", openerPosition: "btn", tableSize: 2 });
    expect(s.id).toBe("blind_vs_blind");
  });

  it("HU: BB raises, hero is BTN → blind_vs_blind", () => {
    const s = classify({ heroPosition: "btn", openerPosition: "bb", tableSize: 2 });
    expect(s.id).toBe("blind_vs_blind");
  });

  it("3-player: BTN raises, hero is BB → facing_open (not BvB)", () => {
    const s = classify({ heroPosition: "bb", openerPosition: "btn", tableSize: 3 });
    expect(s.id).toBe("facing_open");
  });

  it("HU: BTN completes, hero is BB → bb_vs_sb_complete", () => {
    const s = classify({ heroPosition: "bb", numLimpers: 1, isSBComplete: true, tableSize: 2 });
    expect(s.id).toBe("bb_vs_sb_complete");
  });
});

// ═══════════════════════════════════════════════════════
// classifySituationFromState — all-in edge cases
// ═══════════════════════════════════════════════════════

describe("classifySituationFromState all-in handling", () => {
  // Helper to build a minimal GameState for classification
  function makeState(overrides: {
    numPlayers?: number;
    actions: Array<{ seatIndex: number; actionType: string; amount?: number }>;
    positions?: string[];
  }) {
    const numPlayers = overrides.numPlayers ?? 6;
    const positions = overrides.positions ?? ["utg", "hj", "co", "btn", "sb", "bb"];
    return {
      numPlayers,
      blinds: { small: 0.5, big: 1 },
      players: positions.map((pos, i) => ({
        seatIndex: i,
        position: pos,
        status: "active" as const,
        startingStack: 100,
        currentStack: 100,
        totalCommitted: 0,
        streetCommitted: 0,
        holeCards: [],
        hasActedThisStreet: false,
        cardVisibility: "hidden" as const,
      })),
      actionHistory: overrides.actions.map((a, i) => ({
        seatIndex: a.seatIndex,
        position: positions[a.seatIndex],
        street: "preflop" as const,
        actionType: a.actionType,
        amount: a.amount,
        isAllIn: a.actionType === "all_in",
        sequence: i,
      })),
      currentStreet: "preflop" as const,
      raiseCount: 0,
      currentBet: 1,
      minRaiseSize: 1,
      activePlayerIndex: null,
      lastAggressorIndex: null,
      dealerSeatIndex: 3,
      handNumber: 1,
      deck: [],
      communityCards: [],
      pot: { mainPot: 0, sidePots: [], total: 0, explanation: "" },
      phase: "preflop" as const,
    };
  }

  it("UTG shoves 50BB as first action → facing_open for next player", () => {
    const state = makeState({
      actions: [{ seatIndex: 0, actionType: "all_in", amount: 50 }],
    });
    const ctx = classifySituationFromState(state as any, 1);
    expect(ctx.id).toBe("facing_open");
    expect(ctx.openerPosition).toBe("utg");
  });

  it("UTG raises 3BB, short-stack HJ calls all-in for 2BB → raiseCount stays 1", () => {
    const state = makeState({
      actions: [
        { seatIndex: 0, actionType: "raise", amount: 3 },
        { seatIndex: 1, actionType: "all_in", amount: 2 }, // call, not raise (2 < 3)
      ],
    });
    const ctx = classifySituationFromState(state as any, 2);
    expect(ctx.id).toBe("facing_open");
    expect(ctx.openerPosition).toBe("utg");
  });

  it("UTG raises 3BB, HJ shoves 30BB → facing_3bet for next player", () => {
    const state = makeState({
      actions: [
        { seatIndex: 0, actionType: "raise", amount: 3 },
        { seatIndex: 1, actionType: "all_in", amount: 30 }, // shove > 3 = raise
      ],
    });
    const ctx = classifySituationFromState(state as any, 2);
    expect(ctx.id).toBe("facing_3bet");
    expect(ctx.threeBettorPosition).toBe("hj");
  });

  it("UTG limps, HJ shoves 30BB → facing_open (raise after limp)", () => {
    const state = makeState({
      actions: [
        { seatIndex: 0, actionType: "call", amount: 1 }, // limp
        { seatIndex: 1, actionType: "all_in", amount: 30 }, // shove = raise
      ],
    });
    const ctx = classifySituationFromState(state as any, 2);
    expect(ctx.id).toBe("facing_open");
    expect(ctx.openerPosition).toBe("hj");
    expect(ctx.numLimpers).toBe(1);
  });

  it("Short-stack shoves 4BB as first action (4 > 1 BB) → facing_open", () => {
    const state = makeState({
      actions: [{ seatIndex: 0, actionType: "all_in", amount: 4 }],
    });
    const ctx = classifySituationFromState(state as any, 1);
    expect(ctx.id).toBe("facing_open");
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
// Opponent Range Resolution (via registry)
// ═══════════════════════════════════════════════════════

describe("resolveOpponentRange", () => {
  it("returns null for RFI (no opponent)", () => {
    const ctx = classify({ heroPosition: "co" });
    expect(resolveOpponentRange(ctx)).toBeNull();
  });

  it("returns UTG range when facing UTG open", () => {
    const ctx = classify({ heroPosition: "btn", openerPosition: "utg" });
    const range = resolveOpponentRange(ctx)!;
    expect(range).not.toBeNull();
    expect(range.has("AA")).toBe(true);
    expect(range.has("72o")).toBe(false);
    expect(range.size).toBeLessThan(40); // UTG ~15% = ~25 hand classes
  });

  it("returns BTN range (wider) when facing BTN open", () => {
    const ctx = classify({ heroPosition: "bb", openerPosition: "btn" });
    const range = resolveOpponentRange(ctx)!;
    expect(range.size).toBeGreaterThan(50); // BTN ~44%
  });
});

// ═══════════════════════════════════════════════════════
// resolveHeroRange
// ═══════════════════════════════════════════════════════

describe("resolveHeroRange", () => {
  it("RFI uses opening range", () => {
    const ctx = classify({ heroPosition: "btn" });
    const range = resolveHeroRange(ctx);
    expect(range.has("AA")).toBe(true);
    expect(range.has("K8o")).toBe(true); // BTN opens wide
  });

  it("facing_open uses cold-call + 3-bet, NOT RFI", () => {
    const ctx = classify({ heroPosition: "btn", openerPosition: "utg" });
    const range = resolveHeroRange(ctx);
    expect(range.has("AA")).toBe(true); // 3-bet range
    expect(range.has("TT")).toBe(true); // cold-call range
    // J6o is in BTN RFI but NOT in cold-call or 3-bet
    expect(range.has("J6o")).toBe(false);
  });

  it("BB defense vs BTN is wide", () => {
    const ctx = classify({ heroPosition: "bb", openerPosition: "btn" });
    const range = resolveHeroRange(ctx);
    expect(range.has("AA")).toBe(true);
    expect(range.has("76s")).toBe(true); // BB defends wide vs BTN
    expect(range.size).toBeGreaterThan(40);
  });

  it("BB defense vs UTG is tight", () => {
    const ctx = classify({ heroPosition: "bb", openerPosition: "utg" });
    const range = resolveHeroRange(ctx);
    expect(range.has("AA")).toBe(true);
    expect(range.size).toBeLessThan(40); // tighter vs UTG
  });

  it("BB vs SB uses BvB data", () => {
    const ctx = classify({ heroPosition: "bb", openerPosition: "sb" });
    const range = resolveHeroRange(ctx);
    expect(range.has("AA")).toBe(true);
    expect(range.size).toBeGreaterThan(30);
  });

  // ── New situation ranges ──

  it("facing_limpers: iso-raise range for BTN", () => {
    const ctx = classify({ heroPosition: "btn", numLimpers: 1 });
    expect(ctx.id).toBe("facing_limpers");
    const heroRange = resolveHeroRange(ctx);
    expect(heroRange.has("AA")).toBe(true);
    expect(heroRange.has("KQs")).toBe(true);
    expect(heroRange.size).toBeGreaterThan(20); // BTN iso-raises wide
    const oppRange = resolveOpponentRange(ctx)!;
    expect(oppRange).not.toBeNull();
    expect(oppRange.size).toBeGreaterThan(30); // limper range is wide
  });

  it("bb_vs_limpers: raise range narrows with more limpers", () => {
    const ctx1 = classify({ heroPosition: "bb", numLimpers: 1 });
    const ctx3 = classify({ heroPosition: "bb", numLimpers: 3 });
    const range1 = resolveHeroRange(ctx1);
    const range3 = resolveHeroRange(ctx3);
    expect(range1.has("AA")).toBe(true);
    expect(range3.has("AA")).toBe(true);
    expect(range3.size).toBeLessThan(range1.size); // tighter vs more limpers
  });

  it("bb_vs_sb_complete: BB raises wide, SB range is capped", () => {
    const ctx = classify({ heroPosition: "bb", numLimpers: 1, isSBComplete: true });
    expect(ctx.id).toBe("bb_vs_sb_complete");
    const heroRange = resolveHeroRange(ctx);
    expect(heroRange.has("AA")).toBe(true);
    expect(heroRange.has("T9s")).toBe(true); // bluff raises
    expect(heroRange.size).toBeGreaterThan(25);
    const oppRange = resolveOpponentRange(ctx)!;
    expect(oppRange).not.toBeNull();
    expect(oppRange.has("AA")).toBe(false); // SB range is capped — no premiums
    expect(oppRange.has("76s")).toBe(true); // speculative hands
  });
});

// ═══════════════════════════════════════════════════════
// Action Classification (R/C/F)
// ═══════════════════════════════════════════════════════

describe("classifyAction", () => {
  it("F when not in hero range", () => {
    expect(classifyAction(0.55, false, "clear_fold", 3, 4.5, "facing_open")).toBe("F");
  });

  it("R for clear_raise (AA)", () => {
    expect(classifyAction(0.85, true, "clear_raise", 3, 4.5, "facing_open")).toBe("R");
  });

  it("R for raise (ATs in range)", () => {
    expect(classifyAction(0.63, true, "raise", 3, 4.5, "facing_open")).toBe("R");
  });

  it("C for mixed_raise (majority action is call)", () => {
    expect(classifyAction(0.53, true, "mixed_raise", 3, 4.5, "facing_open")).toBe("C");
  });

  it("C for call (BB defense)", () => {
    expect(classifyAction(0.45, true, "call", 3, 4.5, "facing_open")).toBe("C");
  });

  it("F for borderline in RFI (not strong enough to open)", () => {
    expect(classifyAction(0.50, true, "borderline", 0, 1.5, "rfi")).toBe("F");
  });

  it("C for borderline facing bet with equity > pot odds", () => {
    // 55% equity, facing 3BB into 4.5BB. potOdds = 3/7.5 = 0.40. equity > 0.45 → C
    expect(classifyAction(0.55, true, "borderline", 3, 4.5, "facing_open")).toBe("C");
  });

  it("F for borderline facing bet with equity < pot odds", () => {
    // 35% equity, facing 10BB into 11.5BB. potOdds = 10/21.5 = 0.465. equity < 0.515 → F
    expect(classifyAction(0.35, true, "borderline", 10, 11.5, "facing_open")).toBe("F");
  });

  it("F for clear_fold", () => {
    expect(classifyAction(0.30, true, "clear_fold", 3, 4.5, "facing_open")).toBe("F");
  });
});

describe("BB call cost adjustment", () => {
  it("BB facing 3BB open pays 2BB (already posted 1BB)", () => {
    const result = computePreflopHandGrid({
      heroCards: [48 as CardIndex, 45 as CardIndex], // AKo
      heroPosition: "bb",
      openerPosition: "utg",
      openerSizingBB: 3,
    }, 10);
    // Pot = 1.5 + 3 = 4.5BB. BB call cost = 3 - 1 = 2BB.
    // potOdds = 2 / (4.5 + 2) = 2/6.5 = 0.308
    expect(result.potSizeBB).toBe(4.5);
    // AKo in BB defense range → should NOT be F
    const hero = result.cells.find(c => c.isHero)!;
    expect(hero.action).not.toBe("F");
  });

  it("SB facing 3BB open pays 2.5BB (already posted 0.5BB)", () => {
    const result = computePreflopHandGrid({
      heroCards: [48 as CardIndex, 45 as CardIndex],
      heroPosition: "sb",
      openerPosition: "utg",
      openerSizingBB: 3,
    }, 10);
    // SB call cost = 3 - 0.5 = 2.5BB
    expect(result.potSizeBB).toBe(4.5);
  });

  it("BTN facing 3BB open pays full 3BB", () => {
    const result = computePreflopHandGrid({
      heroCards: [48 as CardIndex, 45 as CardIndex],
      heroPosition: "btn",
      openerPosition: "utg",
      openerSizingBB: 3,
    }, 10);
    expect(result.potSizeBB).toBe(4.5);
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

// ═══════════════════════════════════════════════════════
// STACK DEPTH COMPRESSION
// ═══════════════════════════════════════════════════════

describe("compressRangeByStack", () => {
  const fullRange = new Set(["AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "66",
    "AKs", "AQs", "AJs", "ATs", "AKo", "AQo", "AJo",
    "KQs", "KJs", "KTs", "QJs", "QTs", "JTs", "T9s", "98s", "87s", "76s", "65s", "A5s", "A4s"]);

  it("no compression at 100BB", () => {
    const result = compressRangeByStack(fullRange, 100);
    expect(result.size).toBe(fullRange.size);
  });

  it("no compression at 80BB", () => {
    const result = compressRangeByStack(fullRange, 80);
    expect(result.size).toBe(fullRange.size);
  });

  it("removes some hands at 40BB", () => {
    const result = compressRangeByStack(fullRange, 40);
    expect(result.size).toBeLessThan(fullRange.size);
    expect(result.size).toBeGreaterThan(fullRange.size * 0.5);
    // Premiums always survive
    expect(result.has("AA")).toBe(true);
    expect(result.has("KK")).toBe(true);
  });

  it("removes more hands at 20BB", () => {
    const at40 = compressRangeByStack(fullRange, 40);
    const at20 = compressRangeByStack(fullRange, 20);
    expect(at20.size).toBeLessThan(at40.size);
    // Still has premiums
    expect(at20.has("AA")).toBe(true);
  });

  it("keeps at least top hands at 10BB", () => {
    const result = compressRangeByStack(fullRange, 10);
    expect(result.size).toBeGreaterThan(0);
    expect(result.has("AA")).toBe(true);
    expect(result.has("KK")).toBe(true);
    // Suited connectors dropped
    expect(result.has("65s")).toBe(false);
  });

  it("opponent range shrinks at short stacks", () => {
    const ctx = classify({ heroPosition: "btn", openerPosition: "utg" });
    const deep = resolveOpponentRange(ctx, 100)!;
    const shallow = resolveOpponentRange(ctx, 30)!;
    expect(shallow.size).toBeLessThan(deep.size);
    expect(shallow.has("AA")).toBe(true);
  });

  it("hero continue range shrinks at short stacks", () => {
    const ctx = classify({ heroPosition: "btn", openerPosition: "utg" });
    const deep = resolveHeroRange(ctx, 100);
    const shallow = resolveHeroRange(ctx, 30);
    expect(shallow.size).toBeLessThan(deep.size);
    expect(shallow.has("AA")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════
// POSITION NORMALIZATION (7+ players)
// ═══════════════════════════════════════════════════════

describe("normalize6Max", () => {
  it("passes through 6-max positions", () => {
    expect(normalize6Max("utg")).toBe("utg");
    expect(normalize6Max("hj")).toBe("hj");
    expect(normalize6Max("co")).toBe("co");
    expect(normalize6Max("btn")).toBe("btn");
    expect(normalize6Max("sb")).toBe("sb");
    expect(normalize6Max("bb")).toBe("bb");
  });

  it("maps 7+ player positions to 6-max equivalents", () => {
    expect(normalize6Max("utg1")).toBe("utg");
    expect(normalize6Max("utg2")).toBe("utg");
    expect(normalize6Max("mp")).toBe("hj");
    expect(normalize6Max("mp1")).toBe("hj");
  });

  it("opponent range works for mp position", () => {
    const ctx = classify({ heroPosition: "btn", openerPosition: "mp" as Position });
    const range = resolveOpponentRange(ctx, 100)!;
    expect(range).not.toBeNull();
    expect(range.has("AA")).toBe(true);
    // mp normalizes to hj, so range should be ~19%
    expect(range.size).toBeGreaterThan(20);
  });
});

// ═══════════════════════════════════════════════════════
// RAISE SIZING ADJUSTMENT
// ═══════════════════════════════════════════════════════

describe("raise sizing adjustment", () => {
  it("standard sizing (3BB) does not compress opponent range", () => {
    const ctx = classify({ heroPosition: "btn", openerPosition: "co" });
    const standard = resolveOpponentRange(ctx, 100, 3)!;
    const noSize = resolveOpponentRange(ctx, 100, 0)!;
    expect(standard.size).toBe(noSize.size);
  });

  it("large sizing (6BB) compresses opponent range", () => {
    const ctx = classify({ heroPosition: "btn", openerPosition: "co" });
    const standard = resolveOpponentRange(ctx, 100, 3)!;
    const large = resolveOpponentRange(ctx, 100, 6)!;
    expect(large.size).toBeLessThan(standard.size);
    expect(large.has("AA")).toBe(true);
  });

  it("very large sizing (10BB) compresses more", () => {
    const ctx = classify({ heroPosition: "btn", openerPosition: "co" });
    const at6 = resolveOpponentRange(ctx, 100, 6)!;
    const at10 = resolveOpponentRange(ctx, 100, 10)!;
    expect(at10.size).toBeLessThan(at6.size);
  });
});

// ═══════════════════════════════════════════════════════
// MULTIWAY CALLERS
// ═══════════════════════════════════════════════════════

describe("multiway callers", () => {
  it("hero continue range tightens with callers", () => {
    const ctxHeads = classify({ heroPosition: "btn", openerPosition: "utg", numCallers: 0 });
    const ctxMulti = classify({ heroPosition: "btn", openerPosition: "utg", numCallers: 2 });
    const headsUp = resolveHeroRange(ctxHeads, 100);
    const multiway = resolveHeroRange(ctxMulti, 100);
    expect(multiway.size).toBeLessThan(headsUp.size);
    expect(multiway.has("AA")).toBe(true);
  });

  it("pot size increases with callers", () => {
    const blinds = { sb: 0.5, bb: 1 };
    const headsUp = computePotAtAction(blinds, 3, 0, false, null);
    const oneCall = computePotAtAction(blinds, 3, 1, false, null);
    const twoCalls = computePotAtAction(blinds, 3, 2, false, null);
    expect(oneCall).toBeGreaterThan(headsUp);
    expect(twoCalls).toBeGreaterThan(oneCall);
  });
});

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

  it("facing an open produces R/C/F action classifications", () => {
    const result = computePreflopHandGrid({
      heroCards: [48 as CardIndex, 45 as CardIndex],
      heroPosition: "btn",
      openerPosition: "utg",
      openerSizingBB: 3,
    }, 150);
    // AKo should be R (raise/3-bet) facing UTG open — strong hand in range
    const heroCell = result.cells.find(c => c.isHero)!;
    expect(heroCell.action).toBe("R");
    expect(heroCell.inHeroRange).toBe(true);

    // 72o should be F
    const junk = result.cells.find(c => c.handClass === "72o")!;
    expect(junk.action).toBe("F");
    expect(junk.inHeroRange).toBe(false);
  });

  it("RFI produces R/F action classifications (no C in opening)", () => {
    const result = computePreflopHandGrid({
      heroCards: [48 as CardIndex, 45 as CardIndex],
      heroPosition: "btn",
    });
    const heroCell = result.cells.find(c => c.isHero)!;
    // AKo from BTN RFI — should be R (open-raise)
    expect(heroCell.action).toBe("R");
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
