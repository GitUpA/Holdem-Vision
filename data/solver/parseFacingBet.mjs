/**
 * Parse facing-bet data from existing solver outputs.
 *
 * Reads all 193 solver JSON files and extracts:
 * - IP facing OOP bet: fold/call/raise frequencies per hand category
 * - OOP facing IP bet: fold/call/raise frequencies per hand category
 *
 * Outputs to data/frequency_tables/ alongside existing frequency data.
 *
 * Run: node data/solver/parseFacingBet.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUTS_DIR = path.join(__dirname, "outputs");
const TABLES_DIR = path.join(__dirname, "..", "frequency_tables");
const MANIFEST_FILE = path.join(__dirname, "manifest.json");

// ═══════════════════════════════════════════════════════
// HAND CATEGORIZATION (mirrors convex/lib/gto/handCategorizer.ts)
// ═══════════════════════════════════════════════════════

const RANKS = "23456789TJQKA";

function rankVal(r) {
  return RANKS.indexOf(r);
}

function parseHand(handStr) {
  // "AhKs" → [{rank: 12, suit: 'h'}, {rank: 11, suit: 's'}]
  const cards = [];
  for (let i = 0; i < handStr.length; i += 2) {
    cards.push({ rank: rankVal(handStr[i]), suit: handStr[i + 1] });
  }
  return cards;
}

function parseBoard(boardStr) {
  return parseHand(boardStr);
}

function categorizeHand(handStr, boardCards) {
  const hand = parseHand(handStr);
  const allCards = [...hand, ...boardCards];
  const ranks = allCards.map(c => c.rank);
  const suits = allCards.map(c => c.suit);
  const heroRanks = hand.map(c => c.rank).sort((a, b) => b - a);
  const boardRanks = boardCards.map(c => c.rank).sort((a, b) => b - a);

  // Count rank occurrences
  const rankCounts = {};
  for (const r of ranks) rankCounts[r] = (rankCounts[r] || 0) + 1;

  // Check for sets/quads
  const heroInTrips = heroRanks.some(r => rankCounts[r] >= 3);
  const heroInQuads = heroRanks.some(r => rankCounts[r] >= 4);
  const heroPairs = heroRanks.filter(r => rankCounts[r] >= 2);

  // Check for flush draws
  const suitCounts = {};
  for (const s of suits) suitCounts[s] = (suitCounts[s] || 0) + 1;
  const heroSuits = hand.map(c => c.suit);
  const hasFlushDraw = heroSuits.some(s => suitCounts[s] >= 4);
  const hasFlush = heroSuits.some(s => suitCounts[s] >= 5);

  if (hasFlush) return "sets_plus";
  if (heroInQuads || heroInTrips) return "sets_plus";

  // Two pair
  if (heroPairs.length >= 2) return "two_pair";
  const boardPairRanks = boardRanks.filter(r => {
    const boardCount = boardCards.filter(c => c.rank === r).length;
    return boardCount >= 2;
  });

  // One pair
  if (heroPairs.length === 1) {
    const pairRank = heroPairs[0];
    // Check if it's a board pair or hero pair
    const heroMadesPair = hand.some(c => boardCards.some(bc => bc.rank === c.rank));
    if (heroMadesPair) {
      if (pairRank === boardRanks[0]) {
        const kicker = heroRanks.find(r => r !== pairRank);
        if (kicker >= 10) return "top_pair_top_kicker";
        return "top_pair_weak_kicker";
      }
      if (pairRank >= boardRanks[1] && boardRanks.length > 1) return "middle_pair";
      return "bottom_pair";
    }
    // Pocket pair
    if (pairRank > boardRanks[0]) return "overpair";
    return "middle_pair";
  }

  // Draws
  if (hasFlushDraw) return "flush_draw";

  // Straight draw (simple check)
  const uniqueRanks = [...new Set(ranks)].sort((a, b) => a - b);
  let maxConsecutive = 1, current = 1;
  for (let i = 1; i < uniqueRanks.length; i++) {
    if (uniqueRanks[i] === uniqueRanks[i-1] + 1) { current++; maxConsecutive = Math.max(maxConsecutive, current); }
    else current = 1;
  }
  if (maxConsecutive >= 4) return "straight_draw";

  // Overcards
  if (heroRanks[0] > boardRanks[0]) return "overcards";

  return "air";
}

function normalizeAction(action) {
  if (action === "CHECK") return "check";
  if (action === "FOLD") return "fold";
  if (action === "CALL") return "call";
  if (action.startsWith("BET")) {
    const size = parseFloat(action.split(" ")[1]);
    if (size >= 90) return "bet_large";
    if (size >= 4) return "bet_medium";
    return "bet_small";
  }
  if (action.startsWith("RAISE")) {
    const size = parseFloat(action.split(" ")[1]);
    if (size >= 50) return "raise_large";
    return "raise_small";
  }
  return action.toLowerCase();
}

// ═══════════════════════════════════════════════════════
// PARSER
// ═══════════════════════════════════════════════════════

function parseFacingBetFromFile(filepath, boardStr) {
  const data = JSON.parse(fs.readFileSync(filepath, "utf-8"));
  const boardCards = parseBoard(boardStr);
  const children = data.childrens || {};

  const result = {
    ip_facing_bet: {},
    oop_facing_bet: {},
  };

  // IP facing OOP's bet (root → BET nodes)
  for (const [key, child] of Object.entries(children)) {
    if (key.startsWith("BET") && child.strategy?.strategy) {
      const actions = child.actions || [];
      const strategy = child.strategy.strategy;
      aggregateInto(result.ip_facing_bet, strategy, actions, boardCards);
    }
  }

  // OOP facing IP's bet after check (CHECK → BET nodes)
  const checkNode = children.CHECK;
  if (checkNode?.childrens) {
    for (const [key, child] of Object.entries(checkNode.childrens)) {
      if (key.startsWith("BET") && child.strategy?.strategy) {
        const actions = child.actions || [];
        const strategy = child.strategy.strategy;
        aggregateInto(result.oop_facing_bet, strategy, actions, boardCards);
      }
    }
  }

  return result;
}

function aggregateInto(target, strategy, actions, boardCards) {
  const normActions = actions.map(normalizeAction);

  for (const [hand, probs] of Object.entries(strategy)) {
    const cat = categorizeHand(hand, boardCards);

    if (!target[cat]) {
      target[cat] = { fold: 0, call: 0, raise: 0, count: 0 };
    }

    for (let i = 0; i < probs.length; i++) {
      const action = normActions[i];
      if (action === "fold") target[cat].fold += probs[i];
      else if (action === "call") target[cat].call += probs[i];
      else if (action.startsWith("raise")) target[cat].raise += probs[i];
    }
    target[cat].count++;
  }
}

function averageCategories(data) {
  const result = {};
  for (const [cat, totals] of Object.entries(data)) {
    if (totals.count > 0) {
      result[cat] = {
        fold: +(totals.fold / totals.count).toFixed(4),
        call: +(totals.call / totals.count).toFixed(4),
        raise: +(totals.raise / totals.count).toFixed(4),
        count: totals.count,
      };
    }
  }
  return result;
}

// ═══════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════

function main() {
  if (!fs.existsSync(MANIFEST_FILE)) {
    console.error("No manifest.json found");
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf-8"));
  const archetypeResults = {};

  let totalFiles = 0;
  let parsedFiles = 0;

  // Manifest is keyed by archetype → array of board entries
  const entries = [];
  for (const [archetype, boards] of Object.entries(manifest)) {
    for (const boardEntry of boards) {
      entries.push({ archetype, ...boardEntry });
    }
  }

  for (const entry of entries) {
    const { archetype, board, name } = entry;
    const output_file = name + ".json";
    const boardStr = Array.isArray(board) ? board.join("") : board;
    const filepath = path.join(OUTPUTS_DIR, output_file);

    if (!fs.existsSync(filepath)) continue;
    totalFiles++;

    try {
      const result = parseFacingBetFromFile(filepath, boardStr);
      if (!archetypeResults[archetype]) {
        archetypeResults[archetype] = { ip_facing_bet: {}, oop_facing_bet: {}, boards: 0 };
      }

      // Merge per-board results into archetype aggregate
      for (const side of ["ip_facing_bet", "oop_facing_bet"]) {
        for (const [cat, data] of Object.entries(result[side])) {
          if (!archetypeResults[archetype][side][cat]) {
            archetypeResults[archetype][side][cat] = { fold: 0, call: 0, raise: 0, count: 0 };
          }
          const t = archetypeResults[archetype][side][cat];
          t.fold += data.fold;
          t.call += data.call;
          t.raise += data.raise;
          t.count += data.count;
        }
      }
      archetypeResults[archetype].boards++;
      parsedFiles++;
    } catch (e) {
      console.error(`  Error parsing ${output_file}:`, e.message);
    }
  }

  console.log(`Parsed ${parsedFiles}/${totalFiles} solver outputs\n`);

  // Write results per archetype
  for (const [archetype, data] of Object.entries(archetypeResults)) {
    const outputFile = path.join(TABLES_DIR, `${archetype}_facing_bet.json`);
    const output = {
      archetypeId: archetype,
      boardsAnalyzed: data.boards,
      ip_facing_bet: averageCategories(data.ip_facing_bet),
      oop_facing_bet: averageCategories(data.oop_facing_bet),
    };

    fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));

    // Display summary
    console.log(`${archetype} (${data.boards} boards):`);
    console.log("  IP facing bet:");
    for (const [cat, freqs] of Object.entries(output.ip_facing_bet)) {
      console.log(`    ${cat.padEnd(22)} fold:${(freqs.fold*100).toFixed(0)}% call:${(freqs.call*100).toFixed(0)}% raise:${(freqs.raise*100).toFixed(0)}% (n=${freqs.count})`);
    }
    console.log("  OOP facing bet:");
    for (const [cat, freqs] of Object.entries(output.oop_facing_bet)) {
      console.log(`    ${cat.padEnd(22)} fold:${(freqs.fold*100).toFixed(0)}% call:${(freqs.call*100).toFixed(0)}% raise:${(freqs.raise*100).toFixed(0)}% (n=${freqs.count})`);
    }
    console.log();
  }
}

main();
