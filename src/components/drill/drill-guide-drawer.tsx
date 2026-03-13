"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface DrillGuideDrawerProps {
  open: boolean;
  onClose: () => void;
}

// ── SVG icon helpers ──

function SvgIcon({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shrink-0", className)}
    >
      {children}
    </svg>
  );
}

const TargetIcon = (
  <SvgIcon>
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
  </SvgIcon>
);

const BookIcon = (
  <SvgIcon>
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </SvgIcon>
);

const BarChartIcon = (
  <SvgIcon>
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </SvgIcon>
);

const ScaleIcon = (
  <SvgIcon>
    <path d="M16 16l3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
    <path d="M2 16l3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
    <path d="M7 21h10" />
    <path d="M12 3v18" />
    <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />
  </SvgIcon>
);

const BrainIcon = (
  <SvgIcon>
    <path d="M9.5 2A5.5 5.5 0 0 0 5 5.5C5 8 7 9.5 7 12h4" />
    <path d="M14.5 2A5.5 5.5 0 0 1 19 5.5C19 8 17 9.5 17 12h-4" />
    <path d="M8 14v4" />
    <path d="M16 14v4" />
    <path d="M8 18h8" />
  </SvgIcon>
);

const ShieldIcon = (
  <SvgIcon>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </SvgIcon>
);

const StarIcon = (
  <SvgIcon>
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </SvgIcon>
);

// ── Section data ──

interface GuideSection {
  id: string;
  icon: ReactNode;
  title: string;
  description: string;
  steps?: string[];
  tip?: string;
}

const GETTING_STARTED: GuideSection[] = [
  {
    id: "what-is-drill",
    icon: TargetIcon,
    title: "What is Drill Mode?",
    description: "Practice GTO (Game Theory Optimal) decisions against solver-computed frequency tables. Each drill deals you hands matching a specific board archetype and asks you to choose the correct action.",
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
    icon: BookIcon,
    title: "Learn vs Quiz Mode",
    description: "Two ways to train, depending on what you need.",
    steps: [
      "Learn mode: GTO frequencies and explanations are always visible. Study what the solver recommends and why before choosing your action.",
      "Quiz mode: The solution is hidden until after you act. Pick your action first, then see how it compares to GTO.",
      "Switch freely between modes \u2014 your progress carries over within a drill session.",
    ],
    tip: "Use Learn mode to study a new archetype, then switch to Quiz mode once you feel comfortable.",
  },
];

const UNDERSTANDING_RESULTS: GuideSection[] = [
  {
    id: "frequency-bars",
    icon: BarChartIcon,
    title: "Reading Frequency Bars",
    description: "The colored bars show how often GTO takes each action in this spot.",
    steps: [
      "Each bar represents an action (fold, check, call, bet sizes, raise sizes)",
      "The percentage is how often the solver chose that action across all hands in this category",
      "Band ranges (e.g. 49-61%) show variance across solved boards \u2014 wider bands mean the spot is more board-dependent",
      "The highlighted action is the most frequent (optimal) choice",
    ],
    tip: "Don\u2019t think of GTO as \u201calways do X.\u201d It\u2019s a mixed strategy \u2014 the solver sometimes checks and sometimes bets with the same hand.",
  },
  {
    id: "accuracy",
    icon: ShieldIcon,
    title: "Accuracy & Confidence",
    description: "Each drill spot shows how precise the solver data is, measured in BB (big blinds).",
    steps: [
      "\u201cWithin X BB\u201d tells you the maximum EV difference between our data and a perfect solver",
      "Very High accuracy (< 0.1 BB) means the frequencies are essentially exact",
      "High accuracy (< 0.2 BB) is still excellent for learning",
      "Moderate accuracy (< 0.5 BB) means the spot has more variance \u2014 focus on the general pattern, not exact percentages",
    ],
    tip: "Even at \u201cmoderate\u201d accuracy, the error is smaller than the EV you lose from most common mistakes.",
  },
  {
    id: "verdicts",
    icon: ScaleIcon,
    title: "Scoring Verdicts",
    description: "After each hand, your action is graded against the GTO solution.",
    steps: [
      "Optimal: You chose a high-frequency GTO action. No EV lost.",
      "Acceptable: Your action has some solver support but isn\u2019t the primary play. Small EV loss.",
      "Mistake: The solver rarely takes this action here. Moderate EV loss.",
      "Blunder: The solver essentially never does this. Significant EV lost.",
    ],
    tip: "Acceptable is fine in practice! GTO uses mixed strategies, so multiple actions can be correct. Focus on avoiding Mistakes and Blunders.",
  },
];

