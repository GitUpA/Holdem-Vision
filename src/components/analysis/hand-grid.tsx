"use client";

/**
 * Vision Hand Grid — 13x13 poker hand class grid.
 *
 * Preflop: highlights hero's hand, optional equity heatmap, position range overlay.
 * Postflop: colors each cell by whether it beats hero on the current board.
 */
import { useMemo, useState } from "react";
import { evaluateHand, compareHandRanks } from "../../../convex/lib/primitives/handEvaluator";
import { getPreflopEquity } from "../../../convex/lib/gto/preflopEquityTable";
import { GTO_RFI_RANGES } from "../../../convex/lib/gto/tables/preflopRanges";

const RL = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
const GRID_TO_RANK = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];

const POSITIONS = [
  { key: "utg", label: "UTG" },
  { key: "hj", label: "HJ" },
  { key: "co", label: "CO" },
  { key: "btn", label: "BTN" },
  { key: "sb", label: "SB" },
] as const;

interface GridCell {
  hc: string;
  row: number;
  col: number;
  type: "pair" | "suited" | "offsuit";
  isHero: boolean;
  isDead: boolean;
  beats: number;
  ties: number;
  loses: number;
  total: number;
  equity: number;
}

interface HandGridProps {
  heroCards: number[];
  communityCards?: number[];
}

function getHeroHandClass(heroCards: number[]): string {
  const r0 = Math.floor(heroCards[0] / 4);
  const r1 = Math.floor(heroCards[1] / 4);
  const suited = (heroCards[0] % 4) === (heroCards[1] % 4);
  const hi = Math.max(r0, r1);
  const lo = Math.min(r0, r1);
  const hLabel = RL[12 - hi];
  const lLabel = RL[12 - lo];
  if (hi === lo) return hLabel + lLabel;
  return hLabel + lLabel + (suited ? "s" : "o");
}

function computeGrid(heroCards: number[], communityCards: number[]) {
  const heroHC = getHeroHandClass(heroCards);
  const deadCards = new Set([...heroCards, ...communityCards]);
  const hasBoard = communityCards.length >= 3;
  const heroEval = hasBoard ? evaluateHand([...heroCards, ...communityCards]) : null;

  let totalBeats = 0, totalTies = 0, totalLoses = 0;

  const cells = RL.flatMap((_, row) =>
    RL.map((_, col) => {
      const type: "pair" | "suited" | "offsuit" = row === col ? "pair" : row < col ? "suited" : "offsuit";
      const hc = row === col ? RL[row] + RL[col]
        : row < col ? RL[row] + RL[col] + "s"
        : RL[col] + RL[row] + "o";
      const isHero = hc === heroHC;

      let beats = 0, ties = 0, loses = 0, total = 0;
      const rank1 = GRID_TO_RANK[row];
      const rank2 = GRID_TO_RANK[col];

      if (type === "pair") {
        for (let s1 = 0; s1 < 4; s1++) {
          for (let s2 = s1 + 1; s2 < 4; s2++) {
            const c1 = rank1 * 4 + s1;
            const c2 = rank1 * 4 + s2;
            if (deadCards.has(c1) || deadCards.has(c2)) continue;
            total++;
            if (hasBoard && heroEval) {
              const oppEval = evaluateHand([c1, c2, ...communityCards]);
              const cmp = compareHandRanks(oppEval.rank, heroEval.rank);
              if (cmp > 0) beats++; else if (cmp === 0) ties++; else loses++;
            }
          }
        }
      } else {
        const r1 = row < col ? rank1 : rank2;
        const r2 = row < col ? rank2 : rank1;
        for (let s1 = 0; s1 < 4; s1++) {
          for (let s2 = 0; s2 < 4; s2++) {
            if (type === "suited" && s1 !== s2) continue;
            if (type === "offsuit" && s1 === s2) continue;
            const c1 = r1 * 4 + s1;
            const c2 = r2 * 4 + s2;
            if (deadCards.has(c1) || deadCards.has(c2)) continue;
            total++;
            if (hasBoard && heroEval) {
              const oppEval = evaluateHand([c1, c2, ...communityCards]);
              const cmp = compareHandRanks(oppEval.rank, heroEval.rank);
              if (cmp > 0) beats++; else if (cmp === 0) ties++; else loses++;
            }
          }
        }
      }

      totalBeats += beats;
      totalTies += ties;
      totalLoses += loses;

      return { hc, row, col, type, isHero, isDead: total === 0, beats, ties, loses, total, equity: getPreflopEquity(hc) };
    })
  );

  return { cells, heroHC, heroEquity: getPreflopEquity(heroHC), totalBeats, totalTies, totalLoses, hasBoard };
}

