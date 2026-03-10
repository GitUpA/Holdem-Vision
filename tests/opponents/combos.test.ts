import { describe, it, expect } from "vitest";
import {
  allHandClasses,
  combosForHandClass,
  comboToCards,
  cardsToCombo,
  comboToHandClass,
  rangeFromHandClasses,
  topPercentRange,
  rangePct,
  HAND_STRENGTH_ORDER,
} from "../../convex/lib/opponents/combos";
import { cardFromString } from "../../convex/lib/primitives/card";

describe("allHandClasses", () => {
  it("returns 169 unique hand classes", () => {
    const classes = allHandClasses();
    expect(classes.length).toBe(169);
    expect(new Set(classes).size).toBe(169);
  });

  it("includes pairs, suited, and offsuit", () => {
    const classes = allHandClasses();
    expect(classes).toContain("AA");
    expect(classes).toContain("22");
    expect(classes).toContain("AKs");
    expect(classes).toContain("AKo");
    expect(classes).toContain("32s");
    expect(classes).toContain("32o");
  });
});

describe("combosForHandClass", () => {
  it("returns 6 combos for a pair", () => {
    const combos = combosForHandClass("AA");
    expect(combos.length).toBe(6);
    // All combos should contain two A's with different suits
    for (const c of combos) {
      expect(c[0]).toBe("A");
      expect(c[2]).toBe("A");
      expect(c[1]).not.toBe(c[3]); // different suits
    }
  });

  it("returns 4 combos for a suited hand", () => {
    const combos = combosForHandClass("AKs");
    expect(combos.length).toBe(4);
    for (const c of combos) {
      expect(c[1]).toBe(c[3]); // same suit
    }
  });

  it("returns 12 combos for an offsuit hand", () => {
    const combos = combosForHandClass("AKo");
    expect(combos.length).toBe(12);
    for (const c of combos) {
      expect(c[1]).not.toBe(c[3]); // different suits
    }
  });
});

describe("comboToCards", () => {
  it("converts combo string to card indices", () => {
    const [c1, c2] = comboToCards("AhKs");
    expect(c1).toBe(cardFromString("Ah"));
    expect(c2).toBe(cardFromString("Ks"));
  });
});

describe("cardsToCombo", () => {
  it("normalizes higher rank first", () => {
    const ah = cardFromString("Ah");
    const ks = cardFromString("Ks");
    expect(cardsToCombo(ks, ah)).toBe("AhKs");
    expect(cardsToCombo(ah, ks)).toBe("AhKs");
  });
});

describe("comboToHandClass", () => {
  it("identifies suited hand", () => {
    expect(comboToHandClass("AhKh")).toBe("AKs");
  });

  it("identifies offsuit hand", () => {
    expect(comboToHandClass("AhKd")).toBe("AKo");
  });

  it("identifies pair", () => {
    expect(comboToHandClass("AhAs")).toBe("AA");
  });
});

describe("rangeFromHandClasses", () => {
  it("builds a range excluding known cards", () => {
    const ah = cardFromString("Ah");
    const ks = cardFromString("Ks");
    const range = rangeFromHandClasses(["AA"], 1.0, [ah, ks]);
    // AA has 6 combos, but Ah is known so combos containing Ah are excluded
    // That's 3 combos with Ah removed
    for (const [combo] of range) {
      const [c1, c2] = comboToCards(combo);
      expect(c1).not.toBe(ah);
      expect(c2).not.toBe(ah);
      expect(c1).not.toBe(ks);
      expect(c2).not.toBe(ks);
    }
  });
});

describe("topPercentRange", () => {
  it("top 1% is very small", () => {
    const range = topPercentRange(1);
    const pct = rangePct(range);
    expect(pct).toBeLessThan(5);
    expect(range.size).toBeGreaterThan(0);
  });

  it("top 50% includes many combos", () => {
    const range = topPercentRange(50);
    expect(range.size).toBeGreaterThan(200);
  });

  it("excludes known cards", () => {
    const ah = cardFromString("Ah");
    const as = cardFromString("As");
    const range = topPercentRange(100, [ah, as]);
    for (const [combo] of range) {
      const [c1, c2] = comboToCards(combo);
      expect(c1).not.toBe(ah);
      expect(c2).not.toBe(ah);
      expect(c1).not.toBe(as);
      expect(c2).not.toBe(as);
    }
  });
});

describe("HAND_STRENGTH_ORDER", () => {
  it("starts with AA", () => {
    expect(HAND_STRENGTH_ORDER[0]).toBe("AA");
  });

  it("has AA, KK, QQ in top 5", () => {
    expect(HAND_STRENGTH_ORDER.indexOf("AA")).toBeLessThan(5);
    expect(HAND_STRENGTH_ORDER.indexOf("KK")).toBeLessThan(5);
    expect(HAND_STRENGTH_ORDER.indexOf("QQ")).toBeLessThan(5);
  });
});
