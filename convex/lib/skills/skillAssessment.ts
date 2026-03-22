/**
 * Skill Assessment — maps drill results to skill progress updates.
 *
 * After each drill session, this module determines which skills were
 * exercised and updates mastery levels based on accuracy.
 *
 * Mastery levels:
 *   0 = not started
 *   1 = introduced (first practice)
 *   2 = practiced (5+ sessions)
 *   3 = competent (60%+ accuracy over 10+ sessions)
 *   4 = mastered (80%+ accuracy over 10+ sessions)
 *
 * Pure TypeScript, zero Convex imports.
 */

import {
  SKILLS,
  skillsForArchetype,
  type SkillId,
  type SkillProgress,
} from "./skillTree";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export interface DrillResultForAssessment {
  archetypeId: string;
  verdict: "optimal" | "acceptable" | "mistake" | "blunder";
}

// ═══════════════════════════════════════════════════════
// MASTERY THRESHOLDS
// ═══════════════════════════════════════════════════════

const MASTERY_THRESHOLDS = {
  introduced: 1,     // 1+ practice session
  practiced: 5,      // 5+ practice sessions
  competent: { sessions: 10, accuracy: 0.60 },
  mastered: { sessions: 10, accuracy: 0.80 },
};

const ROLLING_WINDOW = 20; // accuracy computed over last 20 results

// ═══════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════

/**
 * Update skill progress based on drill results.
 * Returns the updated progress map.
 */
export function updateSkillProgress(
  currentProgress: Record<string, SkillProgress>,
  results: DrillResultForAssessment[],
): Record<string, SkillProgress> {
  const updated = { ...currentProgress };

  // Determine which skills were exercised
  const exercisedSkills = new Set<SkillId>();
  for (const result of results) {
    const skills = skillsForArchetype(result.archetypeId);
    for (const skill of skills) {
      exercisedSkills.add(skill.id);
    }
  }

  // Compute session accuracy for this drill
  const sessionAccuracy = results.length > 0
    ? results.filter((r) => r.verdict === "optimal" || r.verdict === "acceptable").length / results.length
    : 0;

  // Update each exercised skill
  for (const skillId of exercisedSkills) {
    const existing = updated[skillId] ?? createDefaultProgress(skillId);

    existing.practiceCount += 1;
    existing.lastPracticed = new Date().toISOString();

    // Rolling accuracy: blend new session into existing
    if (existing.practiceCount <= 1) {
      existing.accuracy = sessionAccuracy;
    } else {
      // Exponential moving average with window
      const alpha = Math.min(1 / ROLLING_WINDOW, 1 / existing.practiceCount);
      existing.accuracy = existing.accuracy * (1 - alpha) + sessionAccuracy * alpha;
    }

    // Update mastery level
    existing.mastery = computeMastery(existing);

    updated[skillId] = existing;
  }

  return updated;
}

/**
 * Compute mastery level from progress data.
 */
function computeMastery(progress: SkillProgress): 0 | 1 | 2 | 3 | 4 {
  if (progress.practiceCount === 0) return 0;
  if (progress.practiceCount < MASTERY_THRESHOLDS.introduced) return 0;

  if (
    progress.practiceCount >= MASTERY_THRESHOLDS.mastered.sessions &&
    progress.accuracy >= MASTERY_THRESHOLDS.mastered.accuracy
  ) {
    return 4;
  }

  if (
    progress.practiceCount >= MASTERY_THRESHOLDS.competent.sessions &&
    progress.accuracy >= MASTERY_THRESHOLDS.competent.accuracy
  ) {
    return 3;
  }

  if (progress.practiceCount >= MASTERY_THRESHOLDS.practiced) {
    return 2;
  }

  return 1;
}

function createDefaultProgress(skillId: SkillId): SkillProgress {
  return {
    skillId,
    practiceCount: 0,
    accuracy: 0,
    mastery: 0,
  };
}

/**
 * Compute overall training stats from progress map.
 */
export function computeTrainingStats(
  progress: Record<string, SkillProgress>,
): {
  totalSkillsIntroduced: number;
  totalSkillsMastered: number;
  averageAccuracy: number;
  strongestSkills: SkillId[];
  weakestSkills: SkillId[];
} {
  const entries = Object.values(progress).filter((p) => p.practiceCount > 0);

  const totalSkillsIntroduced = entries.filter((p) => p.mastery >= 1).length;
  const totalSkillsMastered = entries.filter((p) => p.mastery >= 4).length;
  const averageAccuracy = entries.length > 0
    ? entries.reduce((sum, p) => sum + p.accuracy, 0) / entries.length
    : 0;

  const sorted = [...entries].sort((a, b) => b.accuracy - a.accuracy);
  const strongestSkills = sorted.slice(0, 3).map((p) => p.skillId);
  const weakestSkills = sorted
    .filter((p) => p.practiceCount >= 3) // only count skills with enough data
    .reverse()
    .slice(0, 3)
    .map((p) => p.skillId);

  return {
    totalSkillsIntroduced,
    totalSkillsMastered,
    averageAccuracy,
    strongestSkills,
    weakestSkills,
  };
}
