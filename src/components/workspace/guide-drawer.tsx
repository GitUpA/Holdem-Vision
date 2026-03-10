"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface GuideDrawerProps {
  open: boolean;
  onClose: () => void;
}

// ── SVG icon helpers (matches lens-selector style) ──

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

// ── Flow icons ──

const PracticeIcon = (
  <SvgIcon>
    <circle cx="12" cy="12" r="10" />
    <line x1="22" y1="12" x2="18" y2="12" />
    <line x1="6" y1="12" x2="2" y2="12" />
    <line x1="12" y1="6" x2="12" y2="2" />
    <line x1="12" y1="22" x2="12" y2="18" />
  </SvgIcon>
);

const StudyIcon = (
  <SvgIcon>
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </SvgIcon>
);

const WhatIfIcon = (
  <SvgIcon>
    <polyline points="16 3 21 3 21 8" />
    <line x1="4" y1="20" x2="21" y2="3" />
    <polyline points="21 16 21 21 16 21" />
    <line x1="15" y1="15" x2="21" y2="21" />
    <line x1="4" y1="4" x2="9" y2="9" />
  </SvgIcon>
);

const ReviewIcon = (
  <SvgIcon>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </SvgIcon>
);

// ── Lens icons (matching lens-selector.tsx) ──

const HandStrengthIcon = (
  <SvgIcon>
    <path d="M12 2L2 7l10 5 10-5-10-5z" />
    <path d="M2 17l10 5 10-5" />
    <path d="M2 12l10 5 10-5" />
  </SvgIcon>
);

const ThreatIcon = (
  <SvgIcon>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </SvgIcon>
);

const OutsIcon = (
  <SvgIcon>
    <circle cx="12" cy="12" r="10" />
    <line x1="22" y1="12" x2="18" y2="12" />
    <line x1="6" y1="12" x2="2" y2="12" />
    <line x1="12" y1="6" x2="12" y2="2" />
    <line x1="12" y1="22" x2="12" y2="18" />
  </SvgIcon>
);

const DrawsIcon = (
  <SvgIcon>
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </SvgIcon>
);

const OpponentReadIcon = (
  <SvgIcon>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </SvgIcon>
);

const MonteCarloIcon = (
  <SvgIcon>
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </SvgIcon>
);

const TipIcon = (
  <SvgIcon className="text-[var(--gold-dim)]">
    <line x1="9" y1="18" x2="15" y2="18" />
    <line x1="10" y1="22" x2="14" y2="22" />
    <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
  </SvgIcon>
);

// ── Section data ──

interface GuideSection {
  id: string;
  title: string;
  icon: ReactNode;
  description: string;
  steps: string[];
  tip?: string;
}

type TabId = "flows" | "lenses";

const FLOW_SECTIONS: GuideSection[] = [
  {
    id: "practice",
    title: "Practice",
    icon: PracticeIcon,
    description:
      "Play hands against AI opponents. Cards are dealt randomly and villain hands are hidden — practice reading their ranges.",
    steps: [
      "Set blinds, stack size, and number of players",
      "Click on villain seats to assign profiles (Nit, TAG, Fish, etc.)",
      'Click "Deal Hand" to start',
      "When it's your turn, use the action buttons (Fold, Call, Raise)",
      "Auto opponents act based on their profile",
      'Enable "Opponent Read" lens to see estimated ranges',
      'Click "New Hand" to play another',
    ],
    tip: "Assign different profiles to different seats to practice against mixed table dynamics.",
  },
  {
    id: "study",
    title: "Study a Known Hand",
    icon: StudyIcon,
    description:
      "Recreate a specific hand you saw or played. Assign exact cards to any seat and see precise equity calculations.",
    steps: [
      "Deal a hand to initialize the table",
      'Use the card grid in "Hero" mode — click two cards to set your hand',
      'Switch to "Community" mode in the card grid to set the board',
      "Click a villain seat to open their detail panel",
      "In the detail panel, click the card slots to assign their exact cards",
      'Click "Reveal" to include their cards in analysis as known dead cards',
      "Analysis shows exact equity against their actual hand",
    ],
    tip: "Assign profiles too — this lets you compare the estimated range vs. the actual hand they held.",
  },
  {
    id: "whatif",
    title: "What-if Exploration",
    icon: WhatIfIcon,
    description:
      'Mid-hand, swap any cards to explore "what if I held something different?" or "what if the board changed?"',
    steps: [
      "Play a hand normally (Practice flow)",
      'At any point, switch the card grid to "Hero" mode',
      "Click two different cards to swap your hole cards",
      "Analysis updates instantly with the new hand",
      'Switch to "Community" mode to change the board',
      "Compare threat analysis, outs, and equity with different holdings",
    ],
    tip: "This is great for learning which hands play well on different board textures.",
  },
  {
    id: "review",
    title: "Post-Hand Review",
    icon: ReviewIcon,
    description:
      "After a hand completes, reveal villain cards to see what they actually held and compare against the range you estimated.",
    steps: [
      "Play a hand to completion",
      "Click on a villain seat to open their detail panel",
      'Click "Reveal" to show their actual hole cards',
      "Their cards appear in the player list and analysis updates",
      'Use "Reveal All" in the hand result panel to see everyone\'s cards',
      "Compare the estimated range against their actual holding",
    ],
    tip: "After revealing, enable the Opponent Read lens to see how far off your range estimate was.",
  },
];

