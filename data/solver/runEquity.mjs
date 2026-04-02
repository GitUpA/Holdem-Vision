/**
 * Compute preflop equity via MC. Standalone — run directly with node.
 *
 * Usage:
 *   node data/solver/runEquity.mjs              # 10 hands, 1000 trials (test)
 *   node data/solver/runEquity.mjs 169 100000   # full run, 100K trials
 *   node data/solver/runEquity.mjs 169 100000 5 # 5 opponents
 *
 * Output: JSON to stdout, progress to stderr
 */

const RANKS = ["A","K","Q","J","T","9","8","7","6","5","4","3","2"];
const NUM_HANDS = parseInt(process.argv[2] ?? "10", 10);
const TRIALS = parseInt(process.argv[3] ?? "1000", 10);
const NUM_OPP = parseInt(process.argv[4] ?? "1", 10);

// Build all 169 hand classes
const allHands = [];
for (let row = 0; row < 13; row++) {
  for (let col = 0; col < 13; col++) {
    if (row === col) allHands.push(RANKS[row] + RANKS[col]);
    else if (row < col) allHands.push(RANKS[row] + RANKS[col] + "s");
    else allHands.push(RANKS[col] + RANKS[row] + "o");
  }
}

// Representative combo for a hand class
function getCombo(hc) {
  const isP = hc.length === 2;
  const isS = hc.endsWith("s");
  const r1 = 12 - RANKS.indexOf(hc[0]);
  const r2 = 12 - RANKS.indexOf(hc[1]);
  if (isP) return [r1 * 4, r1 * 4 + 1];
  if (isS) return [r1 * 4, r2 * 4];
  return [r1 * 4, r2 * 4 + 1];
}

// Minimal 7-card hand evaluator (rank-based, no external deps)
// Returns a comparable integer — lower = better hand
function evalHand7(cards) {
  // Generate all 21 5-card combos, evaluate each, return best
  let best = Infinity;
  for (let i = 0; i < 7; i++) {
    for (let j = i + 1; j < 7; j++) {
      for (let k = j + 1; k < 7; k++) {
        for (let l = k + 1; l < 7; l++) {
          for (let m = l + 1; m < 7; m++) {
            const five = [cards[i], cards[j], cards[k], cards[l], cards[m]];
            const v = eval5(five);
            if (v < best) best = v;
          }
        }
      }
    }
  }
  return best;
}

function eval5(cards) {
  const ranks = cards.map(c => Math.floor(c / 4)).sort((a, b) => b - a);
  const suits = cards.map(c => c % 4);
  const isFlush = suits.every(s => s === suits[0]);

  // Check straight
  let isStraight = false;
  let straightHigh = -1;
  if (ranks[0] - ranks[4] === 4 && new Set(ranks).size === 5) {
    isStraight = true;
    straightHigh = ranks[0];
  }
  // Wheel: A-2-3-4-5
  if (ranks[0] === 12 && ranks[1] === 3 && ranks[2] === 2 && ranks[3] === 1 && ranks[4] === 0) {
    isStraight = true;
    straightHigh = 3; // 5-high straight
  }

  // Count rank occurrences
  const counts = {};
  for (const r of ranks) counts[r] = (counts[r] || 0) + 1;
  const groups = Object.entries(counts).map(([r, c]) => ({ rank: parseInt(r), count: c }));
  groups.sort((a, b) => b.count - a.count || b.rank - a.rank);

  const pattern = groups.map(g => g.count).join("");

  // Hand ranking (lower = better):
  // 1=straight flush, 2=quads, 3=full house, 4=flush, 5=straight
  // 6=trips, 7=two pair, 8=one pair, 9=high card
  let category, kickers;

  if (isFlush && isStraight) {
    category = 1;
    kickers = [straightHigh];
  } else if (pattern === "41") {
    category = 2;
    kickers = groups.map(g => g.rank);
  } else if (pattern === "32") {
    category = 3;
    kickers = groups.map(g => g.rank);
  } else if (isFlush) {
    category = 4;
    kickers = ranks;
  } else if (isStraight) {
    category = 5;
    kickers = [straightHigh];
  } else if (pattern === "311") {
    category = 6;
    kickers = groups.map(g => g.rank);
  } else if (pattern === "221") {
    category = 7;
    kickers = groups.map(g => g.rank);
  } else if (pattern === "2111") {
    category = 8;
    kickers = groups.map(g => g.rank);
  } else {
    category = 9;
    kickers = ranks;
  }

  // Encode as single comparable number (lower = better hand)
  // Invert kickers: higher rank → lower score contribution
  let score = category * 1000000;
  for (let i = 0; i < kickers.length; i++) {
    score += (12 - kickers[i]) * Math.pow(14, 4 - i);
  }
  return score;
}

// Fisher-Yates partial sample
function sample(deck, n) {
  const a = [...deck];
  for (let i = a.length - 1; i > a.length - 1 - n; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(a.length - n);
}

// ═══════════════════════════════════════════════════════

process.stderr.write(`Computing ${Math.min(NUM_HANDS, 169)} hands, ${TRIALS} trials, ${NUM_OPP} opponent(s)...\n`);

const result = {};
const hands = allHands.slice(0, Math.min(NUM_HANDS, 169));
const startTime = Date.now();

for (let i = 0; i < hands.length; i++) {
  const hc = hands[i];
  const [h1, h2] = getCombo(hc);
  const deck = [];
  for (let c = 0; c < 52; c++) if (c !== h1 && c !== h2) deck.push(c);

  let wins = 0, total = 0;
  for (let t = 0; t < TRIALS; t++) {
    const dealt = sample(deck, NUM_OPP * 2 + 5);
    const board = dealt.slice(NUM_OPP * 2);
    const heroScore = evalHand7([h1, h2, ...board]);

    let heroBest = true, tied = false;
    for (let o = 0; o < NUM_OPP; o++) {
      const oppScore = evalHand7([dealt[o * 2], dealt[o * 2 + 1], ...board]);
      if (oppScore < heroScore) { heroBest = false; break; }
      if (oppScore === heroScore) tied = true;
    }
    if (heroBest) wins += tied ? 0.5 : 1;
    total++;
  }
  result[hc] = Math.round((wins / total) * 1000) / 1000;

  if ((i + 1) % 13 === 0 || i === hands.length - 1) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const perHand = (Date.now() - startTime) / (i + 1);
    const remaining = ((hands.length - i - 1) * perHand / 1000).toFixed(0);
    process.stderr.write(`  ${i + 1}/${hands.length} (${elapsed}s elapsed, ~${remaining}s remaining)\n`);
  }
}

// Output JSON to stdout
console.log(JSON.stringify(result, null, 2));
process.stderr.write(`Done in ${((Date.now() - startTime) / 1000).toFixed(1)}s\n`);
