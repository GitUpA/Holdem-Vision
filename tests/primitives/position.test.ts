import { describe, it, expect } from "vitest";
import {
  positionsForTableSize,
  seatToPositionMap,
  positionForSeat,
  positionRangeMultiplier,
  isEarlyPosition,
  isLatePosition,
  isMiddlePosition,
  isBlindPosition,
  positionDisplayName,
} from "../../convex/lib/primitives/position";

describe("positionsForTableSize", () => {
  it("returns 2 positions for heads-up", () => {
    const pos = positionsForTableSize(2);
    expect(pos).toEqual(["btn", "bb"]);
  });

  it("returns 3 positions for 3-player", () => {
    const pos = positionsForTableSize(3);
    expect(pos).toEqual(["btn", "sb", "bb"]);
  });

  it("returns 6 positions for 6-max", () => {
    const pos = positionsForTableSize(6);
    expect(pos).toHaveLength(6);
    expect(pos).toContain("btn");
    expect(pos).toContain("sb");
    expect(pos).toContain("bb");
    expect(pos).toContain("utg");
    expect(pos).toContain("hj");
    expect(pos).toContain("co");
  });

  it("returns 9 positions for 9-max", () => {
    const pos = positionsForTableSize(9);
    expect(pos).toHaveLength(9);
    expect(pos).toContain("utg2");
  });

  it("returns 10 positions for full ring", () => {
    const pos = positionsForTableSize(10);
    expect(pos).toHaveLength(10);
    expect(pos).toContain("mp1");
  });

  it("always starts with btn", () => {
    for (let n = 2; n <= 10; n++) {
      expect(positionsForTableSize(n)[0]).toBe("btn");
    }
  });

  it("always includes bb for 3+ players after sb", () => {
    for (let n = 3; n <= 10; n++) {
      const pos = positionsForTableSize(n);
      expect(pos[1]).toBe("sb");
      expect(pos[2]).toBe("bb");
    }
  });

  it("throws for invalid table sizes", () => {
    expect(() => positionsForTableSize(0)).toThrow();
    expect(() => positionsForTableSize(1)).toThrow();
    expect(() => positionsForTableSize(11)).toThrow();
  });
});

describe("seatToPositionMap", () => {
  it("maps all seats to unique positions", () => {
    const map = seatToPositionMap(0, 6);
    expect(map.size).toBe(6);
    const positions = new Set(map.values());
    expect(positions.size).toBe(6);
  });

  it("dealer seat gets btn", () => {
    const map = seatToPositionMap(3, 6);
    expect(map.get(3)).toBe("btn");
  });

  it("seat after dealer gets sb (for 3+ players)", () => {
    const map = seatToPositionMap(0, 6);
    expect(map.get(0)).toBe("btn");
    expect(map.get(1)).toBe("sb");
    expect(map.get(2)).toBe("bb");
  });

  it("wraps around correctly", () => {
    const map = seatToPositionMap(4, 6);
    expect(map.get(4)).toBe("btn");
    expect(map.get(5)).toBe("sb");
    expect(map.get(0)).toBe("bb");
  });

  it("handles heads-up", () => {
    const map = seatToPositionMap(0, 2);
    expect(map.get(0)).toBe("btn");
    expect(map.get(1)).toBe("bb");
  });
});

describe("positionForSeat", () => {
  it("returns correct position for a given seat", () => {
    expect(positionForSeat(0, 0, 6)).toBe("btn");
    expect(positionForSeat(5, 0, 6)).toBe("co");
  });

  it("throws for invalid seat", () => {
    expect(() => positionForSeat(7, 0, 6)).toThrow();
  });
});

describe("positionRangeMultiplier", () => {
  it("UTG has lowest multiplier", () => {
    expect(positionRangeMultiplier("utg")).toBe(0.55);
  });

  it("BTN has highest multiplier", () => {
    expect(positionRangeMultiplier("btn")).toBe(1.40);
  });

  it("BB is baseline (1.0)", () => {
    expect(positionRangeMultiplier("bb")).toBe(1.0);
  });

  it("all multipliers are between 0.5 and 1.5", () => {
    const positions = ["utg", "utg1", "utg2", "mp", "mp1", "hj", "co", "btn", "sb", "bb"] as const;
    for (const pos of positions) {
      const m = positionRangeMultiplier(pos);
      expect(m).toBeGreaterThanOrEqual(0.5);
      expect(m).toBeLessThanOrEqual(1.5);
    }
  });

  it("early positions are below 1.0", () => {
    expect(positionRangeMultiplier("utg")).toBeLessThan(1.0);
    expect(positionRangeMultiplier("utg1")).toBeLessThan(1.0);
    expect(positionRangeMultiplier("utg2")).toBeLessThan(1.0);
  });

  it("late positions are above 1.0", () => {
    expect(positionRangeMultiplier("co")).toBeGreaterThan(1.0);
    expect(positionRangeMultiplier("btn")).toBeGreaterThan(1.0);
  });

  it("multipliers increase from early to late", () => {
    const order = ["utg", "utg1", "utg2", "mp", "mp1", "hj", "co", "btn"] as const;
    for (let i = 1; i < order.length; i++) {
      expect(positionRangeMultiplier(order[i])).toBeGreaterThan(
        positionRangeMultiplier(order[i - 1])
      );
    }
  });
});

describe("position classification", () => {
  it("identifies early positions", () => {
    expect(isEarlyPosition("utg")).toBe(true);
    expect(isEarlyPosition("utg1")).toBe(true);
    expect(isEarlyPosition("utg2")).toBe(true);
    expect(isEarlyPosition("btn")).toBe(false);
    expect(isEarlyPosition("bb")).toBe(false);
  });

  it("identifies late positions", () => {
    expect(isLatePosition("co")).toBe(true);
    expect(isLatePosition("btn")).toBe(true);
    expect(isLatePosition("utg")).toBe(false);
    expect(isLatePosition("bb")).toBe(false);
  });

  it("identifies middle positions", () => {
    expect(isMiddlePosition("mp")).toBe(true);
    expect(isMiddlePosition("hj")).toBe(true);
    expect(isMiddlePosition("utg")).toBe(false);
  });

  it("identifies blind positions", () => {
    expect(isBlindPosition("sb")).toBe(true);
    expect(isBlindPosition("bb")).toBe(true);
    expect(isBlindPosition("btn")).toBe(false);
  });
});

describe("positionDisplayName", () => {
  it("returns readable names", () => {
    expect(positionDisplayName("btn")).toBe("Button");
    expect(positionDisplayName("utg")).toBe("Under the Gun");
    expect(positionDisplayName("co")).toBe("Cutoff");
  });
});
