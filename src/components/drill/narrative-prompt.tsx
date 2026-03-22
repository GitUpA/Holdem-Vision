"use client";

/**
 * NarrativePrompt — "What's your story here?"
 *
 * Shows 2-3 narrative options before the user acts in quiz mode.
 * Practices retrieval — the user constructs their narrative before
 * seeing the GTO answer. Optional — user can skip and act directly.
 */

import { useMemo } from "react";
import type { HandCategorization } from "../../../convex/lib/gto/handCategorizer";
import type { ActionFrequencies } from "../../../convex/lib/gto/tables/types";
import {
  buildNarrativePrompt,
  type NarrativeIntentId,
} from "../../../convex/lib/gto/narrativePrompts";

interface NarrativePromptProps {
  handCategory: HandCategorization;
  isInPosition: boolean;
  isPreflop: boolean;
  frequencies: ActionFrequencies;
  selectedIntent: NarrativeIntentId | null;
  onSelect: (id: NarrativeIntentId) => void;
}

export function NarrativePrompt({
  handCategory,
  isInPosition,
  isPreflop,
  frequencies,
  selectedIntent,
  onSelect,
}: NarrativePromptProps) {
  const prompt = useMemo(
    () => buildNarrativePrompt(handCategory, isInPosition, isPreflop, frequencies),
    [handCategory, isInPosition, isPreflop, frequencies],
  );

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-[var(--gold)]">
        {prompt.question}
      </p>

      <div className="space-y-1.5">
        {prompt.options.map((option) => {
          const isSelected = selectedIntent === option.id;
          return (
            <button
              key={option.id}
              onClick={() => onSelect(option.id)}
              className={`
                w-full text-left px-3 py-2 rounded-lg border text-xs transition-all
                ${isSelected
                  ? "border-[var(--gold)] bg-[var(--gold)]/10 text-[var(--foreground)]"
                  : "border-[var(--border)] bg-[var(--card)]/50 text-[var(--muted-foreground)] hover:border-[var(--gold-dim)] hover:text-[var(--foreground)]"
                }
              `}
            >
              <span className="font-medium">{option.label}</span>
              {isSelected && (
                <p className="mt-1 text-[10px] text-[var(--muted-foreground)] leading-relaxed">
                  {option.detail}
                </p>
              )}
            </button>
          );
        })}
      </div>

      {!selectedIntent && (
        <p className="text-[10px] text-[var(--muted-foreground)] italic">
          Pick your narrative, then choose your action below
        </p>
      )}
    </div>
  );
}
