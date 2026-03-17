"use client";

/**
 * ArchetypeTutorialDrawer — slide-in drawer showing detailed archetype-specific
 * tutorial content when an archetype is selected in drill mode (before starting).
 *
 * Pulls content from archetypePrototypes.ts (teaching narrative, feeling,
 * prototype hands, derivatives, board constraints).
 */

import type { ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { ArchetypeId, ArchetypeCategory } from "../../../convex/lib/gto/archetypeClassifier";
import { getPrototype } from "../../../convex/lib/gto/archetypePrototypes";
import type { ArchetypePrototype, DerivativeShift } from "../../../convex/lib/gto/archetypePrototypes";

// ── SVG helpers ──

function SvgIcon({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={cn("shrink-0", className)}>
      {children}
    </svg>
  );
}

// ── Icons ──

function BookOpenIcon({ className }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </SvgIcon>
  );
}

function LightbulbIcon({ className }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <line x1="9" y1="18" x2="15" y2="18" />
      <line x1="10" y1="22" x2="14" y2="22" />
      <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
    </SvgIcon>
  );
}

function CardsIcon({ className }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <rect x="2" y="4" width="8" height="12" rx="1" />
      <rect x="14" y="4" width="8" height="12" rx="1" />
    </SvgIcon>
  );
}

function GridIcon({ className }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </SvgIcon>
  );
}

function MapPinIcon({ className }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </SvgIcon>
  );
}

function GitBranchIcon({ className }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </SvgIcon>
  );
}

// ── Distance badge ──

