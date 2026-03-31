"use client";

/**
 * Vision Hand Grid — 13x13 poker hand class grid.
 *
 * Thin rendering wrapper over the pure computation pipeline in preflopGrid.ts.
 * Preflop: equity heatmap, position range overlays, facing classification.
 * Postflop: colors each cell by whether it beats hero on the current board.
 */
import { useMemo, useState, useEffect } from "react";
import { evaluateHand, compareHandRanks } from "../../../convex/lib/primitives/handEvaluator";
import { getPreflopEquity } from "../../../convex/lib/gto/preflopEquityTable";
import { GTO_RFI_RANGES } from "../../../convex/lib/gto/tables/preflopRanges";
import {
  computePreflopHandGrid,
  type PreflopGridResult,
  type PreflopGridCell,
  type SizingRole,
} from "../../../convex/lib/analysis/preflopGrid";
import { computeHandGrid, type HandClassGridCell } from "../../../convex/lib/analysis/handGrid";
import type { CardIndex, Position } from "../../../convex/lib/types/cards";

// ═══════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════

const RL = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
const GRID_TO_RANK = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
const POSITIONS = [
  { key: "utg", label: "UTG" },
  { key: "hj", label: "HJ" },
  { key: "co", label: "CO" },
  { key: "btn", label: "BTN" },
  { key: "sb", label: "SB" },
] as const;
const RANGE_PCT: Record<string, number> = { utg: 15, hj: 19, co: 27, btn: 44, sb: 40 };

const FACING_COLOR: Record<SizingRole, string> = {
  V: "text-green-400", M: "text-slate-400", B: "text-amber-300", F: "text-red-400/60",
};
const ROLE_LABEL: Record<SizingRole, string> = {
  V: "Value", M: "Mixed", B: "Bluff-catch", F: "Fold",
};

function getHeroHandClass(heroCards: number[]): string {
  const r0 = Math.floor(heroCards[0] / 4); const r1 = Math.floor(heroCards[1] / 4);
  const suited = (heroCards[0] % 4) === (heroCards[1] % 4);
  const hi = Math.max(r0, r1); const lo = Math.min(r0, r1);
  return RL[12 - hi] + (hi === lo ? RL[12 - lo] : RL[12 - lo] + (suited ? "s" : "o"));
}

// ═══════════════════════════════════════════════════════
// PROPS
// ═══════════════════════════════════════════════════════

interface PreflopAction {
  position: string;
  actionType: string;
  amount?: number;
}

interface HandGridProps {
  heroCards: number[];
  communityCards?: number[];
  heroPosition?: string;
  facingBetBB?: number;
  facingPosition?: string;
  preflopActions?: PreflopAction[];
}

// ═══════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════

