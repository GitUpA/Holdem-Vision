"use client";

/**
 * DrillActionPanel — large GTO-style action buttons for drill mode.
 *
 * Only shows actions from the archetype's frequency table.
 * Optimized for fast repetition — no slider, just tap.
 */
import { gtoActionLabel } from "../../../convex/lib/gto/actionMapping";
import type { GtoAction } from "../../../convex/lib/gto/tables/types";

interface DrillActionPanelProps {
  availableActions: GtoAction[];
  onAct: (action: GtoAction) => void;
  disabled?: boolean;
}

const ACTION_COLORS: Record<GtoAction, string> = {
  fold: "border-red-500/40 text-red-400 hover:bg-red-500/10",
  check: "border-green-500/40 text-green-400 hover:bg-green-500/10",
  call: "border-green-500/40 text-green-400 hover:bg-green-500/10",
  bet_small: "border-blue-400/40 text-blue-400 hover:bg-blue-400/10",
  bet_medium: "border-blue-500/40 text-blue-300 hover:bg-blue-500/10",
  bet_large: "border-purple-500/40 text-purple-400 hover:bg-purple-500/10",
  raise_small: "border-amber-500/40 text-amber-400 hover:bg-amber-500/10",
  raise_large: "border-orange-500/40 text-orange-400 hover:bg-orange-500/10",
};

export function DrillActionPanel({
  availableActions,
  onAct,
  disabled = false,
}: DrillActionPanelProps) {
  if (availableActions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {availableActions.map((action) => (
        <button
          key={action}
          onClick={() => onAct(action)}
          disabled={disabled}
          className={`
            px-5 py-3 rounded-lg border font-semibold text-sm
            transition-all duration-150
            ${ACTION_COLORS[action] ?? "border-[var(--border)] text-[var(--foreground)]"}
            ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer active:scale-95"}
          `}
        >
          {gtoActionLabel(action)}
        </button>
      ))}
    </div>
  );
}
