import { describe, it, expect } from "vitest";
import {
  registerEngine,
  getEngine,
  getAllEngines,
  getEngineOrDefault,
} from "../../../convex/lib/opponents/engines/engineRegistry";
// Importing basicEngine triggers self-registration
import "../../../convex/lib/opponents/engines/basicEngine";
import "../../../convex/lib/opponents/engines/rangeAwareEngine";

describe("engineRegistry", () => {
  it("basic engine is registered", () => {
    const engine = getEngine("basic");
    expect(engine).toBeDefined();
    expect(engine!.id).toBe("basic");
  });

  it("range-aware engine is registered", () => {
    const engine = getEngine("range-aware");
    expect(engine).toBeDefined();
    expect(engine!.id).toBe("range-aware");
  });

  it("getAllEngines returns all registered engines", () => {
    const all = getAllEngines();
    expect(all.length).toBeGreaterThanOrEqual(2);
    const ids = all.map((e) => e.id);
    expect(ids).toContain("basic");
    expect(ids).toContain("range-aware");
  });

  it("getEngineOrDefault returns basic when id is undefined", () => {
    const engine = getEngineOrDefault(undefined);
    expect(engine.id).toBe("basic");
  });

  it("getEngineOrDefault returns basic when id is unknown", () => {
    const engine = getEngineOrDefault("nonexistent");
    expect(engine.id).toBe("basic");
  });

  it("getEngineOrDefault returns requested engine when it exists", () => {
    const engine = getEngineOrDefault("range-aware");
    expect(engine.id).toBe("range-aware");
  });
});
