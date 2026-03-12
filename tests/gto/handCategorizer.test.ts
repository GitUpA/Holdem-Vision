import { describe, it, expect } from "vitest";
import {
  categorizeHand,
  closestCategory,
  categoryStrength,
  type HandCategory,
} from "../../convex/lib/gto/handCategorizer";
import { cardsFromStrings } from "../../convex/lib/primitives/card";

// ─── Helper ───

function classify(holeStr: string[], boardStr: string[]) {
  return categorizeHand(cardsFromStrings(holeStr), cardsFromStrings(boardStr));
}

// ═══════════════════════════════════════════════════════
// PREFLOP CLASSIFICATION
// ═══════════════════════════════════════════════════════

describe("Preflop Classification", () => {
  it("AA → premium_pair", () => {
    const r = classify(["As", "Ah"], []);
    expect(r.category).toBe("premium_pair");
    expect(r.subCategory).toBe("aces");
  });

  it("KK → premium_pair", () => {
    const r = classify(["Ks", "Kh"], []);
    expect(r.category).toBe("premium_pair");
    expect(r.subCategory).toBe("kings");
  });

  it("QQ → overpair (high pair preflop)", () => {
    const r = classify(["Qs", "Qh"], []);
    expect(r.category).toBe("overpair");
  });

  it("55 → middle_pair (low pocket pair)", () => {
    const r = classify(["5s", "5h"], []);
    expect(r.category).toBe("middle_pair");
  });

  it("AKs → overcards (broadway suited)", () => {
    const r = classify(["As", "Ks"], []);
    expect(r.category).toBe("overcards");
    expect(r.subCategory).toContain("broadway");
  });

  it("A5s → flush_draw (suited ace)", () => {
    const r = classify(["As", "5s"], []);
    expect(r.category).toBe("flush_draw");
    expect(r.subCategory).toBe("suited_ace");
  });

  it("87s → straight_draw (suited connector)", () => {
    const r = classify(["8s", "7s"], []);
    expect(r.category).toBe("straight_draw");
    expect(r.subCategory).toBe("suited_connector");
  });

  it("72o → air (junk)", () => {
    const r = classify(["7d", "2c"], []);
    expect(r.category).toBe("air");
  });
});

// ═══════════════════════════════════════════════════════
// POSTFLOP — MADE HANDS
// ═══════════════════════════════════════════════════════

describe("Postflop — Made Hands", () => {
  it("sets_plus — flopped set (pocket pair hits board)", () => {
    const r = classify(["8s", "8h"], ["8d", "Ks", "3c"]);
    expect(r.category).toBe("sets_plus");
    expect(r.subCategory).toBe("set");
  });

  it("sets_plus — flopped straight", () => {
    const r = classify(["9s", "Th"], ["Jd", "8s", "7c"]);
    expect(r.category).toBe("sets_plus");
  });

  it("sets_plus — flopped flush", () => {
    const r = classify(["As", "Ts"], ["Ks", "7s", "3s"]);
    expect(r.category).toBe("sets_plus");
  });

  it("sets_plus — trips (one card pairs board pair)", () => {
    const r = classify(["Ks", "Qh"], ["Kd", "Kc", "3s"]);
    expect(r.category).toBe("sets_plus");
    expect(r.subCategory).toBe("trips");
  });

  it("two_pair — hero contributes both pairs", () => {
    const r = classify(["As", "8h"], ["Ad", "8c", "3s"]);
    expect(r.category).toBe("two_pair");
  });

  it("overpair — pocket pair above board", () => {
    const r = classify(["Qs", "Qh"], ["Td", "7s", "3c"]);
    expect(r.category).toBe("overpair");
  });

  it("premium_pair — AA as overpair", () => {
    const r = classify(["As", "Ah"], ["Kd", "7s", "3c"]);
    expect(r.category).toBe("premium_pair");
  });

  it("top_pair_top_kicker — AK on K-high board", () => {
    const r = classify(["As", "Kh"], ["Kd", "7s", "3c"]);
    expect(r.category).toBe("top_pair_top_kicker");
  });

  it("top_pair_weak_kicker — K5 on K-high board", () => {
    const r = classify(["Ks", "5h"], ["Kd", "9s", "3c"]);
    expect(r.category).toBe("top_pair_weak_kicker");
  });

  it("middle_pair — hero pairs middle card", () => {
    const r = classify(["8s", "Ah"], ["Kd", "8c", "3s"]);
    expect(r.category).toBe("middle_pair");
  });

  it("middle_pair — pocket pair between top and bottom", () => {
    const r = classify(["8s", "8h"], ["Td", "5s", "3c"]);
    expect(r.category).toBe("middle_pair");
  });

  it("bottom_pair — hero pairs bottom card", () => {
    const r = classify(["3s", "Jh"], ["Kd", "8c", "3c"]);
    expect(r.category).toBe("bottom_pair");
  });

  it("bottom_pair — underpair (pocket pair below all board cards)", () => {
    const r = classify(["4s", "4h"], ["Td", "8s", "6c"]);
    expect(r.category).toBe("bottom_pair");
    expect(r.subCategory).toBe("underpair");
  });
});

// ═══════════════════════════════════════════════════════
// POSTFLOP — DRAWS
// ═══════════════════════════════════════════════════════