export function HandGrid({ heroCards, communityCards }: HandGridProps) {
  const [showEquity, setShowEquity] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<string | null>(null);

  const data = useMemo(() => {
    if (!heroCards || heroCards.length < 2) return null;
    return computeGrid(heroCards, communityCards ?? []);
  }, [heroCards, communityCards]);

  // Get the range set for the selected position
  const positionRange = useMemo(() => {
    if (!selectedPosition) return null;
    return GTO_RFI_RANGES[selectedPosition] ?? null;
  }, [selectedPosition]);

  if (!data) return null;

  const { cells, heroEquity, totalBeats, totalTies, totalLoses, hasBoard } = data;
  const totalCombos = totalBeats + totalTies + totalLoses;

  // Count hands in selected range
  const rangeCount = positionRange ? cells.filter(c => positionRange.has(c.hc)).length : 0;

  return (
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
      {/* Primary header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-[var(--muted)]/30">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--gold-dim)]">
          Vision Hand Grid
        </h3>
        <div className="flex items-center gap-2">
          {hasBoard && totalCombos > 0 ? (
            <div className="flex gap-2 text-[10px]">
              <span className="text-red-400">{totalBeats} beat</span>
              <span className="text-yellow-400">{totalTies} tie</span>
              <span className="text-emerald-400">{totalLoses} win</span>
            </div>
          ) : (() => {
            const eq = heroEquity;
            const stronger = cells.filter(c => !c.isHero && !c.isDead && c.equity > eq).length;
            const same = cells.filter(c => !c.isHero && !c.isDead && Math.abs(c.equity - eq) < 0.005).length;
            const weaker = cells.filter(c => !c.isHero && !c.isDead && c.equity < eq).length;
            return (
              <div className="flex gap-2 text-[10px]">
                <span className="text-red-400">{stronger} stronger</span>
                <span className="text-yellow-400">{same} same</span>
                <span className="text-emerald-400">{weaker} weaker</span>
              </div>
            );
          })()}
          {!hasBoard && (
            <button
              onClick={() => setShowEquity(!showEquity)}
              className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                showEquity
                  ? "border-[var(--gold-dim)]/60 bg-[var(--gold)]/15 text-[var(--gold)]"
                  : "border-[var(--border)] text-muted-foreground hover:text-[var(--gold)] hover:border-[var(--gold-dim)]/40"
              }`}
            >
              Equity
            </button>
          )}
        </div>
      </div>

      {/* Position range bar */}
      {!hasBoard && (
        <div className="flex items-center gap-1.5 px-4 py-1.5 border-b border-[var(--border)]/50 bg-[var(--muted)]/15">
          <span className="text-[9px] text-muted-foreground mr-1">Range:</span>
          {POSITIONS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSelectedPosition(selectedPosition === key ? null : key)}
              className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                selectedPosition === key
                  ? "bg-[var(--gold)]/20 text-[var(--gold)] border border-[var(--gold-dim)]/50 font-semibold"
                  : "text-muted-foreground hover:text-foreground border border-transparent hover:border-[var(--border)]"
              }`}
            >
              {label}
            </button>
          ))}
          {selectedPosition && (
            <span className="text-[9px] text-muted-foreground ml-auto">
              {rangeCount} hands
            </span>
          )}
        </div>
      )}

      {/* Grid */}
      <div className="p-2">
        <div className="grid gap-px" style={{ gridTemplateColumns: "repeat(13, 1fr)" }}>
          {cells.map((cell) => (
            <Cell
              key={`${cell.row}-${cell.col}`}
              cell={cell}
              hasBoard={hasBoard}
              showEquity={showEquity}
              inRange={positionRange?.has(cell.hc) ?? false}
              showRange={selectedPosition !== null}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Cell({ cell, hasBoard, showEquity, inRange, showRange }: {
  cell: GridCell;
  hasBoard: boolean;
  showEquity: boolean;
  inRange: boolean;
  showRange: boolean;
}) {
  let bg: string;
  let txt: string;

  if (cell.isHero) {
    bg = "bg-blue-600";
    txt = "text-white font-bold";
  } else if (cell.isDead) {
    bg = "bg-muted/20";
    txt = "text-muted-foreground/30";
  } else if (!hasBoard && showEquity) {
    const eq = cell.equity;
    if (eq >= 0.75) { bg = "bg-red-600/60"; txt = "text-red-100"; }
    else if (eq >= 0.65) { bg = "bg-orange-600/50"; txt = "text-orange-100"; }
    else if (eq >= 0.58) { bg = "bg-amber-700/45"; txt = "text-amber-100"; }
    else if (eq >= 0.52) { bg = "bg-yellow-800/40"; txt = "text-yellow-200"; }
    else if (eq >= 0.46) { bg = "bg-emerald-900/35"; txt = "text-emerald-200"; }
    else if (eq >= 0.42) { bg = "bg-sky-900/30"; txt = "text-sky-200"; }
    else { bg = "bg-slate-800/40"; txt = "text-slate-400"; }
  } else if (!hasBoard) {
    bg = cell.type === "pair" ? "bg-amber-900/40"
      : cell.type === "suited" ? "bg-sky-900/30"
      : "bg-slate-800/50";
    txt = "text-muted-foreground";
  } else if (cell.total === 0) {
    bg = "bg-muted/20";
    txt = "text-muted-foreground/30";
  } else {
    const beatRatio = cell.beats / cell.total;
    const tieRatio = cell.ties / cell.total;

    if (beatRatio > 0.7) { bg = "bg-red-700/70"; txt = "text-red-100"; }
    else if (beatRatio > 0.4) { bg = "bg-red-900/50"; txt = "text-red-200"; }
    else if (tieRatio > 0.5) { bg = "bg-yellow-800/40"; txt = "text-yellow-200"; }
    else if (beatRatio > 0.1) { bg = "bg-orange-900/30"; txt = "text-orange-200"; }
    else { bg = "bg-emerald-900/30"; txt = "text-emerald-200"; }
  }

  // Range overlay: outline cells that are in the selected position's range
  const rangeBorder = showRange && !cell.isDead
    ? inRange
      ? "ring-2 ring-[var(--gold)] ring-inset"
      : "opacity-40"
    : "";

  const showEqLabel = !hasBoard && showEquity && !cell.isHero && !cell.isDead;

  const title = cell.isHero ? `Your hand: ${cell.hc} (${(cell.equity * 100).toFixed(0)}% equity)`
    : cell.isDead ? `${cell.hc}: blocked`
    : !hasBoard ? `${cell.hc}: ${(cell.equity * 100).toFixed(0)}% equity vs random${showRange ? (inRange ? " — IN RANGE" : " — out of range") : ""}`
    : cell.total === 0 ? `${cell.hc}: no combos`
    : `${cell.hc}: ${cell.beats}/${cell.total} beat you (${((cell.beats / cell.total) * 100).toFixed(0)}%)`;

  return (
    <div
      className={`${bg} ${txt} ${rangeBorder} leading-none flex flex-col items-center justify-center rounded-sm aspect-square select-none cursor-default transition-opacity`}
      title={title}
    >
      <span className="text-sm font-semibold">{cell.hc}</span>
      {showEqLabel && (
        <span className="text-[10px] opacity-75 mt-0.5">{(cell.equity * 100).toFixed(0)}%</span>
      )}
      {cell.isHero && !hasBoard && (
        <span className="text-[10px] opacity-85 mt-0.5">{(cell.equity * 100).toFixed(0)}%</span>
      )}
    </div>
  );
}
