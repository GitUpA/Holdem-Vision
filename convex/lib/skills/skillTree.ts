/**
 * Skill Tree — the 26-skill dependency tree for poker learning.
 *
 * Defines skills, tiers, prerequisites, and the mapping from
 * drill/analysis performance to skill assessment. This is the
 * data structure that drives adaptive learning.
 *
 * Skills are organized in 7 tiers (0-6), from Game Mechanics
 * to Meta-Game. Each skill has prerequisites, a core question,
 * and mappings to the archetypes/features that teach it.
 *
 * Pure TypeScript, zero Convex imports.
 */

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export type SkillId =
  // Tier 0 — Game Mechanics
  | "S0.1" | "S0.2" | "S0.3" | "S0.4"
  // Tier 1 — Basic Evaluation
  | "S1.1" | "S1.2" | "S1.3" | "S1.4"
  // Tier 2 — Board Reading
  | "S2.1" | "S2.2" | "S2.3" | "S2.4"
  // Tier 3 — Range Thinking
  | "S3.1" | "S3.2" | "S3.3" | "S3.4"
  // Tier 4 — Narrative Construction
  | "S4.1" | "S4.2" | "S4.3" | "S4.4" | "S4.5"
  // Tier 5 — Strategic Integration
  | "S5.1" | "S5.2" | "S5.3" | "S5.4"
  // Tier 6 — Meta-Game
  | "S6.1" | "S6.2" | "S6.3";

export type SkillTier = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type DreyfusStage =
  | "novice"
  | "advanced_beginner"
  | "competent"
  | "proficient"
  | "expert";

export interface Skill {
  id: SkillId;
  name: string;
  tier: SkillTier;
  /** The core question this skill answers */
  coreQuestion: string;
  /** Short teaching description */
  description: string;
  /** Which skills must be learned first */
  prerequisites: SkillId[];
  /** Dreyfus stage this skill maps to */
  dreyfusStage: DreyfusStage;
  /** Is this a gating skill (everything downstream depends on it)? */
  isGating: boolean;
  /** Which narrative layer this skill serves */
  narrativeLayer: "my_narrative" | "their_narrative" | "meta_narrative" | "shared_context" | "framework";
  /** Which archetypes teach this skill */
  teachingArchetypes: string[];
  /** Pareto rank (1-5 = top 20% skills that prevent 80% of losses, 0 = not in top 5) */
  paretoRank: number;
}

export interface SkillProgress {
  skillId: SkillId;
  /** Number of practice sessions involving this skill */
  practiceCount: number;
  /** Accuracy across relevant drills (0-1) */
  accuracy: number;
  /** Mastery level: 0 = not started, 1 = introduced, 2 = practiced, 3 = competent, 4 = mastered */
  mastery: 0 | 1 | 2 | 3 | 4;
  /** Last practice timestamp */
  lastPracticed?: string;
}

// ═══════════════════════════════════════════════════════
// SKILL DEFINITIONS
// ═══════════════════════════════════════════════════════