const DISTANCE_LABELS: Record<DerivativeShift["distance"], { label: string; color: string }> = {
  near: { label: "Near", color: "text-green-400 bg-green-400/10 border-green-400/20" },
  mid: { label: "Mid", color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20" },
  far: { label: "Far", color: "text-red-400 bg-red-400/10 border-red-400/20" },
};

// ── Category labels ──

const CATEGORY_LABELS: Record<ArchetypeCategory, string> = {
  preflop: "Preflop",
  flop_texture: "Flop Texture",
  postflop_principle: "Postflop",
};

// ── Format hand category for display ──

function formatHandCategory(cat: string): string {
  return cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Format board constraints ──

function describeConstraints(proto: ArchetypePrototype): string[] {
  const bc = proto.boardConstraints;
  if (!bc) return [];
  const lines: string[] = [];
  if (bc.requireDry) lines.push("Dry texture (rainbow, disconnected)");
  if (bc.requireWet) lines.push("Wet texture (draw-heavy)");
  if (bc.requirePaired) lines.push("Board must be paired");
  if (bc.requireUnpaired) lines.push("Board must not be paired");
  if (bc.requireBrickedDraw) lines.push("A draw must have bricked");
  if (bc.preferredTextures?.length) {
    lines.push(`Preferred: ${bc.preferredTextures.map((t) => t.replace(/_/g, " ")).join(", ")}`);
  }
  return lines;
}

// ── Format position ──

function describePosition(proto: ArchetypePrototype): string | null {
  const parts: string[] = [];
  if (proto.preferredPosition) {
    parts.push(`Preferred position: ${proto.preferredPosition.toUpperCase()}`);
  }
  if (proto.preferInPosition === true) {
    parts.push("Hero should be in position (IP)");
  } else if (proto.preferInPosition === false) {
    parts.push("Hero should be out of position (OOP)");
  }
  return parts.length ? parts.join(". ") : null;
}

// ── Main component ──

interface ArchetypeTutorialDrawerProps {
  open: boolean;
  onClose: () => void;
  archetypeId: ArchetypeId | null;
  /** Label and category from the workspace-shell archetype list */
  label?: string;
  category?: ArchetypeCategory;
}

export function ArchetypeTutorialDrawer({
  open,
  onClose,
  archetypeId,
  label,
  category,
}: ArchetypeTutorialDrawerProps) {
  const proto = archetypeId ? getPrototype(archetypeId) : undefined;
  const displayName = proto?.name ?? label ?? archetypeId?.replace(/_/g, " ") ?? "";
  const categoryLabel = category ? CATEGORY_LABELS[category] : "";

  return (
    <AnimatePresence>
      {open && archetypeId && (
        <>
          {/* No backdrop — drawer stays open while user browses archetypes */}

          {/* Drawer */}
          <motion.div
            className="fixed top-0 right-0 h-full w-[450px] max-w-[90vw] z-50 bg-[var(--card)] border-l border-[var(--border)] shadow-xl flex flex-col"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 bg-[var(--card)] border-b border-[var(--border)] px-5 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <h2 className="text-sm font-bold text-[var(--gold)]">{displayName}</h2>
                  {categoryLabel && (
                    <span className="text-[9px] px-2 py-0.5 rounded-full bg-[var(--gold)]/10 text-[var(--gold)] border border-[var(--gold)]/20 font-medium">
                      {categoryLabel}
                    </span>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors px-2 py-1 rounded hover:bg-[var(--muted)]"
                >
                  Close
                </button>
              </div>
              {proto?.concept && (
                <p className="text-[11px] text-[var(--muted-foreground)] mt-1.5 leading-relaxed">
                  {proto.concept}
                </p>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

              {proto && (
                <>
                  {/* Overview — teaching narrative */}
                  <Section icon={<BookOpenIcon className="text-[var(--gold-dim)]" />} title="Overview">
                    <p className="text-[11px] text-[var(--foreground)]/80 leading-relaxed whitespace-pre-line">
                      {proto.teaching}
                    </p>
                  </Section>

                  {/* Key Insight — feeling quote */}
                  <div className="flex gap-3 p-3 rounded-lg bg-[var(--gold)]/5 border border-[var(--gold-dim)]/20">
                    <LightbulbIcon className="text-[var(--gold)] mt-0.5" />
                    <div>
                      <span className="text-[10px] font-semibold text-[var(--gold)] uppercase tracking-wider">Key Insight</span>
                      <p className="text-[11px] text-[var(--foreground)] italic leading-relaxed mt-1">
                        &ldquo;{proto.feeling}&rdquo;
                      </p>
                    </div>
                  </div>

                  {/* Core Hands */}
                  <Section icon={<CardsIcon className="text-[var(--gold-dim)]" />} title="Core Hands">
                    <div className="flex flex-wrap gap-1.5">
                      {proto.prototypeHands.map((h) => (
                        <span key={h} className="text-[10px] px-2 py-0.5 rounded-md bg-[var(--gold)]/10 text-[var(--gold)] border border-[var(--gold)]/20 font-medium">
                          {formatHandCategory(h)}
                        </span>
                      ))}
                    </div>
                    {proto.acceptableHands.length > 0 && (
                      <div className="mt-2.5">
                        <span className="text-[10px] text-[var(--muted-foreground)] font-medium">Acceptable range:</span>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {proto.acceptableHands.map((h) => (
                            <span key={h} className="text-[10px] px-2 py-0.5 rounded-md bg-[var(--muted)] text-[var(--muted-foreground)] border border-[var(--border)] font-medium">
                              {formatHandCategory(h)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </Section>

                  {/* Board Characteristics */}
                  {describeConstraints(proto).length > 0 && (
                    <Section icon={<GridIcon className="text-[var(--gold-dim)]" />} title="Board Characteristics">
                      <ul className="space-y-1">
                        {describeConstraints(proto).map((line, i) => (
                          <li key={i} className="flex gap-2 text-[11px] text-[var(--foreground)]/80">
                            <span className="text-[var(--gold-dim)] mt-0.5">•</span>
                            {line}
                          </li>
                        ))}
                      </ul>
                    </Section>
                  )}

                  {/* Position Note */}
                  {describePosition(proto) && (
                    <Section icon={<MapPinIcon className="text-[var(--gold-dim)]" />} title="Position">
                      <p className="text-[11px] text-[var(--foreground)]/80 leading-relaxed">
                        {describePosition(proto)}
                      </p>
                    </Section>
                  )}

                  {/* Variants & Lessons */}
                  {proto.derivatives.length > 0 && (
                    <Section icon={<GitBranchIcon className="text-[var(--gold-dim)]" />} title="Variants & Lessons">
                      <div className="space-y-3">
                        {proto.derivatives.map((d, i) => {
                          const dist = DISTANCE_LABELS[d.distance];
                          return (
                            <div key={i} className="rounded-lg border border-[var(--border)] p-3 space-y-1.5">
                              <div className="flex items-center gap-2">
                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold border ${dist.color}`}>
                                  {dist.label}
                                </span>
                                <span className="text-[11px] text-[var(--foreground)]/80">{d.description}</span>
                              </div>
                              <p className="text-[10px] text-[var(--muted-foreground)] italic leading-relaxed pl-0.5">
                                Teaches: {d.lesson}
                              </p>
                              {d.hands && d.hands.length > 0 && (
                                <div className="flex flex-wrap gap-1 pt-0.5">
                                  {d.hands.map((h) => (
                                    <span key={h} className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--muted)] text-[var(--muted-foreground)] border border-[var(--border)]">
                                      {formatHandCategory(h)}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </Section>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Section wrapper ──

function Section({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-xs font-semibold text-[var(--foreground)]">{title}</h3>
      </div>
      <div className="pl-6">{children}</div>
    </div>
  );
}