const LENS_SECTIONS: GuideSection[] = [
  {
    id: "raw-equity",
    title: "Hand Strength",
    icon: HandStrengthIcon,
    description:
      "Instantly evaluates your current hand rank. Works on every street from preflop through river — always shows what you have right now.",
    steps: [
      "Preflop: classifies your starting hand — Premium (AA, KK, QQ, AKs), Strong, Playable, Marginal, or Weak",
      "Flop/Turn/River: shows your exact made hand (e.g., \"Two Pair, Aces and Kings\")",
      "On the river your hand is final — this shows your showdown value",
      "The explanation tree breaks down why your hand ranks where it does",
      "Use this as a baseline before looking at threats or outs",
    ],
    tip: "This is a lightweight instant calculation — keep it enabled at all times for constant hand awareness.",
  },
  {
    id: "threats",
    title: "Threat Analysis",
    icon: ThreatIcon,
    description:
      "Identifies which remaining cards are dangerous to your hand. Only active on flop and turn — on the river there are no more cards to come, so there are no threats.",
    steps: [
      "Active on flop and turn only — no threats exist after the river",
      "Each threat card is highlighted with an urgency level (high, medium, low)",
      "Categories: flush completers, straight completers, board-pairing cards, overcards",
      "The \"safe cards\" section shows which remaining cards are harmless",
      "Use this to decide whether to bet for protection or slow-play",
    ],
    tip: "If most remaining cards are threats, bet to protect your hand. If the board is mostly safe, you can afford to slow-play.",
  },
  {
    id: "outs",
    title: "Outs",
    icon: OutsIcon,
    description:
      "Lists every remaining card that improves your hand. Only active on flop and turn — after the river all cards are dealt, so there are no outs to calculate.",
    steps: [
      "Active on flop and turn only — after the river your hand is final",
      "Outs are grouped by type — e.g., \"Pair to Two Pair\", \"Nothing to Flush\"",
      "The total out count feeds into a probability calculation",
      "Rule of 2/4: multiply outs by 2 (one card to come) or 4 (two cards) for approximate hit %",
      "Cards in the deck grid are highlighted based on how they improve your hand",
    ],
    tip: "Compare your out count to pot odds. If the pot offers better odds than your hit probability, calling is profitable long-term.",
  },
  {
    id: "draws",
    title: "Draw Analysis",
    icon: DrawsIcon,
    description:
      "Detects specific draw types — flush draws, OESD, gutshots, and backdoor draws. Only active on flop and turn — by the river draws have either hit or missed.",
    steps: [
      "Active on flop and turn only — draws don't exist on the river",
      "Flush draw: 4 cards to a flush (9 outs, ~35% by river)",
      "OESD: open-ended straight draw (8 outs, ~31% by river)",
      "Gutshot: inside straight draw (4 outs, ~17% by river)",
      "Combo draws (flush + straight) are flagged as premium semi-bluff hands",
      "Backdoor draws (needing 2 cards) only show on the flop, not the turn",
    ],
    tip: "Combo draws with 12+ outs are often favored to win even against made hands. These are your best semi-bluff candidates.",
  },
  {
    id: "opponent-read",
    title: "Opponent Read",
    icon: OpponentReadIcon,
    description:
      "The learning lens. Estimates each opponent's range based on their profile and actions, then calculates your equity against those estimated ranges. Works on every street.",
    steps: [
      "Assign profiles to villain seats first (click a seat, choose a profile)",
      "Works preflop through river — ranges narrow as opponents take more actions",
      "Each opponent shows: profile name, estimated range, your equity vs. that range",
      "The range grid highlights which hands the opponent likely holds",
      "Fold equity scenarios show how often opponents might fold to a bet",
      "Compare \"vs. opponents\" equity to the vacuum equity from Hand Strength",
    ],
    tip: "The delta between vacuum equity and opponent-read equity is key — it shows how much information you gain by reading opponents.",
  },
  {
    id: "monte-carlo",
    title: "Equity",
    icon: MonteCarloIcon,
    description:
      "Calculates your win/tie/lose percentages against random opponent holdings. Uses exact math on the turn and river, Monte Carlo simulation (10K trials) on the flop and preflop.",
    steps: [
      "River and turn: calculates exact equity by evaluating every possible outcome",
      "Flop and preflop: uses Monte Carlo simulation (10,000 trials) — still very accurate (~\u00B11%)",
      "Shows win %, tie %, and lose % as colored bars",
      "The explanation notes whether the result is exact or simulated",
      "Hand distribution shows how often you end up with each hand type by showdown",
    ],
    tip: "On the turn and river the numbers are absolute. On earlier streets they're simulated — still accurate enough for all practical decisions.",
  },
];