export const SKILLS: Record<SkillId, Skill> = {
  // ── Tier 0: Game Mechanics ──
  "S0.1": {
    id: "S0.1", name: "Hand Rankings", tier: 0,
    coreQuestion: "Which hand beats which?",
    description: "The foundation — knowing that a flush beats a straight, a full house beats a flush, etc.",
    prerequisites: [],
    dreyfusStage: "novice", isGating: false,
    narrativeLayer: "framework",
    teachingArchetypes: [],
    paretoRank: 0,
  },
  "S0.2": {
    id: "S0.2", name: "Betting Structure", tier: 0,
    coreQuestion: "How do bets, raises, and pot sizes work?",
    description: "Understanding bet sizing, pot odds basics, and the mechanics of building a pot.",
    prerequisites: ["S0.1"],
    dreyfusStage: "novice", isGating: false,
    narrativeLayer: "framework",
    teachingArchetypes: [],
    paretoRank: 0,
  },
  "S0.3": {
    id: "S0.3", name: "Positions", tier: 0,
    coreQuestion: "Why does position matter?",
    description: "UTG, HJ, CO, BTN, SB, BB — each position has different information advantages and range implications.",
    prerequisites: ["S0.1"],
    dreyfusStage: "novice", isGating: true,
    narrativeLayer: "shared_context",
    teachingArchetypes: ["rfi_opening", "bb_defense_vs_rfi"],
    paretoRank: 0,
  },
  "S0.4": {
    id: "S0.4", name: "Blinds, Stacks & SPR", tier: 0,
    coreQuestion: "How do stack sizes affect decisions?",
    description: "Stack-to-pot ratio determines whether you're committed or flexible. Deep stacks allow complex play.",
    prerequisites: ["S0.2"],
    dreyfusStage: "novice", isGating: false,
    narrativeLayer: "shared_context",
    teachingArchetypes: [],
    paretoRank: 0,
  },

  // ── Tier 1: Basic Evaluation ──
  "S1.1": {
    id: "S1.1", name: "Starting Hand Strength", tier: 1,
    coreQuestion: "Is this hand worth playing?",
    description: "AA is premium, 72o is trash. But context matters — K9s from BTN is different from K9s from UTG.",
    prerequisites: ["S0.1", "S0.3"],
    dreyfusStage: "novice", isGating: false,
    narrativeLayer: "my_narrative",
    teachingArchetypes: ["rfi_opening", "bb_defense_vs_rfi", "blind_vs_blind"],
    paretoRank: 0,
  },
  "S1.2": {
    id: "S1.2", name: "Position Awareness", tier: 1,
    coreQuestion: "How does my position change what I should play?",
    description: "Tighten up out of position, widen in position. The button is the most profitable seat.",
    prerequisites: ["S0.3", "S1.1"],
    dreyfusStage: "advanced_beginner", isGating: false,
    narrativeLayer: "my_narrative",
    teachingArchetypes: ["rfi_opening", "bb_defense_vs_rfi", "blind_vs_blind"],
    paretoRank: 2,
  },
  "S1.3": {
    id: "S1.3", name: "Pot Odds", tier: 1,
    coreQuestion: "Is the price right to call?",
    description: "Compare the cost of calling to the pot size. If the pot offers 3:1 and you win 1 in 3 times, calling breaks even.",
    prerequisites: ["S0.2"],
    dreyfusStage: "advanced_beginner", isGating: true,
    narrativeLayer: "framework",
    teachingArchetypes: [],
    paretoRank: 0,
  },
  "S1.4": {
    id: "S1.4", name: "Preflop Decision Framework", tier: 1,
    coreQuestion: "Given my hand and position, what should I do preflop?",
    description: "The first major decision framework: open/fold from each position, defend the blinds, 3-bet with premiums.",
    prerequisites: ["S1.1", "S1.2"],
    dreyfusStage: "advanced_beginner", isGating: false,
    narrativeLayer: "my_narrative",
    teachingArchetypes: ["rfi_opening", "bb_defense_vs_rfi", "three_bet_pots", "four_bet_five_bet"],
    paretoRank: 1,
  },

  // ── Tier 2: Board Reading ──
  "S2.1": {
    id: "S2.1", name: "Board Texture Recognition", tier: 2,
    coreQuestion: "What does this board mean for both players' ranges?",
    description: "Dry vs wet, monotone vs rainbow, connected vs disconnected. The board determines which stories are possible.",
    prerequisites: ["S1.1"],
    dreyfusStage: "advanced_beginner", isGating: true,
    narrativeLayer: "shared_context",
    teachingArchetypes: [
      "ace_high_dry_rainbow", "kq_high_dry_rainbow", "mid_low_dry_rainbow",
      "monotone", "paired_boards", "two_tone_connected", "two_tone_disconnected", "rainbow_connected",
    ],
    paretoRank: 3,
  },
  "S2.2": {
    id: "S2.2", name: "Relative Hand Strength", tier: 2,
    coreQuestion: "How strong is my hand on THIS board?",
    description: "Top pair on a dry board is strong. Top pair on a wet board with flush and straight possibilities is vulnerable.",
    prerequisites: ["S2.1"],
    dreyfusStage: "advanced_beginner", isGating: false,
    narrativeLayer: "my_narrative",
    teachingArchetypes: [
      "ace_high_dry_rainbow", "kq_high_dry_rainbow", "two_tone_connected",
      "cbet_sizing_frequency", "turn_barreling",
    ],
    paretoRank: 0,
  },
  "S2.3": {
    id: "S2.3", name: "Draws and Outs", tier: 2,
    coreQuestion: "How many cards improve my hand, and is it worth chasing?",
    description: "Count your outs, calculate your odds. A flush draw has 9 outs (~36% by the river). Combine with pot odds.",
    prerequisites: ["S1.3", "S2.1"],
    dreyfusStage: "advanced_beginner", isGating: false,
    narrativeLayer: "my_narrative",
    teachingArchetypes: ["two_tone_connected", "monotone", "rainbow_connected"],
    paretoRank: 0,
  },
  "S2.4": {
    id: "S2.4", name: "Nut Advantage & Blockers", tier: 2,
    coreQuestion: "Which player can have the best possible hand on this board?",
    description: "If you hold the A♠ on a three-spade board, you block the nut flush. This changes what stories are possible.",
    prerequisites: ["S2.1"],
    dreyfusStage: "competent", isGating: false,
    narrativeLayer: "meta_narrative",
    teachingArchetypes: ["monotone", "three_bet_pot_postflop"],
    paretoRank: 0,
  },

  // ── Tier 3: Range Thinking ──
  "S3.1": {
    id: "S3.1", name: "What Is a Range", tier: 3,
    coreQuestion: "What are all the hands my opponent could have?",
    description: "Stop thinking 'they have AK.' Start thinking 'their range includes AK, AQ, KK, QQ, some suited connectors...'",
    prerequisites: ["S1.4", "S2.1"],
    dreyfusStage: "competent", isGating: true,
    narrativeLayer: "their_narrative",
    teachingArchetypes: ["rfi_opening", "bb_defense_vs_rfi", "three_bet_pots"],
    paretoRank: 0,
  },
  "S3.2": {
    id: "S3.2", name: "Position-Based Opening Ranges", tier: 3,
    coreQuestion: "What hands does each position open with?",
    description: "UTG opens ~15% of hands (tight). BTN opens ~45% (wide). Knowing this narrows opponent ranges immediately.",
    prerequisites: ["S3.1", "S1.2"],
    dreyfusStage: "competent", isGating: false,
    narrativeLayer: "their_narrative",
    teachingArchetypes: ["rfi_opening"],
    paretoRank: 0,
  },
  "S3.3": {
    id: "S3.3", name: "Narrowing Ranges by Actions", tier: 3,
    coreQuestion: "How does each action narrow what they could have?",
    description: "They raised preflop (strong range), bet the flop (still strong), checked the turn (weakness?). Each action is a data point.",
    prerequisites: ["S3.1", "S2.2"],
    dreyfusStage: "competent", isGating: true,
    narrativeLayer: "their_narrative",
    teachingArchetypes: ["cbet_sizing_frequency", "turn_barreling", "river_bluff_catching_mdf"],
    paretoRank: 4,
  },
  "S3.4": {
    id: "S3.4", name: "Range Advantage", tier: 3,
    coreQuestion: "Whose range is stronger on this board?",
    description: "On A-K-5 rainbow, the preflop raiser has more aces and kings. They have range advantage and can bet more often.",
    prerequisites: ["S3.2", "S2.1"],
    dreyfusStage: "proficient", isGating: false,
    narrativeLayer: "shared_context",
    teachingArchetypes: ["ace_high_dry_rainbow", "kq_high_dry_rainbow", "mid_low_dry_rainbow"],
    paretoRank: 0,
  },

  // ── Tier 4: Narrative Construction ──
  "S4.1": {
    id: "S4.1", name: "Bet Sizing as Communication", tier: 4,
    coreQuestion: "What does my bet size tell opponents?",
    description: "A small bet says 'I want a call.' A big bet says 'I'm polarized — I either have it or I'm bluffing.' Sizing IS your voice.",
    prerequisites: ["S3.3"],
    dreyfusStage: "competent", isGating: false,
    narrativeLayer: "my_narrative",
    teachingArchetypes: ["cbet_sizing_frequency", "overbet_river", "thin_value_river"],
    paretoRank: 0,
  },
  "S4.2": {
    id: "S4.2", name: "Line Consistency", tier: 4,
    coreQuestion: "Does my sequence of actions tell a coherent story?",
    description: "If you bet flop, bet turn, then check river — your story changed. Opponents notice. Make sure your line makes sense for the range you're representing.",
    prerequisites: ["S3.3", "S4.1"],
    dreyfusStage: "proficient", isGating: false,
    narrativeLayer: "my_narrative",
    teachingArchetypes: ["turn_barreling", "river_bluff_catching_mdf", "thin_value_river"],
    paretoRank: 0,
  },
  "S4.3": {
    id: "S4.3", name: "Opponent Profiling", tier: 4,
    coreQuestion: "What type of player is this, and how does that change my strategy?",
    description: "NITs fold too much — bluff them. Fish call too much — value bet them. Adapt your narrative to your audience.",
    prerequisites: ["S3.3"],
    dreyfusStage: "competent", isGating: false,
    narrativeLayer: "their_narrative",
    teachingArchetypes: ["exploitative_overrides"],
    paretoRank: 5,
  },
  "S4.4": {
    id: "S4.4", name: "Thin Value & Bluff Catching", tier: 4,
    coreQuestion: "Should I bet for value with a marginal hand? Should I call their bet?",
    description: "The hardest decisions in poker: bet-folding with second pair, hero-calling with top pair weak kicker.",
    prerequisites: ["S3.3", "S2.2"],
    dreyfusStage: "proficient", isGating: false,
    narrativeLayer: "their_narrative",
    teachingArchetypes: ["thin_value_river", "river_bluff_catching_mdf"],
    paretoRank: 0,
  },
  "S4.5": {
    id: "S4.5", name: "Bluffing with Logic", tier: 4,
    coreQuestion: "When does a bluff make sense in the narrative?",
    description: "A bluff works when your story is credible. Ask: 'Would I play a strong hand exactly this way?' If yes, bluff. If no, give up.",
    prerequisites: ["S4.2", "S2.4"],
    dreyfusStage: "proficient", isGating: false,
    narrativeLayer: "meta_narrative",
    teachingArchetypes: ["overbet_river", "river_bluff_catching_mdf"],
    paretoRank: 0,
  },

  // ── Tier 5: Strategic Integration ──
  "S5.1": {
    id: "S5.1", name: "GTO Baselines", tier: 5,
    coreQuestion: "What does a balanced, unexploitable strategy look like?",
    description: "GTO is the default story — the one that can't be beaten. Deviation from GTO is a conscious choice, not ignorance.",
    prerequisites: ["S4.2", "S3.4"],
    dreyfusStage: "proficient", isGating: false,
    narrativeLayer: "framework",
    teachingArchetypes: ["cbet_sizing_frequency", "three_bet_pot_postflop"],
    paretoRank: 0,
  },
  "S5.2": {
    id: "S5.2", name: "Exploitative Adjustments", tier: 5,
    coreQuestion: "When and how should I deviate from GTO?",
    description: "GTO is the baseline. Against a NIT who folds 80%, bluff more. Against a fish who calls everything, value bet thinner.",
    prerequisites: ["S5.1", "S4.3"],
    dreyfusStage: "proficient", isGating: false,
    narrativeLayer: "meta_narrative",
    teachingArchetypes: ["exploitative_overrides"],
    paretoRank: 0,
  },
  "S5.3": {
    id: "S5.3", name: "Multi-Street Planning", tier: 5,
    coreQuestion: "How does my action now set up future streets?",
    description: "Think ahead. If you bet the flop, what will you do on the turn? On the river? Plan the whole story, not just the current sentence.",
    prerequisites: ["S4.2"],
    dreyfusStage: "proficient", isGating: false,
    narrativeLayer: "my_narrative",
    teachingArchetypes: ["turn_barreling", "thin_value_river"],
    paretoRank: 0,
  },
  "S5.4": {
    id: "S5.4", name: "Pot Geometry", tier: 5,
    coreQuestion: "How do I build the right pot size for my hand?",
    description: "With the nuts, build a big pot across three streets. With a marginal hand, keep it small. Sizing across streets determines final pot.",
    prerequisites: ["S5.3", "S0.4"],
    dreyfusStage: "proficient", isGating: false,
    narrativeLayer: "my_narrative",
    teachingArchetypes: ["overbet_river", "thin_value_river"],
    paretoRank: 0,
  },

  // ── Tier 6: Meta-Game ──
  "S6.1": {
    id: "S6.1", name: "Table Image", tier: 6,
    coreQuestion: "What do opponents think about ME?",
    description: "If you've been folding for an hour, a bet carries more weight. Your recent history shapes how opponents read your story.",
    prerequisites: ["S4.2", "S5.2"],
    dreyfusStage: "expert", isGating: false,
    narrativeLayer: "meta_narrative",
    teachingArchetypes: [],
    paretoRank: 0,
  },
  "S6.2": {
    id: "S6.2", name: "Leveling & Counter-Strategy", tier: 6,
    coreQuestion: "What do they think I think they have?",
    description: "Level 1: What do I have? Level 2: What do they have? Level 3: What do they think I have? Match your level to your opponent.",
    prerequisites: ["S6.1", "S5.2"],
    dreyfusStage: "expert", isGating: false,
    narrativeLayer: "meta_narrative",
    teachingArchetypes: [],
    paretoRank: 0,
  },
  "S6.3": {
    id: "S6.3", name: "Game Selection & Mental Game", tier: 6,
    coreQuestion: "Am I in the right game, in the right mental state?",
    description: "The most profitable skill: choose games where you have an edge. Quit when tilted. The narrative starts before you sit down.",
    prerequisites: ["S5.2"],
    dreyfusStage: "expert", isGating: false,
    narrativeLayer: "meta_narrative",
    teachingArchetypes: [],
    paretoRank: 0,
  },
};

