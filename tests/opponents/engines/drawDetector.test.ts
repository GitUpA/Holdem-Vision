import { describe, it, expect } from "vitest";
import { detectDraws } from "../../../convex/lib/opponents/engines/drawDetector";
import type { CardIndex } from "../../../convex/lib/types/cards";

/**
 * Card encoding: index = rank * 4 + suit
 *   rank: 0=2, 1=3, ..., 8=T, 9=J, 10=Q, 11=K, 12=A
 *   suit: 0=clubs, 1=diamonds, 2=hearts, 3=spades
 *
 * Helpers:
 *   card(rank, suit): e.g., card(12, 3) = A♠ = 51
 */
function card(rank: number, suit: number): CardIndex {
  return rank * 4 + suit;
}

// Named cards for readability
const _2c = card(0, 0), _2d = card(0, 1), _2h = card(0, 2), _2s = card(0, 3);
const _3c = card(1, 0), _3d = card(1, 1), _3h = card(1, 2), _3s = card(1, 3);
const _4c = card(2, 0), _4d = card(2, 1), _4h = card(2, 2), _4s = card(2, 3);
const _5c = card(3, 0), _5d = card(3, 1), _5h = card(3, 2), _5s = card(3, 3);
const _6c = card(4, 0), _6d = card(4, 1), _6h = card(4, 2);
const _7c = card(5, 0), _7d = card(5, 1), _7h = card(5, 2);
const _8c = card(6, 0), _8d = card(6, 1), _8h = card(6, 2);
const _9c = card(7, 0), _9d = card(7, 1), _9h = card(7, 2);
const _Tc = card(8, 0), _Td = card(8, 1), _Th = card(8, 2);
const _Jc = card(9, 0), _Jd = card(9, 1), _Jh = card(9, 2);
const _Qh = card(10, 2), _Qs = card(10, 3);
const _Kh = card(11, 2), _Ks = card(11, 3);
const _Ah = card(12, 2), _As = card(12, 3), _Ac = card(12, 0), _Ad = card(12, 1);

describe("detectDraws", () => {
  it("returns empty for insufficient cards", () => {
    const result = detectDraws([_Ah, _Ks], []);
    expect(result.bestDrawType).toBe("none");
    expect(result.totalOuts).toBe(0);
  });

  it("detects no draw on dry rainbow board", () => {
    // Hero: A♠ K♠, Board: 2♣ 7♦ J♥ — rainbow, no connectivity
    const result = detectDraws([_As, _Ks], [_2c, _7d, _Jh]);
    expect(result.hasFlushDraw).toBe(false);
    expect(result.hasStraightDraw).toBe(false);
    expect(result.isCombo).toBe(false);
    expect(result.totalOuts).toBe(0);
    expect(result.bestDrawType).toBe("none");
  });

  it("detects flush draw (4 of suit, hero contributes)", () => {
    // Hero: A♥ K♥, Board: 2♥ 7♥ J♣ — 4 hearts
    const result = detectDraws([_Ah, _Kh], [_2h, _7h, _Jc]);
    expect(result.hasFlushDraw).toBe(true);
    expect(result.flushOuts).toBe(9);
    expect(result.bestDrawType).toBe("flush_draw");
  });

  it("requires hero to contribute to flush draw", () => {
    // Hero: A♠ K♠, Board: 2♥ 7♥ J♥ 9♥ — 4 hearts but hero has none
    const result = detectDraws([_As, _Ks], [_2h, _7h, _Jh, _9h]);
    expect(result.hasFlushDraw).toBe(false);
    expect(result.flushOuts).toBe(0);
  });

  it("detects OESD (open-ended straight draw)", () => {
    // Hero: 8♣ 9♣, Board: T♦ J♥ 2♠ — need 7 or Q for straight (OESD)
    const result = detectDraws([_8c, _9c], [_Td, _Jh, _2s]);
    expect(result.hasStraightDraw).toBe(true);
    expect(result.straightOuts).toBe(8);
    expect(result.bestDrawType).toBe("oesd");
  });

  it("detects gutshot straight draw", () => {
    // Hero: 8♣ T♦, Board: J♥ Q♠ 2♣ — need 9 only for straight (gutshot)
    const result = detectDraws([_8c, _Td], [_Jh, _Qs, _2c]);
    expect(result.hasStraightDraw).toBe(true);
    expect(result.straightOuts).toBe(4);
    expect(result.bestDrawType).toBe("gutshot");
  });

  it("detects combo draw (flush + straight)", () => {
    // Hero: 8♥ 9♥, Board: T♥ J♥ 2♣ — flush draw + OESD
    const result = detectDraws([_8h, _9h], [_Th, _Jh, _2c]);
    expect(result.hasFlushDraw).toBe(true);
    expect(result.hasStraightDraw).toBe(true);
    expect(result.isCombo).toBe(true);
    expect(result.bestDrawType).toBe("combo");
    // 9 flush + 8 straight - ~2 overlap = ~15
    expect(result.totalOuts).toBeGreaterThanOrEqual(13);
    expect(result.totalOuts).toBeLessThanOrEqual(17);
  });

  it("detects backdoor flush draw on flop", () => {
    // Hero: A♥ K♠, Board: 2♥ 7♥ J♣ — only 3 hearts (with hero), no flush draw
    // Actually hero has A♥ so 3 hearts total: A♥ + 2♥ 7♥ = 3 hearts → backdoor
    // Wait, that's only 3 hearts: A♥, 2♥, 7♥ → backdoor flush
    const result = detectDraws([_Ah, _Ks], [_2h, _7h, _Jc]);
    expect(result.hasFlushDraw).toBe(false);
    expect(result.hasBackdoorFlush).toBe(true);
    expect(result.bestDrawType).toBe("backdoor_flush");
  });

  it("does not report backdoor flush on turn", () => {
    // Hero: A♥ K♠, Board: 2♥ 7♥ J♣ 4♠ — 4 community cards = turn
    const result = detectDraws([_Ah, _Ks], [_2h, _7h, _Jc, _4s]);
    expect(result.hasBackdoorFlush).toBe(false);
  });

  it("prefers OESD over gutshot when both exist", () => {
    // Hero: 7♣ 8♣, Board: 9♦ T♥ 3♠ — 7-8-9-T is OESD (need 6 or J)
    const result = detectDraws([_7c, _8c], [_9d, _Th, _3s]);
    expect(result.hasStraightDraw).toBe(true);
    expect(result.straightOuts).toBe(8);
    expect(result.bestDrawType).toBe("oesd");
  });

  it("detects wheel draw (A-2-3-4-5)", () => {
    // Hero: A♣ 2♦, Board: 3♥ 4♠ 9♣ — need 5 for wheel (gutshot)
    const result = detectDraws([_Ac, _2d], [_3h, _4s, _9c]);
    expect(result.hasStraightDraw).toBe(true);
    expect(result.straightOuts).toBe(4); // gutshot
  });

  it("flush draw on turn still works", () => {
    // Hero: A♥ K♥, Board: 2♥ 7♥ J♣ T♠ — still 4 hearts
    const result = detectDraws([_Ah, _Kh], [_2h, _7h, _Jc, _Tc]);
    expect(result.hasFlushDraw).toBe(true);
    expect(result.flushOuts).toBe(9);
  });
});
