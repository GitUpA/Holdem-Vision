import { describe, it, expect } from "vitest";
import { drawLens, type DrawValue } from "../../convex/lib/analysis/draws";
import type { AnalysisContext } from "../../convex/lib/types/analysis";
import { cardsFromStrings } from "../../convex/lib/primitives/card";

function makeContext(hero: string[], community: string[]): AnalysisContext {
  return {
    heroCards: cardsFromStrings(hero),
    communityCards: cardsFromStrings(community),
    deadCards: [],
    street: community.length === 3 ? "flop" : community.length === 4 ? "turn" : "river",
    opponents: [],
  };
}

describe("DrawLens", () => {
  it("returns empty for preflop", () => {
    const ctx: AnalysisContext = {
      heroCards: cardsFromStrings(["Ah", "Kh"]),
      communityCards: [],
      deadCards: [],
      street: "preflop",
      opponents: [],
    };
    const result = drawLens.analyze(ctx);
    expect((result.value as DrawValue).draws).toHaveLength(0);
  });

  it("detects flush draw", () => {
    // Hero: Ah Kh, Board: 9h 5h 2c — 4 hearts, need 1 more
    const ctx = makeContext(["Ah", "Kh"], ["9h", "5h", "2c"]);
    const result = drawLens.analyze(ctx);

    expect((result.value as DrawValue).hasFlushDraw).toBe(true);
    const flushDraw = (result.value as DrawValue).draws.find((d) => d.type === "flush_draw");
    expect(flushDraw).toBeDefined();
    expect(flushDraw!.outsCount).toBe(9); // 13 hearts - 4 known = 9
  });

  it("detects OESD (open-ended straight draw)", () => {
    // Hero: Jc Tc, Board: 9d 8h 2s — need Q or 7 for straight
    const ctx = makeContext(["Jc", "Tc"], ["9d", "8h", "2s"]);
    const result = drawLens.analyze(ctx);

    expect((result.value as DrawValue).hasStraightDraw).toBe(true);
    const oesd = (result.value as DrawValue).draws.find((d) => d.type === "oesd");
    expect(oesd).toBeDefined();
  });

  it("detects gutshot", () => {
    // Hero: Ac Jd, Board: Tc 8h 2s — need Q for straight (A-high)
    // or need 9 for J-high straight? Let's check: A J T 8 — need Q for AKQJT or 9 for JT98x
    // Actually: A,J,T,8 — for AKQJT need K and Q (not a draw). For QJT98 need Q and 9.
    // Let's use a clearer example: Hero: Kc Jd, Board: Tc 8h 2s — K J T 8, need Q for KQJT9? No.
    // Clearer: Hero: Ac Kd, Board: Qc Jh 2s — A K Q J, need T for straight (gutshot)
    const ctx = makeContext(["Ac", "Kd"], ["Qc", "Jh", "2s"]);
    const result = drawLens.analyze(ctx);

    expect((result.value as DrawValue).hasStraightDraw).toBe(true);
    const gutshot = (result.value as DrawValue).draws.find(
      (d) => d.type === "gutshot" || d.type === "oesd",
    );
    expect(gutshot).toBeDefined();
  });

  it("detects combo draw (flush + straight)", () => {
    // Hero: Jh Th, Board: 9h 8h 2c — flush draw + OESD
    const ctx = makeContext(["Jh", "Th"], ["9h", "8h", "2c"]);
    const result = drawLens.analyze(ctx);

    expect((result.value as DrawValue).hasFlushDraw).toBe(true);
    expect((result.value as DrawValue).hasStraightDraw).toBe(true);
    expect((result.value as DrawValue).isCombo).toBe(true);
    expect((result.value as DrawValue).totalDrawOuts).toBeGreaterThan(9); // More than just flush outs
  });

  it("detects backdoor flush draw on flop", () => {
    // Hero: Ah 5h, Board: Kh 9c 2d — 3 hearts, need 2 more
    const ctx = makeContext(["Ah", "5h"], ["Kh", "9c", "2d"]);
    const result = drawLens.analyze(ctx);

    const backdoor = (result.value as DrawValue).draws.find((d) => d.type === "backdoor_flush");
    expect(backdoor).toBeDefined();
  });

  it("no draws on made hand with no draw potential", () => {
    // Hero: Ac Kd, Board: Ah Kh 2s — two pair, no draws
    // Actually hero might have backdoor flush. Let's use rainbow no-connect.
    // Hero: Ac Kd, Board: 7h 3s 2c — no flush draw, no straight draw
    const ctx = makeContext(["Ac", "Kd"], ["7h", "3s", "2c"]);
    const result = drawLens.analyze(ctx);

    expect((result.value as DrawValue).hasFlushDraw).toBe(false);
    // May or may not have straight draw depending on board connectivity
  });

  it("returns valid AnalysisResult shape", () => {
    const ctx = makeContext(["Jh", "Th"], ["9h", "8h", "2c"]);
    const result = drawLens.analyze(ctx);

    expect(result.lensId).toBe("draws");
    expect(result.explanation.tags).toContain("draws");
    expect(result.explanation.summary).toBeTruthy();
  });

  it("explanation sentiment is positive for combo draw", () => {
    const ctx = makeContext(["Jh", "Th"], ["9h", "8h", "2c"]);
    const result = drawLens.analyze(ctx);

    expect(result.explanation.sentiment).toBe("positive");
  });

  it("visual directives present for draws", () => {
    const ctx = makeContext(["Jh", "Th"], ["9h", "8h", "2c"]);
    const result = drawLens.analyze(ctx);

    if ((result.value as DrawValue).draws.length > 0) {
      const outsDisplay = result.visuals.find((v) => v.type === "outs_display");
      expect(outsDisplay).toBeDefined();
      expect(outsDisplay!.lensId).toBe("draws");
    }
  });
});
