"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Street } from "../../../convex/lib/types/cards";

interface StreetControlsProps {
  street: Street;
  heroCardCount: number;
  communityCardCount: number;
  onDealFlop: () => void;
  onDealTurn: () => void;
  onDealRiver: () => void;
  onNewHand: () => void;
}

export function StreetControls({
  street,
  heroCardCount,
  communityCardCount,
  onDealFlop,
  onDealTurn,
  onDealRiver,
  onNewHand,
}: StreetControlsProps) {
  const canDealFlop = heroCardCount === 2 && communityCardCount === 0;
  const canDealTurn = communityCardCount === 3;
  const canDealRiver = communityCardCount === 4;
  const hasAnyCards = heroCardCount > 0 || communityCardCount > 0;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Street indicator */}
      <div className="flex items-center gap-1 mr-2">
        {(["preflop", "flop", "turn", "river"] as Street[]).map((s) => (
          <span
            key={s}
            className={cn(
              "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full transition-colors",
              s === street
                ? "bg-[var(--felt)] text-[var(--gold)] border border-[var(--gold-dim)]/40"
                : "text-[var(--muted-foreground)]/50",
            )}
          >
            {s}
          </span>
        ))}
      </div>

      <div className="h-4 w-px bg-[var(--border)]" />

      {/* Action buttons */}
      <Button
        variant="outline"
        size="sm"
        onClick={onDealFlop}
        disabled={!canDealFlop}
        className="text-xs h-7"
      >
        Deal Flop
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onDealTurn}
        disabled={!canDealTurn}
        className="text-xs h-7"
      >
        Deal Turn
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onDealRiver}
        disabled={!canDealRiver}
        className="text-xs h-7"
      >
        Deal River
      </Button>

      <div className="h-4 w-px bg-[var(--border)]" />

      <Button
        variant="destructive"
        size="sm"
        onClick={onNewHand}
        disabled={!hasAnyCards}
        className="text-xs h-7"
      >
        New Hand
      </Button>
    </div>
  );
}