// ═══════════════════════════════════════════════════════
// QUERIES
// ═══════════════════════════════════════════════════════

/** Get all skills in a tier */
export function getSkillsByTier(tier: SkillTier): Skill[] {
  return Object.values(SKILLS).filter((s) => s.tier === tier);
}

/** Get all gating skills */
export function getGatingSkills(): Skill[] {
  return Object.values(SKILLS).filter((s) => s.isGating);
}

/** Get the critical path (shortest path through gating skills) */
export function getCriticalPath(): SkillId[] {
  return ["S0.1", "S1.1", "S3.1", "S3.3", "S4.2", "S5.1", "S5.2"];
}

/** Get Pareto skills (top 5 that prevent 80% of losses) */
export function getParetoSkills(): Skill[] {
  return Object.values(SKILLS)
    .filter((s) => s.paretoRank > 0)
    .sort((a, b) => a.paretoRank - b.paretoRank);
}

/** Check if a skill's prerequisites are met */
export function prerequisitesMet(
  skillId: SkillId,
  progress: Map<SkillId, SkillProgress>,
  minMastery = 2,
): boolean {
  const skill = SKILLS[skillId];
  if (!skill) return false;
  return skill.prerequisites.every((prereq) => {
    const p = progress.get(prereq);
    return p && p.mastery >= minMastery;
  });
}