describe("Postflop — Draws", () => {
  it("flush_draw — 4 to a flush", () => {
    const r = classify(["As", "5s"], ["Ks", "7s", "3d"]);
    expect(r.category).toBe("flush_draw");
    expect(r.subCategory).toBe("nut_flush_draw");
  });

  it("flush_draw — non-nut", () => {
    const r = classify(["Ts", "5s"], ["Ks", "7s", "3d"]);
    expect(r.category).toBe("flush_draw");
    expect(r.subCategory).toBe("flush_draw");
  });

  it("straight_draw — OESD", () => {
    const r = classify(["9d", "8c"], ["7h", "6s", "2d"]);
    expect(r.category).toBe("straight_draw");
    expect(r.subCategory).toBe("oesd");
  });

  it("straight_draw — gutshot", () => {
    const r = classify(["9d", "5c"], ["8h", "7s", "2d"]);
    expect(r.category).toBe("straight_draw");
    expect(r.subCategory).toBe("gutshot");
  });

  it("combo_draw — flush + straight draw", () => {
    const r = classify(["Ts", "9s"], ["8s", "7d", "2s"]);
    expect(r.category).toBe("combo_draw");
    expect(r.relativeStrength).toBeGreaterThan(0.5);
  });

  it("weak_draw — backdoor flush only", () => {
    // Need: 3 community cards (flop), hero contributes to 3-flush, no other draw
    const r = classify(["2s", "3d"], ["Ks", "8s", "4h"]);
    // 2s + Ks + 8s = 3 spades on flop with hero contributing → backdoor flush
    // No straight draw (2,3,4,8,K — not connected enough for 4-card window)
    // Not overcards (2 and 3 < K)
    expect(r.category).toBe("weak_draw");
  });

  it("overcards — two cards above the board", () => {
    const r = classify(["As", "Kd"], ["Td", "7s", "3c"]);
    expect(r.category).toBe("overcards");
  });

  it("air — nothing", () => {
    const r = classify(["2d", "4c"], ["Ks", "Jh", "8s"]);
    expect(r.category).toBe("air");
  });
});

// ═══════════════════════════════════════════════════════
// BOARD-RELATIVE — same hand, different boards
// ═══════════════════════════════════════════════════════

describe("Board-Relative Classification", () => {
  it("TT is overpair on 9-high board, middle_pair on K-high board", () => {
    const overpair = classify(["Ts", "Th"], ["9d", "5s", "3c"]);
    const middlePair = classify(["Ts", "Th"], ["Kd", "Js", "3c"]);
    expect(overpair.category).toBe("overpair");
    expect(middlePair.category).toBe("middle_pair");
  });

  it("A8 is top pair on 8-high board, bottom pair on K-J-8 board", () => {
    const topPair = classify(["As", "8h"], ["8d", "5s", "3c"]);
    const bottomPair = classify(["As", "8h"], ["Kd", "Js", "8c"]);
    // On 8-5-3, A8 pairs the 8 which is top board card → top_pair_top_kicker (A kicker)
    expect(topPair.category).toBe("top_pair_top_kicker");
    // On K-J-8, A8 pairs the 8 which is bottom board card
    expect(bottomPair.category).toBe("bottom_pair");
  });

  it("AK is overcards on T-7-3, top_pair on K-7-3", () => {
    const overcards = classify(["As", "Kh"], ["Td", "7s", "3c"]);
    const topPair = classify(["As", "Kh"], ["Kd", "7s", "3c"]);
    expect(overcards.category).toBe("overcards");
    expect(topPair.category).toBe("top_pair_top_kicker");
  });
});

// ═══════════════════════════════════════════════════════
// STRENGTH ORDERING
// ═══════════════════════════════════════════════════════

describe("Category Strength Ordering", () => {
  it("sets_plus > two_pair > overpair > TPTK > TPWK > middle > bottom > air", () => {
    expect(categoryStrength("sets_plus")).toBeGreaterThan(categoryStrength("two_pair"));
    expect(categoryStrength("two_pair")).toBeGreaterThan(categoryStrength("overpair"));
    expect(categoryStrength("overpair")).toBeGreaterThan(categoryStrength("top_pair_top_kicker"));
    expect(categoryStrength("top_pair_top_kicker")).toBeGreaterThan(categoryStrength("top_pair_weak_kicker"));
    expect(categoryStrength("top_pair_weak_kicker")).toBeGreaterThan(categoryStrength("middle_pair"));
    expect(categoryStrength("middle_pair")).toBeGreaterThan(categoryStrength("bottom_pair"));
    expect(categoryStrength("bottom_pair")).toBeGreaterThan(categoryStrength("air"));
  });

  it("combo_draw sits between middle_pair and TPWK", () => {
    expect(categoryStrength("combo_draw")).toBeGreaterThan(categoryStrength("middle_pair"));
    expect(categoryStrength("combo_draw")).toBeLessThan(categoryStrength("top_pair_weak_kicker"));
  });
});

// ═══════════════════════════════════════════════════════
// closestCategory
// ═══════════════════════════════════════════════════════

describe("closestCategory", () => {
  it("returns exact match when available", () => {
    const available: HandCategory[] = ["air", "top_pair_top_kicker", "sets_plus"];
    expect(closestCategory("top_pair_top_kicker", available)).toBe("top_pair_top_kicker");
  });

  it("returns closest by strength when no exact match", () => {
    const available: HandCategory[] = ["air", "middle_pair", "sets_plus"];
    // top_pair_weak_kicker (0.6) → closest to middle_pair (0.45) or sets_plus (1.0)
    const result = closestCategory("top_pair_weak_kicker", available);
    expect(result).toBe("middle_pair");
  });

  it("maps overpair to closest available", () => {
    const available: HandCategory[] = ["top_pair_top_kicker", "middle_pair", "air"];
    // overpair (0.78) → closest to TPTK (0.7)
    expect(closestCategory("overpair", available)).toBe("top_pair_top_kicker");
  });
});
