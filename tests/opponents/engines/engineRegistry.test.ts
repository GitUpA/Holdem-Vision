import { describe, it, expect } from "vitest";
import {
  getEngine,
  getAllEngines,
  getEngineOrDefault,
} from "../../../convex/lib/opponents/engines/engineRegistry";
// Importing modifiedGtoEngine triggers self-registration
import "../../../convex/lib/opponents/engines/modifiedGtoEngine";

describe("engineRegistry", () => {
  it("modified-gto engine is registered", () => {
    const engine = getEngine("modified-gto");
    expect(engine).toBeDefined();
    expect(engine!.id).toBe("modified-gto");
  });

  it("getAllEngines returns registered engines", () => {
    const all = getAllEngines();
    expect(all.length).toBeGreaterThanOrEqual(1);
    const ids = all.map((e) => e.id);
    expect(ids).toContain("modified-gto");
  });

  it("getEngineOrDefault returns modified-gto when id is undefined", () => {
    const engine = getEngineOrDefault(undefined);
    expect(engine.id).toBe("modified-gto");
  });

  it("getEngineOrDefault returns modified-gto when id is unknown", () => {
    const engine = getEngineOrDefault("nonexistent");
    expect(engine.id).toBe("modified-gto");
  });

  it("getEngineOrDefault returns requested engine when it exists", () => {
    const engine = getEngineOrDefault("modified-gto");
    expect(engine.id).toBe("modified-gto");
  });
});
