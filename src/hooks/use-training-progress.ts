"use client";

/**
 * useTrainingProgress — reads persistent training data from Convex.
 *
 * NOTE: This hook requires `npx convex dev` to regenerate API types
 * after the schema update. Until then, it returns defaults.
 *
 * TODO: Uncomment Convex queries after running `npx convex dev`
 */

import { useConvexAuth } from "convex/react";
// import { useQuery } from "convex/react";
// import { api } from "../../convex/_generated/api";
import type { SkillProgress } from "../../convex/lib/skills/skillTree";

export function useTrainingProgress() {
  const { isAuthenticated } = useConvexAuth();

  // These will be enabled after `npx convex dev` regenerates API types:
  // const progress = useQuery(api.skills.getProgress, isAuthenticated ? {} : "skip");
  // const sessionStats = useQuery(api.training.getSessionStats, isAuthenticated ? {} : "skip");
  // const recommendedSkills = useQuery(api.skills.getRecommendedSkills, isAuthenticated ? {} : "skip");
  // const recentResults = useQuery(api.training.getRecentResults, isAuthenticated ? { limit: 10 } : "skip");

  return {
    isAuthenticated,
    isLoading: false,
    skillProgress: {} as Record<string, SkillProgress>,
    totalHands: 0,
    totalSessions: 0,
    trainingStats: null,
    sessionStats: null,
    recommendedSkills: [],
    recentResults: [],
  };
}
