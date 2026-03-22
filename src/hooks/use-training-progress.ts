"use client";

/**
 * useTrainingProgress — reads persistent training data from Convex.
 *
 * Provides skill progress, session stats, and recommended skills
 * for authenticated users. Returns defaults when not authenticated.
 */

import { useQuery } from "convex/react";
import { useConvexAuth } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { SkillProgress } from "../../convex/lib/skills/skillTree";

export function useTrainingProgress() {
  const { isAuthenticated } = useConvexAuth();

  const progress = useQuery(
    api.skills.getProgress,
    isAuthenticated ? {} : "skip",
  );

  const sessionStats = useQuery(
    api.training.getSessionStats,
    isAuthenticated ? {} : "skip",
  );

  const recommendedSkills = useQuery(
    api.skills.getRecommendedSkills,
    isAuthenticated ? {} : "skip",
  );

  const recentResults = useQuery(
    api.training.getRecentResults,
    isAuthenticated ? { limit: 10 } : "skip",
  );

  return {
    isAuthenticated,
    isLoading: isAuthenticated && (progress === undefined || sessionStats === undefined),

    // Skill progress
    skillProgress: (progress?.progress ?? {}) as Record<string, SkillProgress>,
    totalHands: progress?.totalHands ?? 0,
    totalSessions: progress?.totalSessions ?? 0,
    trainingStats: progress?.stats ?? null,

    // Session stats
    sessionStats: sessionStats ?? null,

    // Recommendations
    recommendedSkills: recommendedSkills ?? [],

    // Recent results
    recentResults: recentResults ?? [],
  };
}
