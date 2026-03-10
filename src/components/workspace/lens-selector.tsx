"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface LensInfo {
  id: string;
  name: string;
  description: string;
}

interface LensSelectorProps {
  availableLenses: LensInfo[];
  activeLensIds: string[];
  onToggle: (id: string) => void;
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

const LENS_ICONS: Record<string, ReactNode> = {
  "raw-equity": (
    // Layers — hand strength tiers
    <Icon>
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </Icon>
  ),
  "monte-carlo": (
    // Activity/pulse — simulation
    <Icon>
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </Icon>
  ),
  threats: (
    // Shield alert — threats
    <Icon>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </Icon>
  ),
  outs: (
    // Crosshair — targeting outs
    <Icon>
      <circle cx="12" cy="12" r="10" />
      <line x1="22" y1="12" x2="18" y2="12" />
      <line x1="6" y1="12" x2="2" y2="12" />
      <line x1="12" y1="6" x2="12" y2="2" />
      <line x1="12" y1="22" x2="12" y2="18" />
    </Icon>
  ),
  draws: (
    // Trending up — draw potential
    <Icon>
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </Icon>
  ),
  "opponent-read": (
    // Eye — reading opponents
    <Icon>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  ),
  coaching: (
    // Graduation cap — coaching/learning
    <Icon>
      <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
      <path d="M6 12v5c3 3 10 3 12 0v-5" />
    </Icon>
  ),
};

const DEFAULT_ICON = (
  // Search — fallback
  <Icon>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </Icon>
);

export function LensSelector({ availableLenses, activeLensIds, onToggle }: LensSelectorProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {availableLenses.map((lens) => {
        const isActive = activeLensIds.includes(lens.id);
        return (
          <button
            key={lens.id}
            onClick={() => onToggle(lens.id)}
            title={lens.description}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all border",
              isActive
                ? "bg-[var(--felt)] border-[var(--gold-dim)]/40 text-[var(--gold)] shadow-sm"
                : "bg-transparent border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--muted-foreground)]/40 hover:text-[var(--foreground)]",
            )}
          >
            {LENS_ICONS[lens.id] ?? DEFAULT_ICON}
            <span>{lens.name}</span>
          </button>
        );
      })}
    </div>
  );
}
