"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { LegalActions, ActionType } from "../../../convex/lib/state/game-state";
import type { PotState } from "../../../convex/lib/state/game-state";
import type { BlindStructure } from "../../../convex/lib/types/game";

interface ActionPanelProps {
  legalActions: LegalActions;
  pot: PotState;
  heroStack: number;
  blinds: BlindStructure;
  onAct: (actionType: ActionType, amount?: number) => void;
}

const SIZING_PRESETS = [
  { label: "1/3", pct: 0.33 },
  { label: "1/2", pct: 0.5 },
  { label: "2/3", pct: 0.67 },
  { label: "Pot", pct: 1.0 },
];

export function ActionPanel({
  legalActions,
  pot,
  heroStack: _heroStack,
  blinds,
  onAct,
}: ActionPanelProps) {
  const [showSizing, setShowSizing] = useState(false);
  const [sizingAction, setSizingAction] = useState<"bet" | "raise">("bet");
  const [amount, setAmount] = useState(0);

  const bb = blinds.big;

  // Pot odds when facing a bet
  const potOdds = useMemo(() => {
    if (!legalActions.canCall || legalActions.callAmount <= 0) return null;
    const totalPot = pot.total + legalActions.callAmount;
    const ratio = totalPot / legalActions.callAmount;
    return { potTotal: pot.total, callAmt: legalActions.callAmount, ratio };
  }, [legalActions, pot.total]);

  const openSizing = (action: "bet" | "raise") => {
    setSizingAction(action);
    const min = action === "bet" ? legalActions.betMin : legalActions.raiseMin;
    setAmount(min);
    setShowSizing(true);
  };

  const submitSizing = () => {
    onAct(sizingAction, amount);
    setShowSizing(false);
  };

  const min = sizingAction === "bet" ? legalActions.betMin : legalActions.raiseMin;
  const max = sizingAction === "bet" ? legalActions.betMax : legalActions.raiseMax;

  const formatBB = (chips: number) => {
    const bbs = chips / bb;
    return bbs % 1 === 0 ? `${bbs}` : bbs.toFixed(1);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-2"
    >
      {/* Pot odds info */}
      {potOdds && (
        <div className="flex items-center gap-3 text-[10px] text-[var(--muted-foreground)] px-1">
          <span>Pot: {formatBB(potOdds.potTotal)} BB</span>
          <span>Call: {formatBB(potOdds.callAmt)} BB</span>
          <span className="text-[var(--gold-dim)]">
            Odds: {potOdds.ratio.toFixed(1)}:1
          </span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {legalActions.canFold && (
          <ActionButton
            label="Fold"
            color="text-gray-400 border-gray-600 hover:bg-gray-800"
            onClick={() => onAct("fold")}
          />
        )}
        {legalActions.canCheck && (
          <ActionButton
            label="Check"
            color="text-blue-300 border-blue-600 hover:bg-blue-900/40"
            onClick={() => onAct("check")}
          />
        )}
        {legalActions.canCall && (
          <ActionButton
            label={`Call ${formatBB(legalActions.callAmount)}${legalActions.isCallAllIn ? " (AI)" : ""}`}
            color="text-green-300 border-green-600 hover:bg-green-900/40"
            onClick={() => onAct("call")}
          />
        )}
        {legalActions.canBet && (
          <ActionButton
            label="Bet"
            color="text-amber-300 border-amber-600 hover:bg-amber-900/40"
            onClick={() => openSizing("bet")}
            active={showSizing && sizingAction === "bet"}
          />
        )}
        {legalActions.canRaise && (
          <ActionButton
            label="Raise"
            color="text-red-300 border-red-600 hover:bg-red-900/40"
            onClick={() => openSizing("raise")}
            active={showSizing && sizingAction === "raise"}
          />
        )}
      </div>

      {/* Sizing panel */}
      {showSizing && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="space-y-2 bg-[var(--muted)]/30 rounded-lg p-3 border border-[var(--border)]"
        >
          {/* Preset buttons */}
          <div className="flex items-center gap-1.5">
            {SIZING_PRESETS.map(({ label, pct }) => {
              const presetAmt =
                sizingAction === "bet"
                  ? Math.round(pct * pot.total)
                  : Math.round(legalActions.callAmount + (pct * pot.total));
              const clamped = Math.max(min, Math.min(presetAmt, max));
              return (
                <button
                  key={label}
                  onClick={() => setAmount(clamped)}
                  className={cn(
                    "text-[10px] font-medium px-2 py-1 rounded border transition-colors",
                    amount === clamped
                      ? "bg-[var(--felt)] text-[var(--gold)] border-[var(--gold-dim)]/40"
                      : "text-[var(--muted-foreground)] border-[var(--border)] hover:text-[var(--foreground)]",
                  )}
                >
                  {label}
                </button>
              );
            })}
            <button
              onClick={() => setAmount(max)}
              className={cn(
                "text-[10px] font-medium px-2 py-1 rounded border transition-colors",
                amount === max
                  ? "bg-red-900/40 text-red-300 border-red-600"
                  : "text-[var(--muted-foreground)] border-[var(--border)] hover:text-red-300",
              )}
            >
              All-in
            </button>
          </div>

          {/* Slider + input */}
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={min}
              max={max}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="flex-1 accent-[var(--gold)]"
            />
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={min}
                max={max}
                value={amount}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (v >= min && v <= max) setAmount(v);
                }}
                className="w-16 text-xs text-center bg-[var(--card)] border border-[var(--border)] rounded px-1 py-1 text-[var(--foreground)]"
              />
              <span className="text-[10px] text-[var(--muted-foreground)]">
                ({formatBB(amount)} BB)
              </span>
            </div>
          </div>

          {/* Submit */}
          <div className="flex items-center gap-2">
            <button
              onClick={submitSizing}
              className="text-xs font-semibold px-4 py-1.5 rounded bg-[var(--felt)] text-[var(--gold)] border border-[var(--gold-dim)]/40 hover:border-[var(--gold)]/60 transition-colors"
            >
              {sizingAction === "bet" ? "Bet" : "Raise to"} {formatBB(amount)} BB
            </button>
            <button
              onClick={() => setShowSizing(false)}
              className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] px-2 py-1"
            >
              Cancel
            </button>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

function ActionButton({
  label,
  color,
  onClick,
  active,
}: {
  label: string;
  color: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className={cn(
        "text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors",
        color,
        active && "ring-1 ring-[var(--gold)]/40",
      )}
    >
      {label}
    </motion.button>
  );
}