const ARCHETYPE_TIPS: GuideSection[] = [
  {
    id: "archetypes",
    icon: BrainIcon,
    title: "Understanding Archetypes",
    description: "Archetypes are categories of board textures that share similar strategic properties.",
    steps: [
      "Dry boards (e.g. A-7-2 rainbow): Favor the preflop raiser. High c-bet frequency, small sizing.",
      "Wet boards (e.g. J-T-8 two-tone): More checking, bigger bets when betting. Draws change everything.",
      "Paired boards: Less intuitive \u2014 the pair reduces combos and shifts ranges in subtle ways.",
      "Monotone boards: Flush draws dominate. Position matters more than usual.",
    ],
    tip: "Drill each archetype separately. The key insight is that GTO strategy changes dramatically based on board texture.",
  },
  {
    id: "preflop",
    icon: StarIcon,
    title: "Preflop Archetypes",
    description: "Preflop drills cover opening ranges, 3-bet defense, blind play, and more.",
    steps: [
      "RFI Opening: Which hands to raise first in from each position",
      "BB Defense: How wide to defend your big blind vs a raise",
      "3-Bet Pots: When to 3-bet and how to respond to 3-bets",
      "Blind vs Blind: Unique dynamics when only the blinds are left",
    ],
    tip: "Preflop is the foundation. If your preflop ranges are off, every postflop decision starts from a disadvantage.",
  },
];

const ALL_TABS = [
  { key: "start", label: "Getting Started", sections: GETTING_STARTED },
  { key: "results", label: "Understanding Results", sections: UNDERSTANDING_RESULTS },
  { key: "archetypes", label: "Archetypes", sections: ARCHETYPE_TIPS },
] as const;

// ── Tip box icon ──

function TipIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--gold)]">
      <line x1="9" y1="18" x2="15" y2="18" />
      <line x1="10" y1="22" x2="14" y2="22" />
      <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
    </svg>
  );
}

// ── Component ──

export function DrillGuideDrawer({ open, onClose }: DrillGuideDrawerProps) {
  const [activeTab, setActiveTab] = useState<string>("start");
  const [expandedSection, setExpandedSection] = useState<string | null>("what-is-drill");

  const currentTab = ALL_TABS.find((t) => t.key === activeTab) ?? ALL_TABS[0];

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/40 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            className="fixed top-0 right-0 h-full w-[400px] max-w-[90vw] z-50 bg-[var(--card)] border-l border-[var(--border)] shadow-xl flex flex-col"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 bg-[var(--card)] border-b border-[var(--border)] px-4 py-3">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-[var(--gold)]">Drill Guide</h2>
                <button
                  onClick={onClose}
                  className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors px-2 py-1 rounded hover:bg-[var(--muted)]"
                >
                  Close
                </button>
              </div>

              {/* Tabs */}
              <div className="flex gap-1">
                {ALL_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => {
                      setActiveTab(tab.key);
                      setExpandedSection(null);
                    }}
                    className={cn(
                      "px-2.5 py-1 text-[10px] rounded-md transition-colors font-medium",
                      activeTab === tab.key
                        ? "bg-[var(--gold)]/15 text-[var(--gold)]"
                        : "text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]",
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {currentTab.sections.map((section) => {
                const isExpanded = expandedSection === section.id;
                return (
                  <div
                    key={section.id}
                    className={cn(
                      "rounded-lg border transition-colors",
                      isExpanded
                        ? "border-[var(--gold-dim)]/30 bg-[var(--gold)]/[0.03]"
                        : "border-[var(--border)] hover:border-[var(--border)]/80",
                    )}
                  >
                    <button
                      onClick={() => setExpandedSection(isExpanded ? null : section.id)}
                      className="w-full text-left px-3 py-2.5 flex items-center gap-2.5"
                    >
                      <span className="text-[var(--gold-dim)]">{section.icon}</span>
                      <span className="text-xs font-medium text-[var(--foreground)] flex-1">
                        {section.title}
                      </span>
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className={cn(
                          "text-[var(--muted-foreground)] transition-transform",
                          isExpanded && "rotate-180",
                        )}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-3 pb-3 space-y-2">
                            <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed">
                              {section.description}
                            </p>

                            {section.steps && (
                              <ol className="space-y-1.5 pl-1">
                                {section.steps.map((step, i) => (
                                  <li key={i} className="flex gap-2 text-[11px]">
                                    <span className="text-[var(--gold-dim)] font-mono text-[10px] mt-0.5 shrink-0">
                                      {i + 1}.
                                    </span>
                                    <span className="text-[var(--foreground)]/80 leading-relaxed">
                                      {step}
                                    </span>
                                  </li>
                                ))}
                              </ol>
                            )}

                            {section.tip && (
                              <div className="flex gap-2 p-2 rounded-md bg-[var(--gold)]/5 border border-[var(--gold-dim)]/20">
                                <TipIcon />
                                <p className="text-[10px] italic text-[var(--gold-dim)] leading-relaxed">
                                  {section.tip}
                                </p>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
