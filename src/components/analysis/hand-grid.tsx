"use client";

/**
 * Vision Hand Grid — 13x13 poker hand class grid.
 *
 * Preflop: equity heatmap, position range overlays (multi-select comparison).
 * Postflop: colors each cell by whether it beats hero on the current board.
 */
import { useMemo, useState, useEffect } from "react";
import { evaluateHand, compareHandRanks } from "../../../convex/lib/primitives/handEvaluator";
import { getPreflopEquity } from "../../../convex/lib/gto/preflopEquityTable";
import { GTO_RFI_RANGES, GTO_3BET_RANGES, GTO_COLD_CALL_RANGES, GTO_3BET_MIXED, GTO_BB_DEFENSE, GTO_BVB } from "../../../convex/lib/gto/tables/preflopRanges";

const RL = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
const GRID_TO_RANK = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];

const POSITIONS = [
  { key: "utg", label: "UTG" },
  { key: "hj", label: "HJ" },
  { key: "co", label: "CO" },
  { key: "btn", label: "BTN" },
  { key: "sb", label: "SB" },
] as const;

// Range percentage approximations for display
const RANGE_PCT: Record<string, number> = { utg: 15, hj: 19, co: 27, btn: 44, sb: 40 };

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

type SizingRole = "V" | "M" | "B" | "F";

/**
 * Facing: what should I do with this hand facing a bet of sizingBB?
 * V = call/raise for value | M = mixed/borderline | B = bluff-catch | F = fold
 *
 * Range-first: if the hand isn't in hero's continue range, it's F regardless of equity.
 * Then equity determines V vs M vs B within the range.
 */
function classifyFacing(equity: number, sizingBB: number, inHeroRange: boolean): SizingRole {
  // Not in hero's continue range → fold
  if (!inHeroRange) return "F";

  if (sizingBB <= 0) return "M";
  // Pot odds: call / (pot + call). Pot = blinds (1.5BB) + raiser's bet + call.
  const potOdds = sizingBB / (1.5 + sizingBB + sizingBB);
  const surplus = equity - potOdds;
  const polarization = Math.min(1, Math.max(0, (sizingBB - 2) / 10));

  if (equity >= 0.70) return "V";
  if (surplus > 0.15) return "V";
  if (surplus > 0.05) return "M";
  if (surplus > -0.05 && polarization > 0.3) return "B";
  if (surplus > -0.03) return "M";
  return "F";
}

const FACING_COLOR: Record<SizingRole, string> = {
  V: "text-green-400", M: "text-slate-400", B: "text-amber-300", F: "text-red-400/60",
};
const ROLE_LABEL: Record<SizingRole, string> = {
  V: "Value", M: "Mixed", B: "Bluff-catch", F: "Fold",
};

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
  /** Preflop actions for position labels */
  preflopActions?: PreflopAction[];
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

