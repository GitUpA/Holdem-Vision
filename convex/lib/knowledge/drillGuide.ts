/**
 * Knowledge Base — Drill Guide entries
 *
 * Tutorial content for drill mode, previously hardcoded in drill-guide-drawer.tsx.
 * Three logical groups matching the drawer tabs: getting started, results, archetypes.
 */

import type { KnowledgeEntry } from "./types";
import { registerKnowledge } from "./registry";

const DRILL_GUIDE: KnowledgeEntry[] = [
  // ── Getting Started tab ──
  {
    id: "feature:drill_mode",
    category: "feature",
    name: "Drill Mode",
    short: "Practice GTO decisions against solver data",
    medium:
      "Drill mode deals you hands matching a specific board archetype and asks you to choose the correct action, scored against solver-computed GTO frequencies.",
    full:
      "Practice GTO (Game Theory Optimal) decisions against solver-computed frequency tables. Each drill deals you hands matching a specific board archetype and asks you to choose the correct action.",
    related: ["feature:learn_vs_quiz", "concept:gto", "feature:scoring_verdicts"],
    sections: [
      {
        id: "what-is-drill",
        title: "What is Drill Mode?",
        description:
          "Practice GTO (Game Theory Optimal) decisions against solver-computed frequency tables. Each drill deals you hands matching a specific board archetype and asks you to choose the correct action.",
        steps: [
          "Select an archetype (board type) from the grid",
          "Choose how many hands to practice (5, 10, or 20)",
          "Pick Learn mode (answers shown) or Quiz mode (test yourself)",
          "Press Start Drill to begin",
        ],
        tip: "Start with Learn mode on a familiar archetype to build intuition before switching to Quiz mode.",
      },
      {
        id: "learn-vs-quiz",
        title: "Learn vs Quiz Mode",
        description: "Two ways to train, depending on what you need.",
        steps: [
          "Learn mode: GTO frequencies and explanations are always visible. Study what the solver recommends and why before choosing your action.",
          "Quiz mode: The solution is hidden until after you act. Pick your action first, then see how it compares to GTO.",
          "Switch freely between modes \u2014 your progress carries over within a drill session.",
        ],
        tip: "Use Learn mode to study a new archetype, then switch to Quiz mode once you feel comfortable.",
      },
    ],
  },
  {
    id: "feature:learn_vs_quiz",
    category: "feature",
    name: "Learn vs Quiz Mode",
    short: "Study answers or test yourself",
    medium:
      "Learn mode shows GTO frequencies before you act. Quiz mode hides them until after. Switch freely within a session.",
    full:
      "Two ways to train, depending on what you need. Learn mode shows GTO frequencies and explanations before you choose, so you can study the solver's reasoning. Quiz mode hides the solution until after you act, testing your intuition. Your progress carries over when switching modes within a drill session.",
    related: ["feature:drill_mode", "feature:scoring_verdicts"],
  },

  // ── Understanding Results tab ──
  {
    id: "feature:frequency_bars",
    category: "feature",
    name: "Frequency Bars",
    short: "How often GTO takes each action",
    medium:
      "Colored bars showing solver action frequencies. Wider band ranges mean the spot is more board-dependent.",
    full:
      "The colored bars show how often GTO takes each action in this spot. Each bar represents an action (fold, check, call, bet sizes, raise sizes). The percentage is how often the solver chose that action across all hands in this category. Band ranges (e.g. 49-61%) show variance across solved boards \u2014 wider bands mean the spot is more board-dependent. The highlighted action is the most frequent (optimal) choice.",
    related: ["feature:drill_mode", "feature:accuracy_confidence"],
    sections: [
      {
        id: "frequency-bars",
        title: "Reading Frequency Bars",
        description:
          "The colored bars show how often GTO takes each action in this spot.",
        steps: [
          "Each bar represents an action (fold, check, call, bet sizes, raise sizes)",
          "The percentage is how often the solver chose that action across all hands in this category",
          "Band ranges (e.g. 49-61%) show variance across solved boards \u2014 wider bands mean the spot is more board-dependent",
          "The highlighted action is the most frequent (optimal) choice",
        ],
        tip: "Don\u2019t think of GTO as \u201calways do X.\u201d It\u2019s a mixed strategy \u2014 the solver sometimes checks and sometimes bets with the same hand.",
      },
    ],
  },
  {
    id: "feature:accuracy_confidence",
    category: "feature",
    name: "Accuracy & Confidence",
    short: "How precise the solver data is",
    medium:
      "Postflop shows accuracy in BB (big blinds) from solved boards. Preflop shows confidence based on how many solver scenarios back the recommendation. Both tell you how much to trust the exact percentages.",
    full:
      "HoldemVision shows how confident you can be in the displayed frequencies. Postflop: \u201cWithin X BB\u201d tells you the maximum difference between our data and a perfect solver, measured in big blinds. Very High (< 0.1 BB) is essentially exact. High (< 0.2 BB) is excellent for learning. Moderate (< 0.5 BB) means focus on the general pattern, not exact percentages. Preflop: \u201cReliable\u201d (30+ scenarios) means the percentages closely match solver recommendations. \u201cGood estimate\u201d (10-29 scenarios) is solid but exact percentages could shift a few points. \u201cRough guide\u201d (under 10 scenarios) means the direction (fold vs play) is right but exact percentages are approximate. In both cases, even at moderate confidence, the guidance is far better than guessing.",
    related: ["feature:frequency_bars", "feature:scoring_verdicts"],
    sections: [
      {
        id: "accuracy",
        title: "Accuracy & Confidence",
        description:
          "How much to trust the percentages shown in the GTO solution.",
        steps: [
          "Postflop: \u201cWithin X BB\u201d shows the maximum error vs a perfect solver. Under 0.2 BB is excellent.",
          "Preflop \u201cReliable\u201d (30+ scenarios): the percentages closely match what a solver would say.",
          "Preflop \u201cGood estimate\u201d (10-29 scenarios): solid guidance, but exact numbers could shift a few points.",
          "Preflop \u201cRough guide\u201d (under 10 scenarios): the fold-or-play direction is right, but exact percentages are approximate.",
        ],
        tip: "Even at the lowest confidence level, the recommendation is far more accurate than guessing. Focus on the big picture: should you fold or play?",
      },
    ],
  },
  {
    id: "feature:scoring_verdicts",
    category: "feature",
    name: "Scoring Verdicts",
    short: "How your action is graded vs GTO",
    medium:
      "Optimal (no EV lost), Acceptable (small loss), Mistake (moderate loss), Blunder (significant loss). Multiple actions can be Acceptable in mixed strategies.",
    full:
      "After each hand, your action is graded against the GTO solution. Optimal: You chose a high-frequency GTO action with no EV lost. Acceptable: Your action has some solver support but isn\u2019t the primary play, with small EV loss. Mistake: The solver rarely takes this action here, causing moderate EV loss. Blunder: The solver essentially never does this, with significant EV lost. Acceptable is fine in practice! GTO uses mixed strategies, so multiple actions can be correct. Focus on avoiding Mistakes and Blunders.",
    related: ["feature:drill_mode", "concept:ev", "concept:mixed_strategy"],
    sections: [
      {
        id: "verdicts",
        title: "Scoring Verdicts",
        description:
          "After each hand, your action is graded against the GTO solution.",
        steps: [
          "Optimal: You chose a high-frequency GTO action. No EV lost.",
          "Acceptable: Your action has some solver support but isn\u2019t the primary play. Small EV loss.",
          "Mistake: The solver rarely takes this action here. Moderate EV loss.",
          "Blunder: The solver essentially never does this. Significant EV lost.",
        ],
        tip: "Acceptable is fine in practice! GTO uses mixed strategies, so multiple actions can be correct. Focus on avoiding Mistakes and Blunders.",
      },
    ],
  },

  // ── Archetypes tab ──
  {
    id: "concept:board_archetypes",
    category: "concept",
    name: "Board Archetypes",
    short: "Categories of board textures with similar strategy",
    medium:
      "Archetypes group board textures that share similar strategic properties. GTO strategy changes dramatically based on board texture.",
    full:
      "Archetypes are categories of board textures that share similar strategic properties. Dry boards (e.g. A-7-2 rainbow) favor the preflop raiser with high c-bet frequency and small sizing. Wet boards (e.g. J-T-8 two-tone) see more checking and bigger bets when betting, because draws change everything. Paired boards are less intuitive \u2014 the pair reduces combos and shifts ranges in subtle ways. Monotone boards are dominated by flush draws, where position matters more than usual. The key insight is that GTO strategy changes dramatically based on board texture.",
    related: ["concept:board_texture", "feature:drill_mode"],
    sections: [
      {
        id: "archetypes",
        title: "Understanding Archetypes",
        description:
          "Archetypes are categories of board textures that share similar strategic properties.",
        steps: [
          "Dry boards (e.g. A-7-2 rainbow): Favor the preflop raiser. High c-bet frequency, small sizing.",
          "Wet boards (e.g. J-T-8 two-tone): More checking, bigger bets when betting. Draws change everything.",
          "Paired boards: Less intuitive \u2014 the pair reduces combos and shifts ranges in subtle ways.",
          "Monotone boards: Flush draws dominate. Position matters more than usual.",
        ],
        tip: "Drill each archetype separately. The key insight is that GTO strategy changes dramatically based on board texture.",
      },
    ],
  },
  {
    id: "concept:preflop_archetypes",
    category: "concept",
    name: "Preflop Archetypes",
    short: "Opening ranges, 3-bets, blind play",
    medium:
      "Preflop drills cover opening ranges (RFI), big blind defense, 3-bet pots, and blind-vs-blind dynamics.",
    full:
      "Preflop drills cover opening ranges, 3-bet defense, blind play, and more. RFI Opening teaches which hands to raise first in from each position. BB Defense covers how wide to defend your big blind vs a raise. 3-Bet Pots address when to 3-bet and how to respond to 3-bets. Blind vs Blind explores unique dynamics when only the blinds are left. Preflop is the foundation \u2014 if your preflop ranges are off, every postflop decision starts from a disadvantage.",
    related: ["concept:board_archetypes", "concept:position", "feature:drill_mode"],
    sections: [
      {
        id: "preflop",
        title: "Preflop Archetypes",
        description:
          "Preflop drills cover opening ranges, 3-bet defense, blind play, and more.",
        steps: [
          "RFI Opening: Which hands to raise first in from each position",
          "BB Defense: How wide to defend your big blind vs a raise",
          "3-Bet Pots: When to 3-bet and how to respond to 3-bets",
          "Blind vs Blind: Unique dynamics when only the blinds are left",
        ],
        tip: "Preflop is the foundation. If your preflop ranges are off, every postflop decision starts from a disadvantage.",
      },
    ],
  },
];

registerKnowledge(...DRILL_GUIDE);
