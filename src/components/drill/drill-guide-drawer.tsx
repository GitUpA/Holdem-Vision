"use client";

import type { ReactNode } from "react";
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { getKnowledge } from "../../../convex/lib/knowledge";

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

// ── Section data (content from knowledge base, icons from component) ──

interface GuideSection {
  id: string;
  icon: ReactNode;
  title: string;
  description: string;
  steps?: string[];
  tip?: string;
}

/** Map knowledge entry sections to GuideSection with icons */
function buildSections(
  mapping: { knowledgeId: string; sectionId: string; icon: ReactNode }[],
): GuideSection[] {
  return mapping.map(({ knowledgeId, sectionId, icon }) => {
    const entry = getKnowledge(knowledgeId);
    const section = entry?.sections?.find((s) => s.id === sectionId);
    if (!section) {
      return { id: sectionId, icon, title: sectionId, description: "" };
    }
    return {
      id: section.id,
      icon,
      title: section.title,
      description: section.description,
      steps: section.steps,
      tip: section.tip,
    };
  });
}

const ALL_TABS = [
  {
    key: "start",
    label: "Getting Started",
    build: () => buildSections([
      { knowledgeId: "feature:drill_mode", sectionId: "what-is-drill", icon: TargetIcon },
      { knowledgeId: "feature:drill_mode", sectionId: "learn-vs-quiz", icon: BookIcon },
    ]),
  },
  {
    key: "results",
    label: "Understanding Results",
    build: () => buildSections([
      { knowledgeId: "feature:frequency_bars", sectionId: "frequency-bars", icon: BarChartIcon },
      { knowledgeId: "feature:accuracy_confidence", sectionId: "accuracy", icon: ShieldIcon },
      { knowledgeId: "feature:scoring_verdicts", sectionId: "verdicts", icon: ScaleIcon },
    ]),
  },
  {
    key: "archetypes",
    label: "Archetypes",
    build: () => buildSections([
      { knowledgeId: "concept:board_archetypes", sectionId: "archetypes", icon: BrainIcon },
      { knowledgeId: "concept:preflop_archetypes", sectionId: "preflop", icon: StarIcon },
    ]),
  },
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
  const sections = useMemo(() => currentTab.build(), [currentTab]);

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
              {sections.map((section) => {
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