// ── Component ──

export function GuideDrawer({ open, onClose }: GuideDrawerProps) {
  const [activeTab, setActiveTab] = useState<TabId>("flows");
  const [expandedSection, setExpandedSection] = useState<string | null>("practice");

  const toggleSection = (id: string) => {
    setExpandedSection((prev) => (prev === id ? null : id));
  };

  const sections = activeTab === "flows" ? FLOW_SECTIONS : LENS_SECTIONS;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-40"
          />

          {/* Drawer panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 h-full w-[400px] max-w-[90vw] bg-[var(--card)] border-l border-[var(--border)] z-50 overflow-y-auto"
          >
            {/* Header */}
            <div className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--card)]">
              <div className="flex items-center justify-between px-5 py-3">
                <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--gold)]">
                  Guide
                </h2>
                <button
                  onClick={onClose}
                  className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors px-2 py-1 rounded hover:bg-[var(--muted)]/40"
                >
                  Close
                </button>
              </div>

              {/* Tabs */}
              <div className="flex px-5 gap-1 pb-2">
                {([
                  { id: "flows" as TabId, label: "How to Play" },
                  { id: "lenses" as TabId, label: "Analysis Lenses" },
                ]).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id);
                      setExpandedSection(
                        tab.id === "flows" ? "practice" : "raw-equity",
                      );
                    }}
                    className={cn(
                      "px-3 py-1.5 rounded-md text-xs font-medium transition-all border",
                      activeTab === tab.id
                        ? "bg-[var(--felt)] border-[var(--gold-dim)]/40 text-[var(--gold)]"
                        : "bg-transparent border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Sections */}
            <div className="px-5 py-4 space-y-2">
              {sections.map((section) => {
                const isExpanded = expandedSection === section.id;

                return (
                  <div
                    key={section.id}
                    className="rounded-lg border border-[var(--border)] overflow-hidden"
                  >
                    {/* Section header */}
                    <button
                      onClick={() => toggleSection(section.id)}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-4 py-3 text-left transition-colors",
                        isExpanded
                          ? "bg-[var(--muted)]/40"
                          : "hover:bg-[var(--muted)]/20",
                      )}
                    >
                      <span className="text-[var(--gold)]">{section.icon}</span>
                      <span className="text-sm font-semibold text-[var(--foreground)] flex-1">
                        {section.title}
                      </span>
                      <motion.span
                        animate={{ rotate: isExpanded ? 90 : 0 }}
                        transition={{ duration: 0.15 }}
                        className="text-[10px] text-[var(--muted-foreground)]"
                      >
                        {"\u25B6"}
                      </motion.span>
                    </button>

                    {/* Section content */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-4 space-y-3">
                            {/* Description */}
                            <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
                              {section.description}
                            </p>

                            {/* Steps */}
                            <ol className="space-y-1.5">
                              {section.steps.map((step, i) => (
                                <li
                                  key={i}
                                  className="flex items-start gap-2 text-xs text-[var(--foreground)]/80"
                                >
                                  <span className="text-[10px] font-bold text-[var(--gold-dim)] mt-0.5 min-w-[14px] text-right">
                                    {i + 1}.
                                  </span>
                                  <span className="leading-relaxed">{step}</span>
                                </li>
                              ))}
                            </ol>

                            {/* Tip */}
                            {section.tip && (
                              <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-[var(--gold)]/5 border border-[var(--gold-dim)]/20">
                                <span className="mt-0.5">{TipIcon}</span>
                                <p className="text-[11px] text-[var(--gold-dim)] leading-relaxed">
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
