"use client";

import { useTrainingProgress } from "@/hooks/use-training-progress";
import { SKILLS, tierLabel, type SkillId, type SkillTier } from "../../../convex/lib/skills/skillTree";

// ═══════════════════════════════════════════════════════
// MASTERY COLORS
// ═══════════════════════════════════════════════════════

const MASTERY_COLORS = {
  0: "bg-[var(--muted)]/30 text-[var(--muted-foreground)]",
  1: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  2: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  3: "bg-green-500/20 text-green-400 border-green-500/30",
  4: "bg-[var(--gold)]/20 text-[var(--gold)] border-[var(--gold)]/30",
} as const;

const MASTERY_LABELS = {
  0: "Not Started",
  1: "Introduced",
  2: "Practiced",
  3: "Competent",
  4: "Mastered",
} as const;

// ═══════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">{label}</div>
      <div className="text-2xl font-bold text-[var(--foreground)] mt-1">{value}</div>
      {sub && <div className="text-[10px] text-[var(--muted-foreground)] mt-0.5">{sub}</div>}
    </div>
  );
}

function SkillBadge({ skillId, mastery }: { skillId: SkillId; mastery: 0 | 1 | 2 | 3 | 4 }) {
  const skill = SKILLS[skillId];
  if (!skill) return null;

  return (
    <div
      className={`px-3 py-2 rounded-lg border text-xs ${MASTERY_COLORS[mastery]}`}
      title={`${skill.coreQuestion}\n${skill.description}`}
    >
      <div className="font-medium">{skill.name}</div>
      <div className="text-[10px] opacity-70 mt-0.5">{MASTERY_LABELS[mastery]}</div>
    </div>
  );
}

function SkillTierSection({ tier, progress }: {
  tier: SkillTier;
  progress: Record<string, { mastery: 0 | 1 | 2 | 3 | 4 }>;
}) {
  const skills = Object.values(SKILLS).filter((s) => s.tier === tier);

  return (
    <div>
      <h3 className="text-xs font-semibold text-[var(--gold)] uppercase tracking-widest mb-2">
        Tier {tier} — {tierLabel(tier)}
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {skills.map((skill) => (
          <SkillBadge
            key={skill.id}
            skillId={skill.id}
            mastery={(progress[skill.id]?.mastery ?? 0) as 0 | 1 | 2 | 3 | 4}
          />
        ))}
      </div>
    </div>
  );
}

function SessionHistoryRow({ session }: {
  session: {
    archetypeId: string;
    handsPlayed: number;
    accuracy: number;
    avgEvLoss: number;
    createdAt: number;
  };
}) {
  const date = new Date(session.createdAt);
  const timeStr = date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex items-center justify-between py-2 border-b border-[var(--border)] last:border-0">
      <div>
        <div className="text-xs font-medium text-[var(--foreground)]">
          {session.archetypeId.replace(/_/g, " ")}
        </div>
        <div className="text-[10px] text-[var(--muted-foreground)]">{timeStr}</div>
      </div>
      <div className="flex items-center gap-4 text-xs">
        <span className="text-[var(--muted-foreground)]">{session.handsPlayed}h</span>
        <span className={session.accuracy >= 0.7 ? "text-green-400" : session.accuracy >= 0.5 ? "text-yellow-400" : "text-red-400"}>
          {(session.accuracy * 100).toFixed(0)}%
        </span>
        <span className="text-[var(--muted-foreground)]">-{session.avgEvLoss.toFixed(1)} BB</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════

export default function ProgressPage() {
  const {
    isAuthenticated,
    isLoading,
    totalHands,
    totalSessions,
    trainingStats,
    sessionStats,
    recommendedSkills,
    skillProgress,
  } = useTrainingProgress();

  if (!isAuthenticated) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center">
        <h1 className="text-xl font-bold text-[var(--foreground)]">Training Progress</h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-2">
          Sign in to track your skill progress and training history.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center">
        <div className="text-sm text-[var(--muted-foreground)]">Loading progress...</div>
      </div>
    );
  }

  const overallAccuracy = sessionStats?.overallAccuracy ?? 0;

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      <h1 className="text-xl font-bold text-[var(--foreground)]">Training Progress</h1>

      {/* Overview stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Hands Played" value={totalHands} />
        <StatCard label="Sessions" value={totalSessions} />
        <StatCard
          label="Accuracy"
          value={totalHands > 0 ? `${(overallAccuracy * 100).toFixed(0)}%` : "--"}
          sub={totalHands > 0 ? "optimal + acceptable" : "no data yet"}
        />
        <StatCard
          label="Skills"
          value={trainingStats?.totalSkillsIntroduced ?? 0}
          sub={`of 28 introduced`}
        />
      </div>

      {/* Recommended next skills */}
      {recommendedSkills.length > 0 && (
        <div className="rounded-lg border border-[var(--gold)]/20 bg-[var(--gold)]/5 p-4">
          <h2 className="text-xs font-semibold text-[var(--gold)] uppercase tracking-widest mb-2">
            Recommended Next
          </h2>
          <div className="space-y-2">
            {recommendedSkills.slice(0, 3).map((skill) => (
              <div key={skill.id} className="flex items-start gap-3">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--gold)]/10 text-[var(--gold)] font-mono">
                  {skill.id}
                </span>
                <div>
                  <div className="text-xs font-medium text-[var(--foreground)]">{skill.name}</div>
                  <div className="text-[10px] text-[var(--muted-foreground)]">{skill.coreQuestion}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Skill tree */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">Skill Tree</h2>
        {([0, 1, 2, 3, 4, 5, 6] as SkillTier[]).map((tier) => (
          <SkillTierSection key={tier} tier={tier} progress={skillProgress} />
        ))}
      </div>

      {/* Session history */}
      {sessionStats && sessionStats.totalSessions > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-[var(--foreground)] mb-2">
            By Archetype
          </h2>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] divide-y divide-[var(--border)]">
            {Object.entries(sessionStats.byArchetype)
              .sort(([, a], [, b]) => b.sessions - a.sessions)
              .map(([archId, stats]) => (
                <div key={archId} className="flex items-center justify-between px-4 py-2.5">
                  <div className="text-xs font-medium text-[var(--foreground)]">
                    {archId.replace(/_/g, " ")}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-[var(--muted-foreground)]">
                    <span>{stats.sessions} sessions</span>
                    <span>{stats.hands} hands</span>
                    <span className={stats.accuracy >= 0.7 ? "text-green-400" : stats.accuracy >= 0.5 ? "text-yellow-400" : "text-red-400"}>
                      {(stats.accuracy * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {totalHands === 0 && (
        <div className="text-center py-8 text-sm text-[var(--muted-foreground)]">
          No training data yet. Head to{" "}
          <a href="/vision?source=archetype" className="text-[var(--gold)] hover:underline">
            Archetype Training
          </a>{" "}
          to start practicing.
        </div>
      )}
    </div>
  );
}