export function HandGrid({ heroCards, communityCards, heroPosition, facingBetBB = 0, facingPosition, preflopActions }: HandGridProps) {
  const [showEquity, setShowEquity] = useState(true); // ON by default
  const [selectedPositions, setSelectedPositions] = useState<string[]>([]);
  const [facingSizingBB, setFacingSizingBB] = useState(0);
  const [showFacing, setShowFacing] = useState(false);
  const [autoDefaultsApplied, setAutoDefaultsApplied] = useState(false);

  // Reset auto-defaults when hero cards change (new hand)
  useEffect(() => {
    setAutoDefaultsApplied(false);
  }, [heroCards[0], heroCards[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-defaults: when facing a bet, select hero + facing position and turn on facing slider
  useEffect(() => {
    if (autoDefaultsApplied) return;
    const hPos = heroPosition && !["bb"].includes(heroPosition) ? heroPosition : null;
    if (facingBetBB > 0 && facingPosition) {
      setFacingSizingBB(facingBetBB);
      setShowFacing(true);
      // Auto-select hero as primary + facing position as secondary
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

  const data = useMemo(() => {
    if (!heroCards || heroCards.length < 2) return null;
    return computeGrid(heroCards, communityCards ?? []);
  }, [heroCards, communityCards]);

  const heroPos = heroPosition && !["bb"].includes(heroPosition) ? heroPosition : null;

  // Build position → action label map from preflop actions
  const positionLabels = useMemo(() => {
    const labels = new Map<string, string>();
    if (!preflopActions) return labels;
    const bb = 1; // normalize — amounts are already in chips, we show relative
    for (const a of preflopActions) {
      const pos = a.position;
      if (a.actionType === "fold") {
        labels.set(pos, "Fold");
      } else if (a.actionType === "raise" || a.actionType === "bet") {
        const amt = a.amount ? (a.amount / bb).toFixed(0) : "?";
        // Count raises to determine open vs 3bet vs 4bet
        const priorRaises = preflopActions.filter(
          p => (p.actionType === "raise" || p.actionType === "bet") &&
            preflopActions.indexOf(p) < preflopActions.indexOf(a)
        ).length;
        const verb = priorRaises === 0 ? "Open" : priorRaises === 1 ? "3bet" : "4bet";
        labels.set(pos, `${verb} ${amt}`);
      } else if (a.actionType === "call") {
        labels.set(pos, "Call");
      } else if (a.actionType === "check") {
        labels.set(pos, "Check");
      }
    }
    return labels;
  }, [preflopActions]);

  // Get range sets for selected positions (max 2)
  const ranges = useMemo(() => {
    return selectedPositions
      .map(pos => ({ pos, range: GTO_RFI_RANGES[pos] }))
      .filter(r => r.range);
  }, [selectedPositions]);

  // The opponent range for equity calculation = the non-hero selected range
  const opponentRangeEntry = useMemo(() => {
    return ranges.find(r => r.pos !== heroPos) ?? null;
  }, [ranges, heroPos]);

  // Async equity vs range — computes in chunks so UI stays responsive
  // Cache results per position key so toggling off/on doesn't recompute
  const [equityCache] = useState(() => new Map<string, Map<string, number>>());
  const [equityVsRange, setEquityVsRange] = useState<Map<string, number> | null>(null);
  const [equityComputing, setEquityComputing] = useState(false);
  const [equityProgress, setEquityProgress] = useState(0); // 0-169

  useEffect(() => {
    const oppPos = opponentRangeEntry?.pos;
    const oppRange = opponentRangeEntry?.range;
    if (!oppRange || !oppPos || oppRange.size === 0) {
      setEquityVsRange(null);
      setEquityComputing(false);
      setEquityProgress(0);
      return;
    }

    // Check cache first
    const cached = equityCache.get(oppPos);
    if (cached) {
      setEquityVsRange(cached);
      setEquityComputing(false);
      setEquityProgress(169);
      return;
    }

    // Build opponent combos once
    const oppCombos: [number, number][] = [];
    for (const hc of oppRange) {
      const isP = hc.length === 2;
      const isS = hc.endsWith("s");
      const r1 = 12 - RL.indexOf(hc[0]);
      const r2 = 12 - RL.indexOf(hc[1]);
      if (isP) {
        for (let s1 = 0; s1 < 4; s1++) for (let s2 = s1 + 1; s2 < 4; s2++)
          oppCombos.push([r1 * 4 + s1, r1 * 4 + s2]);
      } else {
        for (let s1 = 0; s1 < 4; s1++) for (let s2 = 0; s2 < 4; s2++) {
          if (isS && s1 !== s2) continue;
          if (!isS && s1 === s2) continue;
          oppCombos.push([r1 * 4 + s1, r2 * 4 + s2]);
        }
      }
    }
    if (oppCombos.length === 0) return;

    setEquityComputing(true);
    setEquityProgress(0);

    // Build work list: 169 hand classes
    const work: { hc: string; rank1: number; rank2: number; type: "pair" | "suited" | "offsuit" }[] = [];
    for (let row = 0; row < 13; row++) {
      for (let col = 0; col < 13; col++) {
        const type: "pair" | "suited" | "offsuit" = row === col ? "pair" : row < col ? "suited" : "offsuit";
        const hc = row === col ? RL[row] + RL[col] : row < col ? RL[row] + RL[col] + "s" : RL[col] + RL[row] + "o";
        work.push({ hc, rank1: GRID_TO_RANK[row], rank2: GRID_TO_RANK[col], type });
      }
    }

    const result = new Map<string, number>();
    let idx = 0;
    let cancelled = false;
    const trials = 300;
    const CHUNK_SIZE = 13; // one row per frame

    function processChunk() {
      if (cancelled) return;
      const end = Math.min(idx + CHUNK_SIZE, work.length);

      for (; idx < end; idx++) {
        const { hc, rank1, rank2, type } = work[idx];
        let heroC1: number, heroC2: number;
        if (type === "pair") { heroC1 = rank1 * 4; heroC2 = rank1 * 4 + 1; }
        else if (type === "suited") { heroC1 = rank1 * 4; heroC2 = rank2 * 4; }
        else { heroC1 = rank1 * 4; heroC2 = rank2 * 4 + 1; }

        const heroDead = new Set([heroC1, heroC2]);
        const validOpp = oppCombos.filter(([a, b]) => !heroDead.has(a) && !heroDead.has(b));
        if (validOpp.length === 0) { result.set(hc, 0.5); continue; }

        const deck: number[] = [];
        for (let i = 0; i < 52; i++) if (!heroDead.has(i)) deck.push(i);

        let wins = 0, total = 0;
        for (let t = 0; t < trials; t++) {
          const opp = validOpp[Math.floor(Math.random() * validOpp.length)];
          const available = deck.filter(c => c !== opp[0] && c !== opp[1]);
          if (available.length < 5) continue;
          for (let i = available.length - 1; i > available.length - 6; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [available[i], available[j]] = [available[j], available[i]];
          }
          const board = available.slice(available.length - 5);
          const heroEval = evaluateHand([heroC1, heroC2, ...board]);
          const oppEval = evaluateHand([opp[0], opp[1], ...board]);
          const cmp = compareHandRanks(heroEval.rank, oppEval.rank);
          if (cmp > 0) wins++; else if (cmp === 0) wins += 0.5;
          total++;
        }
        result.set(hc, total > 0 ? wins / total : 0.5);
      }

      setEquityProgress(idx);

      if (idx < work.length) {
        // Yield to browser, then continue
        requestAnimationFrame(processChunk);
      } else {
        // Done — cache and set
        const final = new Map(result);
        if (oppPos) equityCache.set(oppPos, final);
        setEquityVsRange(final);
        setEquityComputing(false);
      }
    }

    requestAnimationFrame(processChunk);

    return () => { cancelled = true; };
  }, [ranges]);

  if (!data) return null;

  const { cells, heroEquity: heroEquityVsRandom, totalBeats, totalTies, totalLoses, hasBoard } = data;
  const totalCombos = totalBeats + totalTies + totalLoses;
  const hasRangeEquity = equityVsRange !== null;
  // Hero's equity: vs range if available, otherwise vs random
  const heroEquity = (hasRangeEquity ? equityVsRange.get(data.heroHC) : null) ?? heroEquityVsRandom;

  // Hero's continue range: hands hero plays FACING a raise from this position
  // (cold-call + 3-bet + mixed — NOT the opening/RFI range)
  const heroContinueRange = useMemo(() => {
    if (!heroPos) {
      // BB: use defense range if we know who opened
      if (heroPosition === "bb" && facingPosition) {
        // SB opener = blind vs blind, use GTO_BVB data
        if (facingPosition === "sb") {
          const combined = new Set<string>();
          const bvb3bet = (GTO_BVB as Record<string, Set<string>>)["bb_3bet_vs_sb"];
          const bvbCall = (GTO_BVB as Record<string, Set<string>>)["bb_call_vs_sb"];
          if (bvb3bet) for (const h of bvb3bet) combined.add(h);
          if (bvbCall) for (const h of bvbCall) combined.add(h);
          if (combined.size > 0) return combined;
        }
        const key = facingPosition === "co" ? "vs_co"
          : facingPosition === "btn" ? "vs_btn"
          : facingPosition === "hj" ? "vs_hj"
          : "vs_utg";
        const defense = GTO_BB_DEFENSE[key];
        if (defense) {
          const combined = new Set<string>();
          for (const h of defense.threebet) combined.add(h);
          for (const h of defense.call) combined.add(h);
          return combined;
        }
      }
      return new Set<string>();
    }
    const combined = new Set<string>();
    const coldCall = GTO_COLD_CALL_RANGES[heroPos];
    const threeBet = GTO_3BET_RANGES[heroPos];
    const mixed = GTO_3BET_MIXED[heroPos];
    if (coldCall) for (const h of coldCall) combined.add(h);
    if (threeBet) for (const h of threeBet) combined.add(h);
    if (mixed) for (const h of mixed) combined.add(h);
    return combined;
  }, [heroPos, heroPosition, facingPosition]);

  const togglePosition = (key: string) => {
    setSelectedPositions(prev => {
      if (key === heroPos) {
        // Clicking hero: toggle hero off/on. Keep secondary if exists.
        if (prev.includes(key)) {
          return prev.filter(p => p !== key);
        }
        const other = prev.find(p => p !== heroPos);
        return other ? [heroPos, other] : [heroPos];
      }

      // Clicking any non-hero position:
      if (prev.includes(key)) {
        // Deselect that position, keep hero if selected
        return prev.filter(p => p !== key);
      }

      // Auto-include hero as primary, this position as secondary
      if (heroPos) {
        return [heroPos, key];
      }
      // No hero position (BB) — just select this one
      return [key];
    });
  };

  // Determine which range slot each position is in (for coloring)
  const primary = ranges[0] ?? null;
  const secondary = ranges[1] ?? null;

  return (
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
      {/* Primary header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-[var(--muted)]/30">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--gold-dim)] flex items-center gap-2">
          Vision Hand Grid
          {equityComputing && (
            <span className="text-[8px] font-normal text-muted-foreground animate-pulse">
              computing {Math.round((equityProgress / 169) * 100)}%
            </span>
          )}
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

      {/* Position range bar — multi-select */}
      {!hasBoard && (
        <div className="flex items-center gap-1.5 px-4 py-1.5 border-b border-[var(--border)]/50 bg-[var(--muted)]/15">
          <span className="text-[9px] text-muted-foreground mr-1">Range:</span>
          {heroPosition && !["bb"].includes(heroPosition) && (
            <>
              <button
                onClick={() => togglePosition(heroPosition)}
                className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                  selectedPositions.includes(heroPosition)
                    ? selectedPositions[0] === heroPosition
                      ? "bg-[var(--gold)]/20 text-[var(--gold)] border border-[var(--gold-dim)]/50 font-semibold"
                      : "bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 font-semibold"
                    : "text-[var(--gold)] hover:text-[var(--gold)] border border-[var(--gold-dim)]/30 hover:border-[var(--gold-dim)]/50"
                }`}
              >
                Hero ({heroPosition.toUpperCase()})
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
              <button
                key={key}
                onClick={() => !isFolded && togglePosition(key)}
                className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                  isFolded
                    ? "text-muted-foreground/30 border border-transparent cursor-default line-through"
                    : isSelected
                      ? isFirst
                        ? "bg-[var(--gold)]/20 text-[var(--gold)] border border-[var(--gold-dim)]/50 font-semibold"
                        : "bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 font-semibold"
                      : "text-muted-foreground hover:text-foreground border border-transparent hover:border-[var(--border)]"
                }`}
              >
                {label}
                {actionLabel && !isFolded && (
                  <span className="text-[8px] opacity-60 ml-0.5">{actionLabel}</span>
                )}
              </button>
            );
          })}
          {ranges.length > 0 && (
            <div className="flex gap-2 text-[9px] text-muted-foreground ml-auto">
              {primary && (
                <span className="text-[var(--gold)]">
                  {primary.pos.toUpperCase()} ~{RANGE_PCT[primary.pos] ?? "?"}%
                </span>
              )}
              {secondary && (
                <>
                  <span>vs</span>
                  <span className="text-cyan-400">
                    {secondary.pos.toUpperCase()} ~{RANGE_PCT[secondary.pos] ?? "?"}%
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Facing: who bet, how much, and what should I do? ── */}
      {!hasBoard && (
        <div className="flex items-center gap-2 px-4 py-1.5 border-b border-[var(--border)]/50 bg-[var(--muted)]/10">
          <span className="text-[9px] text-muted-foreground">Facing:</span>
          {facingPosition && facingBetBB > 0 ? (
            <span className="text-[10px] text-cyan-400 font-semibold">
              {facingPosition.toUpperCase()} {facingBetBB.toFixed(1)}BB
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground/60">—</span>
          )}
          <button onClick={() => setShowFacing(!showFacing)}
            className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
              showFacing
                ? "border-green-500/60 bg-green-500/15 text-green-400"
                : "border-[var(--border)] text-muted-foreground hover:text-green-400 hover:border-green-500/40"
            }`}>
            {showFacing ? `${facingSizingBB.toFixed(1)}BB` : "Off"}
          </button>
          {showFacing && (
            <>
              <input type="range" min={0} max={20} step={0.5} value={facingSizingBB}
                onChange={e => setFacingSizingBB(parseFloat(e.target.value))}
                className="flex-1 h-1 accent-green-400 cursor-pointer" />
              <div className="flex gap-1.5 text-[8px]">
                <span className="text-green-400">V</span>
                <span className="text-slate-400">M</span>
                <span className="text-amber-300">B</span>
                <span className="text-red-400/60">F</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Grid */}
      <div className="p-2">
        <div className="grid gap-px" style={{ gridTemplateColumns: "repeat(13, 1fr)" }}>
          {cells.map((cell) => {
            const inPrimary = primary?.range.has(cell.hc) ?? false;
            const inSecondary = secondary?.range.has(cell.hc) ?? false;
            // Use range-adjusted equity for all cells when a range is selected
            const effectiveEquity = hasRangeEquity
              ? (equityVsRange!.get(cell.hc) ?? cell.equity)
              : cell.equity;
            const facing = showFacing ? classifyFacing(effectiveEquity, facingSizingBB, heroContinueRange.has(cell.hc)) : null;
            return (
              <Cell
                key={`${cell.row}-${cell.col}`}
                cell={cell}
                hasBoard={hasBoard}
                showEquity={showEquity}
                inPrimary={inPrimary}
                inSecondary={inSecondary}
                showRange={ranges.length > 0}
                facing={facing}
                effectiveEquity={effectiveEquity}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Cell({ cell, hasBoard, showEquity, inPrimary, inSecondary, showRange, facing, effectiveEquity }: {
  cell: GridCell;
  hasBoard: boolean;
  showEquity: boolean;
  inPrimary: boolean;
  inSecondary: boolean;
  showRange: boolean;
  facing: SizingRole | null;
  effectiveEquity: number;
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
    const eq = effectiveEquity;
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

  // Range overlay: primary = ring outline, secondary = corner paint
  const dimmed = showRange && !cell.isDead && !cell.isHero && !inPrimary && !inSecondary;
  const primaryRing = showRange && !cell.isDead && (inPrimary || cell.isHero)
    ? "ring-2 ring-[var(--gold)] ring-inset" : "";

  const showEqLabel = !hasBoard && showEquity && !cell.isHero && !cell.isDead;

  const vsRange = effectiveEquity !== cell.equity;

  const title = cell.isHero ? `Your hand: ${cell.hc} (${(effectiveEquity * 100).toFixed(0)}% equity${vsRange ? " vs range" : " vs random"})`
    : cell.isDead ? `${cell.hc}: blocked`
    : !hasBoard ? `${cell.hc}: ${(effectiveEquity * 100).toFixed(0)}%${vsRange ? " vs range" : " vs random"}${facing ? ` | Facing: ${ROLE_LABEL[facing]}` : ""}${showRange ? (inPrimary && inSecondary ? " — in BOTH ranges" : inPrimary ? " — in primary range" : inSecondary ? " — in comparison range" : " — out of range") : ""}`
    : cell.total === 0 ? `${cell.hc}: no combos`
    : `${cell.hc}: ${cell.beats}/${cell.total} beat you (${((cell.beats / cell.total) * 100).toFixed(0)}%)`;

  return (
    <div
      className={`${bg} ${txt} ${primaryRing} ${dimmed ? "opacity-30" : ""} relative leading-none flex flex-col items-center justify-center rounded-sm aspect-square select-none cursor-default overflow-hidden transition-opacity`}
      title={title}
    >
      {/* Corner paint: secondary range = cyan (or white on hero's blue cell) */}
      {showRange && !cell.isDead && inSecondary && (() => {
        const color = cell.isHero ? "border-t-white border-r-white" : "border-t-cyan-400 border-r-cyan-400";
        return <div className={`absolute top-0 right-0 w-0 h-0 border-t-[8px] border-r-[8px] ${color} border-l-[8px] border-b-[8px] border-l-transparent border-b-transparent`} />;
      })()}
      {/* Facing letter — bottom right */}
      {facing && !cell.isDead && (
        <span className={`absolute bottom-px right-1 text-[9px] font-bold ${cell.isHero ? "text-white/80" : FACING_COLOR[facing]}`}>
          {facing}
        </span>
      )}
      <span className="text-sm font-semibold">{cell.hc}</span>
      {showEqLabel && (
        <span className="text-[10px] opacity-75 mt-0.5">{(effectiveEquity * 100).toFixed(0)}%</span>
      )}
      {cell.isHero && !hasBoard && (
        <span className="text-[10px] opacity-85 mt-0.5">{(effectiveEquity * 100).toFixed(0)}%</span>
      )}
    </div>
  );
}