export function HandGrid({ heroCards, communityCards, heroPosition, facingBetBB = 0, facingPosition, preflopActions }: HandGridProps) {
  const [showEquity, setShowEquity] = useState(true);
  const [selectedPositions, setSelectedPositions] = useState<string[]>([]);
  const [facingSizingBB, setFacingSizingBB] = useState(0);
  const [showFacing, setShowFacing] = useState(false);
  const [autoDefaultsApplied, setAutoDefaultsApplied] = useState(false);

  // Reset on new hand
  useEffect(() => { setAutoDefaultsApplied(false); }, [heroCards[0], heroCards[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-defaults
  useEffect(() => {
    if (autoDefaultsApplied) return;
    const hPos = heroPosition && !["bb"].includes(heroPosition) ? heroPosition : null;
    if (facingBetBB > 0 && facingPosition) {
      setFacingSizingBB(facingBetBB);
      setShowFacing(true);
      const positions: string[] = [];
      if (hPos) positions.push(hPos);
      if (facingPosition !== hPos) positions.push(facingPosition);
      setSelectedPositions(positions);
      setAutoDefaultsApplied(true);
    } else if (facingBetBB > 0) {
      setFacingSizingBB(facingBetBB);
      setShowFacing(true);
    }
  }, [facingBetBB, facingPosition, heroPosition, autoDefaultsApplied]);

  const community = communityCards ?? [];
  const hasBoard = community.length >= 3;
  const heroPos = heroPosition && !["bb"].includes(heroPosition) ? heroPosition : null;

  // ── PREFLOP: use pure pipeline ──
  const preflopResult = useMemo<PreflopGridResult | null>(() => {
    if (hasBoard || !heroCards || heroCards.length < 2) return null;
    return computePreflopHandGrid({
      heroCards: heroCards as CardIndex[],
      heroPosition: (heroPosition ?? "btn") as Position,
      openerPosition: (facingPosition ?? undefined) as Position | undefined,
      openerSizingBB: facingBetBB,
    }, 0); // 0 trials = use static equity (no MC yet)
  }, [heroCards, heroPosition, hasBoard, facingBetBB, facingPosition]);

  // ── POSTFLOP: local computation ──
  const postflopData = useMemo(() => {
    if (!hasBoard || !heroCards || heroCards.length < 2) return null;
    return computeHandGrid(heroCards as CardIndex[], community as CardIndex[]);
  }, [heroCards, community, hasBoard]);

  // ── RANGE OVERLAYS (preflop only) ──
  const ranges = useMemo(() => {
    return selectedPositions.map(pos => ({ pos, range: GTO_RFI_RANGES[pos] })).filter(r => r.range);
  }, [selectedPositions]);

  const opponentRangeEntry = useMemo(() => ranges.find(r => r.pos !== heroPos) ?? null, [ranges, heroPos]);

  // ── ASYNC EQUITY VS RANGE (MC in chunks) ──
  const [equityCache] = useState(() => new Map<string, Map<string, number>>());
  const [equityVsRange, setEquityVsRange] = useState<Map<string, number> | null>(null);
  const [equityComputing, setEquityComputing] = useState(false);
  const [equityProgress, setEquityProgress] = useState(0);

  useEffect(() => {
    const oppPos = opponentRangeEntry?.pos;
    const oppRange = opponentRangeEntry?.range;
    if (!oppRange || !oppPos || oppRange.size === 0) {
      setEquityVsRange(null); setEquityComputing(false); setEquityProgress(0); return;
    }
    const cached = equityCache.get(oppPos);
    if (cached) { setEquityVsRange(cached); setEquityComputing(false); setEquityProgress(169); return; }

    setEquityComputing(true); setEquityProgress(0);
    // Use pipeline's computeEquityGrid but in chunks via requestAnimationFrame
    const oppCombos: [number, number][] = [];
    for (const hc of oppRange) {
      const isP = hc.length === 2; const isS = hc.endsWith("s");
      const r1 = 12 - RL.indexOf(hc[0]); const r2 = 12 - RL.indexOf(hc[1]);
      if (isP) { for (let s1 = 0; s1 < 4; s1++) for (let s2 = s1 + 1; s2 < 4; s2++) oppCombos.push([r1*4+s1, r1*4+s2]); }
      else { for (let s1 = 0; s1 < 4; s1++) for (let s2 = 0; s2 < 4; s2++) { if (isS && s1!==s2) continue; if (!isS && s1===s2) continue; oppCombos.push([r1*4+s1, r2*4+s2]); } }
    }
    if (oppCombos.length === 0) return;

    const work: { hc: string; rank1: number; rank2: number; type: string }[] = [];
    for (let row = 0; row < 13; row++) for (let col = 0; col < 13; col++) {
      const type = row === col ? "pair" : row < col ? "suited" : "offsuit";
      const hc = row === col ? RL[row]+RL[col] : row < col ? RL[row]+RL[col]+"s" : RL[col]+RL[row]+"o";
      work.push({ hc, rank1: GRID_TO_RANK[row], rank2: GRID_TO_RANK[col], type });
    }
    const result = new Map<string, number>(); let idx = 0; let cancelled = false;
    function processChunk() {
      if (cancelled) return;
      const end = Math.min(idx + 13, work.length);
      for (; idx < end; idx++) {
        const { hc, rank1, rank2, type } = work[idx];
        let c1: number, c2: number;
        if (type === "pair") { c1 = rank1*4; c2 = rank1*4+1; }
        else if (type === "suited") { c1 = rank1*4; c2 = rank2*4; }
        else { c1 = rank1*4; c2 = rank2*4+1; }
        const dead = new Set([c1, c2]);
        const valid = oppCombos.filter(([a,b]) => !dead.has(a) && !dead.has(b));
        if (valid.length === 0) { result.set(hc, 0.5); continue; }
        const deck: number[] = []; for (let i = 0; i < 52; i++) if (!dead.has(i)) deck.push(i);
        let wins = 0, total = 0;
        for (let t = 0; t < 300; t++) {
          const opp = valid[Math.floor(Math.random() * valid.length)];
          const avail = deck.filter(c => c !== opp[0] && c !== opp[1]);
          if (avail.length < 5) continue;
          for (let i = avail.length-1; i > avail.length-6; i--) { const j = Math.floor(Math.random()*(i+1)); [avail[i],avail[j]]=[avail[j],avail[i]]; }
          const board = avail.slice(avail.length-5);
          const hEval = evaluateHand([c1,c2,...board] as CardIndex[]); const oEval = evaluateHand([opp[0],opp[1],...board] as CardIndex[]);
          const cmp = compareHandRanks(hEval.rank, oEval.rank);
          if (cmp > 0) wins++; else if (cmp === 0) wins += 0.5; total++;
        }
        result.set(hc, total > 0 ? wins/total : 0.5);
      }
      setEquityProgress(idx);
      if (idx < work.length) requestAnimationFrame(processChunk);
      else { const final = new Map(result); equityCache.set(oppPos!, final); setEquityVsRange(final); setEquityComputing(false); }
    }
    requestAnimationFrame(processChunk);
    return () => { cancelled = true; };
  }, [ranges]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── POSITION LABELS ──
  const positionLabels = useMemo(() => {
    const labels = new Map<string, string>();
    if (!preflopActions) return labels;
    for (const a of preflopActions) {
      if (a.actionType === "fold") { labels.set(a.position, "Fold"); }
      else if (a.actionType === "raise" || a.actionType === "bet") {
        const amt = a.amount ? a.amount.toFixed(0) : "?";
        const priorRaises = preflopActions.filter(p => (p.actionType === "raise" || p.actionType === "bet") && preflopActions.indexOf(p) < preflopActions.indexOf(a)).length;
        labels.set(a.position, `${priorRaises === 0 ? "Open" : priorRaises === 1 ? "3bet" : "4bet"} ${amt}`);
      } else if (a.actionType === "call") { labels.set(a.position, "Call"); }
      else if (a.actionType === "check") { labels.set(a.position, "Check"); }
    }
    return labels;
  }, [preflopActions]);

  // ── TOGGLE LOGIC ──
  const togglePosition = (key: string) => {
    setSelectedPositions(prev => {
      if (key === heroPos) { if (prev.includes(key)) return prev.filter(p => p !== key); const other = prev.find(p => p !== heroPos); return other ? [heroPos, other] : [heroPos]; }
      if (prev.includes(key)) return prev.filter(p => p !== key);
      if (heroPos) return [heroPos, key];
      return [key];
    });
  };

  if (!heroCards || heroCards.length < 2) return null;

  const primary = ranges[0] ?? null;
  const secondary = ranges[1] ?? null;
  const hasRangeEquity = equityVsRange !== null;

  // ═══════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════

  if (hasBoard && postflopData) {
    // POSTFLOP RENDER
    const { grid, totalBeats, totalTies, totalLoses } = postflopData;
    const totalCombos = totalBeats + totalTies + totalLoses;
    return (
      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-[var(--muted)]/30">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--gold-dim)]">Vision Hand Grid</h3>
          {totalCombos > 0 && (
            <div className="flex gap-2 text-[10px]">
              <span className="text-red-400">{totalBeats} beat</span>
              <span className="text-yellow-400">{totalTies} tie</span>
              <span className="text-emerald-400">{totalLoses} win</span>
            </div>
          )}
        </div>
        <div className="p-2">
          <div className="grid gap-px" style={{ gridTemplateColumns: "repeat(13, 1fr)" }}>
            {grid.map(row => row.map(cell => <PostflopCellView key={`${cell.row}-${cell.col}`} cell={cell} />))}
          </div>
        </div>
      </div>
    );
  }

  // PREFLOP RENDER
  const heroHandClass = getHeroHandClass(heroCards);
  const heroEquityVsRandom = getPreflopEquity(heroHandClass);
  const heroEquity = (hasRangeEquity ? equityVsRange!.get(heroHandClass) : null) ?? heroEquityVsRandom;

  // Build display cells from pipeline result + async equity overlay
  const displayCells = preflopResult?.cells ?? [];

  return (
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
      {/* Header 1: Title + stats */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-[var(--muted)]/30">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--gold-dim)] flex items-center gap-2">
          Vision Hand Grid
          {equityComputing && <span className="text-[8px] font-normal text-muted-foreground animate-pulse">computing {Math.round((equityProgress/169)*100)}%</span>}
        </h3>
        <div className="flex items-center gap-2">
          {(() => {
            const eq = heroEquity;
            const stronger = displayCells.filter(c => !c.isHero && c.equity > eq).length;
            const same = displayCells.filter(c => !c.isHero && Math.abs(c.equity - eq) < 0.005).length;
            const weaker = displayCells.filter(c => !c.isHero && c.equity < eq).length;
            return (
              <div className="flex gap-2 text-[10px]">
                <span className="text-red-400">{stronger} stronger</span>
                <span className="text-yellow-400">{same} same</span>
                <span className="text-emerald-400">{weaker} weaker</span>
              </div>
            );
          })()}
          <button onClick={() => setShowEquity(!showEquity)}
            className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${showEquity ? "border-[var(--gold-dim)]/60 bg-[var(--gold)]/15 text-[var(--gold)]" : "border-[var(--border)] text-muted-foreground hover:text-[var(--gold)] hover:border-[var(--gold-dim)]/40"}`}>
            Equity
          </button>
        </div>
      </div>

      {/* Header 2: Range — position overlays */}
      <div className="flex items-center gap-1.5 px-4 py-1.5 border-b border-[var(--border)]/50 bg-[var(--muted)]/15">
        <span className="text-[9px] text-muted-foreground mr-1">Range:</span>
        {heroPos && (
          <>
            <button onClick={() => togglePosition(heroPos)}
              className={`text-[10px] px-2 py-0.5 rounded transition-colors ${selectedPositions.includes(heroPos) ? selectedPositions[0] === heroPos ? "bg-[var(--gold)]/20 text-[var(--gold)] border border-[var(--gold-dim)]/50 font-semibold" : "bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 font-semibold" : "text-[var(--gold)] border border-[var(--gold-dim)]/30 hover:border-[var(--gold-dim)]/50"}`}>
              Hero ({heroPos.toUpperCase()})
            </button>
            <div className="h-3 w-px bg-[var(--border)]/50 mx-0.5" />
          </>
        )}
        {POSITIONS.map(({ key, label }) => {
          const isSelected = selectedPositions.includes(key);
          const isFirst = selectedPositions[0] === key;
          const actionLabel = positionLabels.get(key);
          const isFolded = actionLabel === "Fold";
          return (
            <button key={key} onClick={() => !isFolded && togglePosition(key)}
              className={`text-[10px] px-2 py-0.5 rounded transition-colors ${isFolded ? "text-muted-foreground/30 border border-transparent cursor-default line-through" : isSelected ? isFirst ? "bg-[var(--gold)]/20 text-[var(--gold)] border border-[var(--gold-dim)]/50 font-semibold" : "bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 font-semibold" : "text-muted-foreground hover:text-foreground border border-transparent hover:border-[var(--border)]"}`}>
              {label}
              {actionLabel && !isFolded && <span className="text-[8px] opacity-60 ml-0.5">{actionLabel}</span>}
            </button>
          );
        })}
        {ranges.length > 0 && (
          <div className="flex gap-2 text-[9px] text-muted-foreground ml-auto">
            {primary && <span className="text-[var(--gold)]">{primary.pos.toUpperCase()} ~{RANGE_PCT[primary.pos] ?? "?"}%</span>}
            {secondary && <><span>vs</span><span className="text-cyan-400">{secondary.pos.toUpperCase()} ~{RANGE_PCT[secondary.pos] ?? "?"}%</span></>}
          </div>
        )}
      </div>

      {/* Header 3: Facing */}
      <div className="flex items-center gap-2 px-4 py-1.5 border-b border-[var(--border)]/50 bg-[var(--muted)]/10">
        <span className="text-[9px] text-muted-foreground">Facing:</span>
        {facingPosition && facingBetBB > 0 ? (
          <span className="text-[10px] text-cyan-400 font-semibold">{facingPosition.toUpperCase()} {facingBetBB.toFixed(1)}BB</span>
        ) : (
          <span className="text-[10px] text-muted-foreground/60">—</span>
        )}
        <button onClick={() => setShowFacing(!showFacing)}
          className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${showFacing ? "border-green-500/60 bg-green-500/15 text-green-400" : "border-[var(--border)] text-muted-foreground hover:text-green-400 hover:border-green-500/40"}`}>
          {showFacing ? `${facingSizingBB.toFixed(1)}BB` : "Off"}
        </button>
        {showFacing && (
          <>
            <input type="range" min={0} max={20} step={0.5} value={facingSizingBB}
              onChange={e => setFacingSizingBB(parseFloat(e.target.value))}
              className="flex-1 h-1 accent-green-400 cursor-pointer" />
            <div className="flex gap-1.5 text-[8px]">
              <span className="text-green-400">V</span><span className="text-slate-400">M</span>
              <span className="text-amber-300">B</span><span className="text-red-400/60">F</span>
            </div>
          </>
        )}
      </div>

      {/* Grid */}
      <div className="p-2">
        <div className="grid gap-px" style={{ gridTemplateColumns: "repeat(13, 1fr)" }}>
          {displayCells.map(cell => {
            const inPrimary = primary?.range.has(cell.handClass) ?? false;
            const inSecondary = secondary?.range.has(cell.handClass) ?? false;
            const effectiveEquity = hasRangeEquity ? (equityVsRange!.get(cell.handClass) ?? cell.equity) : cell.equity;
            // Recompute facing with effective equity from MC if available
            const facing = showFacing && preflopResult
              ? (cell.inHeroRange ? classifyFacingLocal(effectiveEquity, facingSizingBB, preflopResult.potSizeBB, true) : "F" as SizingRole)
              : null;
            return (
              <PreflopCellView key={`${cell.row}-${cell.col}`}
                cell={cell} showEquity={showEquity} effectiveEquity={effectiveEquity}
                inPrimary={inPrimary} inSecondary={inSecondary} showRange={ranges.length > 0}
                facing={facing} />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Lightweight facing classifier for the slider (uses pipeline's pot size)
function classifyFacingLocal(equity: number, callCostBB: number, potSizeBB: number, inRange: boolean): SizingRole {
  if (!inRange) return "F";
  if (callCostBB <= 0) return "M";
  const potOdds = callCostBB / (potSizeBB + callCostBB);
  const surplus = equity - potOdds;
  const polarization = Math.min(1, Math.max(0, (callCostBB - 2) / 10));
  if (equity >= 0.70) return "V";
  if (surplus > 0.15) return "V";
  if (surplus > 0.05) return "M";
  if (surplus > -0.05 && polarization > 0.3) return "B";
  if (surplus > -0.03) return "M";
  return "F";
}

// ═══════════════════════════════════════════════════════
// CELL RENDERERS
// ═══════════════════════════════════════════════════════

function PreflopCellView({ cell, showEquity, effectiveEquity, inPrimary, inSecondary, showRange, facing }: {
  cell: PreflopGridCell; showEquity: boolean; effectiveEquity: number;
  inPrimary: boolean; inSecondary: boolean; showRange: boolean; facing: SizingRole | null;
}) {
  let bg: string, txt: string;
  if (cell.isHero) { bg = "bg-blue-600"; txt = "text-white font-bold"; }
  else if (showEquity) {
    const eq = effectiveEquity;
    if (eq >= 0.75) { bg = "bg-red-600/60"; txt = "text-red-100"; }
    else if (eq >= 0.65) { bg = "bg-orange-600/50"; txt = "text-orange-100"; }
    else if (eq >= 0.58) { bg = "bg-amber-700/45"; txt = "text-amber-100"; }
    else if (eq >= 0.52) { bg = "bg-yellow-800/40"; txt = "text-yellow-200"; }
    else if (eq >= 0.46) { bg = "bg-emerald-900/35"; txt = "text-emerald-200"; }
    else if (eq >= 0.42) { bg = "bg-sky-900/30"; txt = "text-sky-200"; }
    else { bg = "bg-slate-800/40"; txt = "text-slate-400"; }
  } else {
    bg = cell.type === "pair" ? "bg-amber-900/40" : cell.type === "suited" ? "bg-sky-900/30" : "bg-slate-800/50";
    txt = "text-muted-foreground";
  }

  const dimmed = showRange && !cell.isHero && !inPrimary && !inSecondary;
  const primaryRing = showRange && (inPrimary || cell.isHero) ? "ring-2 ring-[var(--gold)] ring-inset" : "";
  const showEqLabel = showEquity && !cell.isHero;

  const title = cell.isHero ? `Your hand: ${cell.handClass} (${(effectiveEquity*100).toFixed(0)}%)`
    : `${cell.handClass}: ${(effectiveEquity*100).toFixed(0)}%${facing ? ` | ${ROLE_LABEL[facing]}` : ""}`;

  return (
    <div className={`${bg} ${txt} ${primaryRing} ${dimmed ? "opacity-30" : ""} relative leading-none flex flex-col items-center justify-center rounded-sm aspect-square select-none cursor-default overflow-hidden transition-opacity`} title={title}>
      {showRange && inSecondary && (() => {
        const color = cell.isHero ? "border-t-white border-r-white" : "border-t-cyan-400 border-r-cyan-400";
        return <div className={`absolute top-0 right-0 w-0 h-0 border-t-[8px] border-r-[8px] ${color} border-l-[8px] border-b-[8px] border-l-transparent border-b-transparent`} />;
      })()}
      {facing && <span className={`absolute bottom-px right-1 text-[9px] font-bold ${cell.isHero ? "text-white/80" : FACING_COLOR[facing]}`}>{facing}</span>}
      <span className="text-sm font-semibold">{cell.handClass}</span>
      {showEqLabel && <span className="text-[10px] opacity-75 mt-0.5">{(effectiveEquity*100).toFixed(0)}%</span>}
      {cell.isHero && <span className="text-[10px] opacity-85 mt-0.5">{(effectiveEquity*100).toFixed(0)}%</span>}
    </div>
  );
}

function PostflopCellView({ cell }: { cell: HandClassGridCell }) {
  let bg: string, txt: string;
  if (cell.isHero) { bg = "bg-blue-600"; txt = "text-white font-bold"; }
  else if (cell.isDead || cell.total === 0) { bg = "bg-muted/20"; txt = "text-muted-foreground/30"; }
  else {
    const br = cell.beats / cell.total; const tr = cell.ties / cell.total;
    if (br > 0.7) { bg = "bg-red-700/70"; txt = "text-red-100"; }
    else if (br > 0.4) { bg = "bg-red-900/50"; txt = "text-red-200"; }
    else if (tr > 0.5) { bg = "bg-yellow-800/40"; txt = "text-yellow-200"; }
    else if (br > 0.1) { bg = "bg-orange-900/30"; txt = "text-orange-200"; }
    else { bg = "bg-emerald-900/30"; txt = "text-emerald-200"; }
  }
  const title = cell.isHero ? `Your hand: ${cell.handClass}`
    : cell.total === 0 ? `${cell.handClass}: no combos`
    : `${cell.handClass}: ${cell.beats}/${cell.total} beat you (${((cell.beats/cell.total)*100).toFixed(0)}%)`;
  return (
    <div className={`${bg} ${txt} leading-none flex items-center justify-center rounded-sm aspect-square select-none cursor-default`} title={title}>
      <span className="text-sm font-semibold">{cell.handClass}</span>
    </div>
  );
}
