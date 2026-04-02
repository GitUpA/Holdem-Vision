"use client";

/**
 * useAsyncEquityGrid — computes MC equity vs an opponent range in chunks.
 *
 * Wraps the MC computation from computeEquityGrid in requestAnimationFrame
 * chunks so the UI stays responsive. Caches results per opponent position.
 *
 * Returns: { equityMap, isComputing, progress }
 */

import { useState, useEffect, useRef } from "react";
import { evaluateHand, compareHandRanks } from "../../convex/lib/primitives/handEvaluator";
import { RANK_LABELS, GRID_TO_RANK } from "../../convex/lib/preflop/rangeUtils";
import type { CardIndex } from "../../convex/lib/types/cards";

const RL = RANK_LABELS;
const MC_TRIALS = 300;

interface AsyncEquityResult {
  equityMap: Map<string, number> | null;
  isComputing: boolean;
  progress: number; // 0-169
}

/**
 * Build opponent card combos from a range of hand class strings.
 */
function buildOppCombos(range: Set<string>): [number, number][] {
  const combos: [number, number][] = [];
  for (const hc of range) {
    const isP = hc.length === 2;
    const isS = hc.endsWith("s");
    const r1 = 12 - RL.indexOf(hc[0]);
    const r2 = 12 - RL.indexOf(hc[1]);
    if (isP) {
      for (let s1 = 0; s1 < 4; s1++)
        for (let s2 = s1 + 1; s2 < 4; s2++)
          combos.push([r1 * 4 + s1, r1 * 4 + s2]);
    } else {
      for (let s1 = 0; s1 < 4; s1++)
        for (let s2 = 0; s2 < 4; s2++) {
          if (isS && s1 !== s2) continue;
          if (!isS && s1 === s2) continue;
          combos.push([r1 * 4 + s1, r2 * 4 + s2]);
        }
    }
  }
  return combos;
}

/**
 * Compute MC equity for one hand class vs opponent combos.
 */
function computeCellEquity(
  heroC1: number,
  heroC2: number,
  oppCombos: [number, number][],
  trials: number,
): number {
  const dead = new Set([heroC1, heroC2]);
  const valid = oppCombos.filter(([a, b]) => !dead.has(a) && !dead.has(b));
  if (valid.length === 0) return 0.5;

  const deck: number[] = [];
  for (let i = 0; i < 52; i++) if (!dead.has(i)) deck.push(i);

  let wins = 0;
  let total = 0;
  for (let t = 0; t < trials; t++) {
    const opp = valid[Math.floor(Math.random() * valid.length)];
    const avail = deck.filter(c => c !== opp[0] && c !== opp[1]);
    if (avail.length < 5) continue;
    // Partial Fisher-Yates for 5 cards
    for (let i = avail.length - 1; i > avail.length - 6; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [avail[i], avail[j]] = [avail[j], avail[i]];
    }
    const board = avail.slice(avail.length - 5);
    const hEval = evaluateHand([heroC1, heroC2, ...board] as CardIndex[]);
    const oEval = evaluateHand([opp[0], opp[1], ...board] as CardIndex[]);
    const cmp = compareHandRanks(hEval.rank, oEval.rank);
    if (cmp > 0) wins++;
    else if (cmp === 0) wins += 0.5;
    total++;
  }
  return total > 0 ? wins / total : 0.5;
}

/**
 * Hook: compute MC equity vs opponent range asynchronously in requestAnimationFrame chunks.
 * Caches results per opponent position key.
 */
export function useAsyncEquityGrid(
  opponentRange: Set<string> | null | undefined,
  cacheKey: string | null,
): AsyncEquityResult {
  const [equityMap, setEquityMap] = useState<Map<string, number> | null>(null);
  const [isComputing, setIsComputing] = useState(false);
  const [progress, setProgress] = useState(0);
  const cacheRef = useRef(new Map<string, Map<string, number>>());

  useEffect(() => {
    if (!opponentRange || opponentRange.size === 0 || !cacheKey) {
      setEquityMap(null);
      setIsComputing(false);
      setProgress(0);
      return;
    }

    // Check cache
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setEquityMap(cached);
      setIsComputing(false);
      setProgress(169);
      return;
    }

    setIsComputing(true);
    setProgress(0);

    const oppCombos = buildOppCombos(opponentRange);
    if (oppCombos.length === 0) return;

    // Build work list: all 169 hand classes
    const work: { hc: string; rank1: number; rank2: number; type: string }[] = [];
    for (let row = 0; row < 13; row++) {
      for (let col = 0; col < 13; col++) {
        const type = row === col ? "pair" : row < col ? "suited" : "offsuit";
        const hc = row === col ? RL[row] + RL[col]
          : row < col ? RL[row] + RL[col] + "s"
          : RL[col] + RL[row] + "o";
        work.push({ hc, rank1: GRID_TO_RANK[row], rank2: GRID_TO_RANK[col], type });
      }
    }

    const result = new Map<string, number>();
    let idx = 0;
    let cancelled = false;

    function processChunk() {
      if (cancelled) return;
      const end = Math.min(idx + 13, work.length);
      for (; idx < end; idx++) {
        const { hc, rank1, rank2, type } = work[idx];
        let c1: number, c2: number;
        if (type === "pair") { c1 = rank1 * 4; c2 = rank1 * 4 + 1; }
        else if (type === "suited") { c1 = rank1 * 4; c2 = rank2 * 4; }
        else { c1 = rank1 * 4; c2 = rank2 * 4 + 1; }
        result.set(hc, computeCellEquity(c1, c2, oppCombos, MC_TRIALS));
      }
      setProgress(idx);
      if (idx < work.length) {
        requestAnimationFrame(processChunk);
      } else {
        const final = new Map(result);
        cacheRef.current.set(cacheKey!, final);
        setEquityMap(final);
        setIsComputing(false);
      }
    }

    requestAnimationFrame(processChunk);
    return () => { cancelled = true; };
  }, [opponentRange, cacheKey]);

  return { equityMap, isComputing, progress };
}
