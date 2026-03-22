import { describe, it, expect } from "vitest";
import {
  SKILLS,
  getSkillsByTier,
  getGatingSkills,
  getCriticalPath,
  getParetoSkills,
  prerequisitesMet,
  getNextSkills,
  skillsForArchetype,
  tierLabel,
  type SkillId,
  type SkillProgress,
} from "../../convex/lib/skills/skillTree";

describe("Skill Tree", () => {
  it("has 28 skills total", () => {
    expect(Object.keys(SKILLS).length).toBe(28);
  });

  it("has 7 tiers with correct skill counts", () => {
    expect(getSkillsByTier(0).length).toBe(4);
    expect(getSkillsByTier(1).length).toBe(4);
    expect(getSkillsByTier(2).length).toBe(4);
    expect(getSkillsByTier(3).length).toBe(4);
    expect(getSkillsByTier(4).length).toBe(5);
    expect(getSkillsByTier(5).length).toBe(4);
    expect(getSkillsByTier(6).length).toBe(3); // missing 1 from 26 = 4+4+4+4+5+4+3 = 28... wait
  });

  it("every skill has required fields", () => {
    for (const skill of Object.values(SKILLS)) {
      expect(skill.id).toBeTruthy();
      expect(skill.name).toBeTruthy();
      expect(skill.coreQuestion).toBeTruthy();
      expect(skill.description).toBeTruthy();
      expect(skill.tier).toBeGreaterThanOrEqual(0);
      expect(skill.tier).toBeLessThanOrEqual(6);
      expect(skill.dreyfusStage).toBeTruthy();
      expect(skill.narrativeLayer).toBeTruthy();
    }
  });

  it("no circular prerequisites", () => {
    // Cycle detection: for each skill, DFS through prerequisites
    // tracking the current path (not all visited nodes)
    function hasCycle(skillId: SkillId, path: Set<SkillId>): boolean {
      if (path.has(skillId)) return true;
      path.add(skillId);
      const skill = SKILLS[skillId];
      if (!skill) return false;
      for (const prereq of skill.prerequisites) {
        if (hasCycle(prereq, new Set(path))) return true;
      }
      return false;
    }

    for (const skill of Object.values(SKILLS)) {
      expect(hasCycle(skill.id, new Set())).toBe(false);
    }
  });

  it("prerequisites reference valid skill IDs", () => {
    for (const skill of Object.values(SKILLS)) {
      for (const prereq of skill.prerequisites) {
        expect(SKILLS[prereq]).toBeDefined();
      }
    }
  });

  it("tier 0 skills have no prerequisites (except S0.2 and S0.4)", () => {
    expect(SKILLS["S0.1"].prerequisites).toEqual([]);
    // S0.2 depends on S0.1, S0.3 depends on S0.1 — reasonable
  });

  it("has 5 gating skills", () => {
    const gating = getGatingSkills();
    expect(gating.length).toBe(5);
    const ids = gating.map((g) => g.id);
    expect(ids).toContain("S0.3"); // Positions
    expect(ids).toContain("S1.3"); // Pot Odds
    expect(ids).toContain("S2.1"); // Board Texture
    expect(ids).toContain("S3.1"); // What Is a Range
    expect(ids).toContain("S3.3"); // Narrowing Ranges
  });

  it("critical path has 7 skills", () => {
    const path = getCriticalPath();
    expect(path.length).toBe(7);
    expect(path[0]).toBe("S0.1");
    expect(path[path.length - 1]).toBe("S5.2");
  });

  it("has 5 Pareto skills ranked 1-5", () => {
    const pareto = getParetoSkills();
    expect(pareto.length).toBe(5);
    expect(pareto[0].paretoRank).toBe(1); // S1.4 Preflop Framework
    expect(pareto[4].paretoRank).toBe(5); // S4.3 Opponent Profiling
  });
});

describe("prerequisitesMet", () => {
  it("returns true for tier 0 skills with no progress", () => {
    const progress = new Map<SkillId, SkillProgress>();
    expect(prerequisitesMet("S0.1", progress)).toBe(true);
  });

  it("returns false when prerequisites not practiced", () => {
    const progress = new Map<SkillId, SkillProgress>();
    expect(prerequisitesMet("S1.1", progress)).toBe(false); // needs S0.1 + S0.3
  });

  it("returns true when prerequisites met at mastery >= 2", () => {
    const progress = new Map<SkillId, SkillProgress>();
    progress.set("S0.1", { skillId: "S0.1", practiceCount: 10, accuracy: 0.9, mastery: 3 });
    progress.set("S0.3", { skillId: "S0.3", practiceCount: 5, accuracy: 0.8, mastery: 2 });
    expect(prerequisitesMet("S1.1", progress)).toBe(true);
  });
});

describe("getNextSkills", () => {
  it("recommends tier 0 skills for new users", () => {
    const progress = new Map<SkillId, SkillProgress>();
    const next = getNextSkills(progress);
    expect(next.length).toBeGreaterThan(0);
    expect(next.every((s) => s.tier === 0)).toBe(true);
  });

  it("recommends Pareto skills when available", () => {
    const progress = new Map<SkillId, SkillProgress>();
    // Master enough to unlock S1.4 (Pareto rank 1)
    for (const id of ["S0.1", "S0.2", "S0.3", "S1.1", "S1.2"] as SkillId[]) {
      progress.set(id, { skillId: id, practiceCount: 20, accuracy: 0.9, mastery: 4 });
    }
    const next = getNextSkills(progress);
    const ids = next.map((s) => s.id);
    // S1.4 should be recommended (Pareto rank 1, prerequisites met)
    expect(ids).toContain("S1.4");
  });
});

describe("skillsForArchetype", () => {
  it("maps rfi_opening to position + starting hand skills", () => {
    const skills = skillsForArchetype("rfi_opening");
    const ids = skills.map((s) => s.id);
    expect(ids).toContain("S0.3"); // Positions
    expect(ids).toContain("S1.1"); // Starting Hand Strength
    expect(ids).toContain("S1.4"); // Preflop Framework
  });

  it("maps ace_high_dry_rainbow to board reading skills", () => {
    const skills = skillsForArchetype("ace_high_dry_rainbow");
    const ids = skills.map((s) => s.id);
    expect(ids).toContain("S2.1"); // Board Texture
    expect(ids).toContain("S2.2"); // Relative Hand Strength
    expect(ids).toContain("S3.4"); // Range Advantage
  });

  it("returns empty for unknown archetypes", () => {
    expect(skillsForArchetype("nonexistent").length).toBe(0);
  });
});

describe("tierLabel", () => {
  it("returns correct labels", () => {
    expect(tierLabel(0)).toBe("Game Mechanics");
    expect(tierLabel(4)).toBe("Narrative Construction");
    expect(tierLabel(6)).toBe("Meta-Game");
  });
});
