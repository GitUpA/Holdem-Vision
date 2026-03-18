"""
Aggregate PokerBench Preflop Data into Per-Hand-Class Frequency Tables
=====================================================================
Reads the 60k solver-optimal preflop decisions, classifies each into an
archetype + opener position + hero position + hand class, computes
fold/call/raise frequencies, and outputs JSON files for the HoldemVision engine.

Sub-classifies by opener position for position-aware accuracy:
  - BB defense vs UTG open ≠ BB defense vs BTN open
  - 3-bet after UTG open ≠ 3-bet after BTN open

Usage:
  python aggregate_preflop.py
  py aggregate_preflop.py
"""

import csv
import json
import os
import re
from collections import defaultdict
from pathlib import Path

# ═══════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════

DATA_DIR = Path(__file__).parent / "dataset"
OUTPUT_DIR = Path(__file__).parent / "preflop_tables"
CSV_FILE = DATA_DIR / "preflop_60k_train_set_game_scenario_information.csv"

# Minimum observations to include a hand class (below this -> null/fallback)
MIN_SAMPLE_THRESHOLD = 3

# Laplace smoothing pseudo-counts per action
SMOOTHING = 1

RANKS = "23456789TJQKA"
RANK_ORDER = {r: i for i, r in enumerate(RANKS)}

POSITIONS = {"utg", "hj", "co", "btn", "sb", "bb"}
BLIND_POSITIONS = {"sb", "bb"}

# ═══════════════════════════════════════════════════════
# HAND CLASS CONVERSION
# ═══════════════════════════════════════════════════════

def holding_to_hand_class(holding: str) -> str:
    """Convert specific holding (e.g., 'AhKc') to hand class (e.g., 'AKo')."""
    r1, s1 = holding[0], holding[1]
    r2, s2 = holding[2], holding[3]

    rv1 = RANK_ORDER.get(r1, 0)
    rv2 = RANK_ORDER.get(r2, 0)

    if rv1 >= rv2:
        high, low = r1, r2
    else:
        high, low = r2, r1

    if r1 == r2:
        return f"{high}{low}"
    elif s1 == s2:
        return f"{high}{low}s"
    else:
        return f"{high}{low}o"


# ═══════════════════════════════════════════════════════
# PREV_LINE PARSING
# ═══════════════════════════════════════════════════════

def parse_positions_from_prev_line(prev_line: str) -> list[str]:
    """Extract positions that took actions (in order) from prev_line."""
    if not prev_line:
        return []
    parts = prev_line.split("/")
    positions = []
    for p in parts:
        pl = p.lower()
        if pl in POSITIONS:
            positions.append(pl)
    return positions


def find_opener_position(prev_line: str) -> str | None:
    """Find the first player who raised (the opener) from prev_line."""
    if not prev_line:
        return None
    parts = prev_line.split("/")
    current_pos = None
    for part in parts:
        pl = part.lower()
        if pl in POSITIONS:
            current_pos = pl
        elif current_pos and (re.match(r"[\d.]+", pl) or pl == "allin"):
            # This position made a bet/raise
            return current_pos
    return None


# ═══════════════════════════════════════════════════════
# ARCHETYPE CLASSIFICATION
# ═══════════════════════════════════════════════════════

def classify_archetype(prev_line: str, hero_pos: str, num_bets: int) -> tuple[str, str | None]:
    """
    Classify a preflop scenario into an archetype + opener context.
    Returns (archetype_id, opener_position).
    """
    hero_pos_lower = hero_pos.lower()
    opener = find_opener_position(prev_line)

    # RFI: hero is first to act (no previous bets)
    if num_bets == 0:
        return ("rfi_opening", None)

    # Check if this is a blind vs blind scenario
    if is_blind_vs_blind(prev_line, hero_pos_lower):
        return ("blind_vs_blind", opener)

    # Single raise: defense / cold-call
    if num_bets == 1:
        return ("bb_defense_vs_rfi", opener)

    # 2-3 bets: 3-bet pot
    if num_bets in (2, 3):
        return ("three_bet_pots", opener)

    # 4+ bets: 4-bet/5-bet
    if num_bets >= 4:
        return ("four_bet_five_bet", opener)

    return ("rfi_opening", None)


def is_blind_vs_blind(prev_line: str, hero_pos: str) -> bool:
    """Check if only blind positions are involved."""
    if hero_pos not in BLIND_POSITIONS:
        return False
    if not prev_line:
        return hero_pos == "sb"

    positions_in_action = set(parse_positions_from_prev_line(prev_line))
    return positions_in_action.issubset(BLIND_POSITIONS)


# ═══════════════════════════════════════════════════════
# DECISION NORMALIZATION
# ═══════════════════════════════════════════════════════

def normalize_decision(decision: str) -> str:
    """Normalize decision to fold/call/raise."""
    d = decision.strip().lower()
    if d == "fold":
        return "fold"
    if d in ("call", "check"):
        return "call"
    if d == "allin":
        return "raise"
    if re.match(r"[\d.]+", d):
        return "raise"
    return "fold"