/** Get the next recommended skills based on current progress */
export function getNextSkills(
  progress: Map<SkillId, SkillProgress>,
  maxResults = 3,
): Skill[] {
  const candidates: Skill[] = [];

  for (const skill of Object.values(SKILLS)) {
    const p = progress.get(skill.id);
    // Skip already mastered
    if (p && p.mastery >= 4) continue;
    // Skip if prerequisites not met
    if (!prerequisitesMet(skill.id, progress, 2)) continue;
    candidates.push(skill);
  }

  // Prioritize: Pareto skills first, then gating skills, then by tier
  candidates.sort((a, b) => {
    if (a.paretoRank > 0 && b.paretoRank === 0) return -1;
    if (b.paretoRank > 0 && a.paretoRank === 0) return 1;
    if (a.paretoRank > 0 && b.paretoRank > 0) return a.paretoRank - b.paretoRank;
    if (a.isGating && !b.isGating) return -1;
    if (b.isGating && !a.isGating) return 1;
    return a.tier - b.tier;
  });

  return candidates.slice(0, maxResults);
}

/** Map an archetype to the skills it teaches */
export function skillsForArchetype(archetypeId: string): Skill[] {
  return Object.values(SKILLS).filter((s) =>
    s.teachingArchetypes.includes(archetypeId),
  );
}

/** Get the tier label */
export function tierLabel(tier: SkillTier): string {
  const labels: Record<SkillTier, string> = {
    0: "Game Mechanics",
    1: "Basic Evaluation",
    2: "Board Reading",
    3: "Range Thinking",
    4: "Narrative Construction",
    5: "Strategic Integration",
    6: "Meta-Game",
  };
  return labels[tier];
}
