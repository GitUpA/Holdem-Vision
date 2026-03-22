"use client";

/**
 * NarrativeFeedback — post-decision narrative coaching.
 *
 * After the user acts in quiz mode, shows:
 * 1. What their action "said" to opponents
 * 2. Whether their narrative choice aligned with their action
 * 3. How GTO differs (if it does)
 * 4. The teaching principle for this spot
 */

import { useMemo } from "react";
import type { GtoAction, ActionFrequencies } from "../../../convex/lib/gto/tables/types";
import type { NarrativeIntentId } from "../../../convex/lib/gto/narrativePrompts";
import type { ArchetypeId } from "../../../convex/lib/gto/archetypeClassifier";
import { buildNarrativeFeedback } from "../../../convex/lib/gto/narrativeFeedback";

interface NarrativeFeedbackProps {
  userAction: GtoAction;
  narrativeChoice: NarrativeIntentId | null;
  optimalAction: GtoAction;
  optimalFrequency: number;
  frequencies: ActionFrequencies;
  archetypeId?: ArchetypeId;
}

const ALIGNMENT_COLORS = {
  aligned: "text-green-400",
  mixed: "text-yellow-400",
  contradicted: "text-red-400",
} as const;

const ALIGNMENT_LABELS = {
  aligned: "Narrative aligned",
  mixed: "Partially aligned",
  contradicted: "Narrative contradicted",
} as const;

export function NarrativeFeedbackDisplay({
  userAction,
  narrativeChoice,
  optimalAction,
  optimalFrequency,
  frequencies,
  archetypeId,
}: NarrativeFeedbackProps) {
  const feedback = useMemo(
    () => buildNarrativeFeedback(
      userAction,
      narrativeChoice,
      optimalAction,
      optimalFrequency,
      frequencies,
      archetypeId,
    ),
    [userAction, narrativeChoice, optimalAction, optimalFrequency, frequencies, archetypeId],
  );

  return (
    <div className="space-y-2 border-l-2 border-[var(--gold)]/30 pl-3">
      {/* What your action said */}
      <p className="text-xs text-[var(--foreground)] leading-relaxed">
        {feedback.actionNarrative}
      </p>

      {/* Narrative alignment badge */}
      {feedback.narrativeAlignment && (
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-medium ${ALIGNMENT_COLORS[feedback.narrativeAlignment]}`}>
            {ALIGNMENT_LABELS[feedback.narrativeAlignment]}
          </span>
        </div>
      )}

      {/* GTO contrast */}
      {feedback.gtoContrastNarrative && (
        <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed">
          {feedback.gtoContrastNarrative}
        </p>
      )}

      {/* Teaching principle */}
      <p className="text-[10px] text-[var(--gold)]/70 italic leading-relaxed">
        {feedback.principleConnection}
      </p>
    </div>
  );
}