# ═══════════════════════════════════════════════════════
# AGGREGATION
# ═══════════════════════════════════════════════════════

def build_table(action_counts: dict, sample_count: int) -> dict:
    """Build a frequency entry with Laplace smoothing."""
    total_smoothed = sample_count + SMOOTHING * 3
    return {
        "fold": round((action_counts["fold"] + SMOOTHING) / total_smoothed, 4),
        "call": round((action_counts["call"] + SMOOTHING) / total_smoothed, 4),
        "raise": round((action_counts["raise"] + SMOOTHING) / total_smoothed, 4),
        "sampleCount": sample_count,
    }


def aggregate():
    """Main aggregation pipeline."""
    # Structure: archetype -> opener -> hero_pos -> hand_class -> {fold, call, raise}
    counts = defaultdict(lambda: defaultdict(lambda: defaultdict(lambda: defaultdict(
        lambda: {"fold": 0, "call": 0, "raise": 0}
    ))))
    total_rows = 0
    skipped = 0
    archetype_counts = defaultdict(int)
    opener_dist = defaultdict(lambda: defaultdict(int))

    with open(CSV_FILE, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            total_rows += 1

            prev_line = row.get("prev_line", "")
            hero_pos = row.get("hero_pos", "")
            hero_holding = row.get("hero_holding", "")
            decision = row.get("correct_decision", "")
            num_bets = int(row.get("num_bets", 0))

            if not hero_holding or len(hero_holding) < 4:
                skipped += 1
                continue

            hand_class = holding_to_hand_class(hero_holding)
            position = hero_pos.lower()

            if position not in POSITIONS:
                skipped += 1
                continue

            archetype, opener = classify_archetype(prev_line, hero_pos, num_bets)
            if archetype is None:
                skipped += 1
                continue

            action = normalize_decision(decision)

            # Use "any" as opener key for RFI (no opener) and as aggregated fallback
            opener_key = opener or "any"

            # Count both the specific opener AND the "any" aggregate
            counts[archetype][opener_key][position][hand_class][action] += 1
            if opener_key != "any":
                counts[archetype]["any"][position][hand_class][action] += 1

            archetype_counts[archetype] += 1
            opener_dist[archetype][opener_key] += 1

    print(f"Total rows: {total_rows}")
    print(f"Skipped: {skipped}")
    print(f"Processed: {total_rows - skipped}")
    print(f"\nArchetype distribution:")
    for arch, count in sorted(archetype_counts.items(), key=lambda x: -x[1]):
        print(f"  {arch}: {count}")
        for opener, ocount in sorted(opener_dist[arch].items(), key=lambda x: -x[1]):
            print(f"    vs {opener}: {ocount}")

    # Build output tables — one JSON per archetype, with opener sub-tables
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    for archetype, openers in counts.items():
        table = {
            "archetypeId": archetype,
            "source": "PokerBench 60k solver-optimal decisions (position-aware)",
            "totalRows": archetype_counts[archetype],
            "openers": {},
        }

        for opener, positions in openers.items():
            opener_data = {}
            for position, hand_classes in positions.items():
                pos_data = {}
                for hand_class, action_counts in sorted(hand_classes.items()):
                    sample_count = sum(action_counts.values())
                    pos_data[hand_class] = build_table(action_counts, sample_count)
                opener_data[position] = pos_data

            table["openers"][opener] = opener_data

        output_path = OUTPUT_DIR / f"{archetype}.json"
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(table, f, indent=2)

        opener_count = len([o for o in openers if o != "any"])
        total_hc = sum(len(hc) for pos in openers.get("any", {}).values() for hc in [pos])
        print(f"\nWrote {output_path.name}: {opener_count} openers, {total_hc} hand classes (aggregated)")

    # Print sample comparison
    print("\n" + "=" * 60)
    print("SAMPLE: BB Defense, AKo — by opener position")
    print("=" * 60)
    bb_def = counts.get("bb_defense_vs_rfi", {})
    for opener in ["utg", "hj", "co", "btn", "any"]:
        bb_data = bb_def.get(opener, {}).get("bb", {})
        ako = bb_data.get("AKo")
        if ako:
            total = sum(ako.values())
            print(f"  vs {opener:4s}: fold={ako['fold']/total*100:5.1f}%  "
                  f"call={ako['call']/total*100:5.1f}%  "
                  f"raise={ako['raise']/total*100:5.1f}%  (n={total})")

    print("\n" + "=" * 60)
    print("SAMPLE: BB Defense, A6o — by opener position")
    print("=" * 60)
    for opener in ["utg", "hj", "co", "btn", "any"]:
        bb_data = bb_def.get(opener, {}).get("bb", {})
        a6o = bb_data.get("A6o")
        if a6o:
            total = sum(a6o.values())
            print(f"  vs {opener:4s}: fold={a6o['fold']/total*100:5.1f}%  "
                  f"call={a6o['call']/total*100:5.1f}%  "
                  f"raise={a6o['raise']/total*100:5.1f}%  (n={total})")


if __name__ == "__main__":
    aggregate()
