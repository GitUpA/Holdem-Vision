"""
Aggregate PokerBench Postflop Data into Per-Hand-Class Frequency Tables
======================================================================
Reads the 500k solver-optimal postflop decisions, classifies each into
archetype + hand class + IP/OOP + street, computes action frequencies,
and outputs JSON files for the HoldemVision engine.

Usage:
  py aggregate_postflop.py
"""

import csv
import json
import os
import re
import math
from collections import defaultdict
from pathlib import Path

# ═══════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════

DATA_DIR = Path(__file__).parent / "dataset"
OUTPUT_DIR = Path(__file__).parent / "postflop_tables"
CSV_FILE = DATA_DIR / "postflop_500k_train_set_game_scenario_information.csv"

SMOOTHING = 1
MIN_SAMPLE_THRESHOLD = 3

RANKS = "23456789TJQKA"
RANK_ORDER = {r: i for i, r in enumerate(RANKS)}
VAL_RANK = {v: k for k, v in RANK_ORDER.items()}

# ═══════════════════════════════════════════════════════
# CARD PARSING
# ═══════════════════════════════════════════════════════

def parse_board(board_str):
    """Parse 'Ks7h2d' -> [(11,'s'), (5,'h'), (0,'d')]."""
    cards = []
    for i in range(0, len(board_str), 2):
        if i + 1 < len(board_str):
            r = RANK_ORDER.get(board_str[i])
            s = board_str[i + 1]
            if r is not None:
                cards.append((r, s))
    return cards


def combo_to_hand_class(holding):
    """Convert 'AhKc' -> 'AKo'."""
    r1_val = RANK_ORDER.get(holding[0], 0)
    s1 = holding[1]
    r2_val = RANK_ORDER.get(holding[2], 0)
    s2 = holding[3]
    high = VAL_RANK[max(r1_val, r2_val)]
    low = VAL_RANK[min(r1_val, r2_val)]
    if r1_val == r2_val:
        return f"{high}{low}"
    elif s1 == s2:
        return f"{high}{low}s"
    else:
        return f"{high}{low}o"


# ═══════════════════════════════════════════════════════
# BOARD TEXTURE CLASSIFICATION
# ═══════════════════════════════════════════════════════

def classify_flop_texture(board_str):
    """Classify a 3-card flop into one of 8 texture archetypes."""
    cards = parse_board(board_str)
    if len(cards) < 3:
        return None

    ranks = sorted([c[0] for c in cards], reverse=True)
    suits = [c[1] for c in cards]
    high = ranks[0]

    unique_suits = len(set(suits))
    unique_ranks = len(set(ranks))

    is_paired = unique_ranks < 3
    is_monotone = unique_suits == 1
    is_two_tone = unique_suits == 2
    is_rainbow = unique_suits == 3

    # Connectivity check
    sorted_ranks = sorted(set(ranks))
    gaps = [sorted_ranks[i + 1] - sorted_ranks[i] for i in range(len(sorted_ranks) - 1)]
    is_connected = any(g <= 2 for g in gaps) if gaps else False
    is_straight_heavy = all(g <= 2 for g in gaps) if gaps else False

    if is_paired:
        return "paired_boards"
    if is_monotone:
        return "monotone"
    if is_two_tone:
        if is_straight_heavy:
            return "two_tone_connected"
        return "two_tone_disconnected"
    if is_rainbow:
        if is_connected and is_straight_heavy:
            return "rainbow_connected"
        if high == 12:  # Ace
            return "ace_high_dry_rainbow"
        if high >= 10:  # K or Q
            return "kq_high_dry_rainbow"
        if is_connected:
            return "rainbow_connected"
        return "mid_low_dry_rainbow"

    return "mid_low_dry_rainbow"


# ═══════════════════════════════════════════════════════
# DECISION NORMALIZATION
# ═══════════════════════════════════════════════════════

def normalize_decision(decision):
    """Normalize decision to fold/check/call/raise."""
    d = decision.strip()
    dl = d.lower()
    if dl == "fold":
        return "fold"
    if dl == "check":
        return "check"
    if dl == "call":
        return "call"
    if dl.startswith("bet") or dl.startswith("raise"):
        return "raise"
    if re.match(r"[\d.]", dl):
        return "raise"
    return "fold"


# ═══════════════════════════════════════════════════════
# AGGREGATION
# ═══════════════════════════════════════════════════════

def build_entry(action_counts, sample_count):
    """Build a frequency entry with Laplace smoothing."""
    actions = ["fold", "check", "call", "raise"]
    total_smoothed = sample_count + SMOOTHING * len(actions)
    result = {}
    for a in actions:
        result[a] = round((action_counts.get(a, 0) + SMOOTHING) / total_smoothed, 4)
    result["sampleCount"] = sample_count
    return result


def aggregate():
    """Main aggregation pipeline."""
    # Structure: archetype -> street -> ip/oop -> hand_class -> {fold, check, call, raise}
    counts = defaultdict(lambda: defaultdict(lambda: defaultdict(lambda: defaultdict(
        lambda: defaultdict(int)
    ))))
    total_rows = 0
    skipped = 0
    archetype_counts = defaultdict(int)
    street_counts = defaultdict(int)

    with open(CSV_FILE, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            total_rows += 1
            if total_rows % 100000 == 0:
                print(f"  Processed {total_rows} rows...")

            board_flop = row.get("board_flop", "")
            holding = row.get("holding", "")
            decision = row.get("correct_decision", "")
            street = row.get("evaluation_at", "").lower()
            hero_pos = row.get("hero_position", "")  # IP or OOP

            if not holding or len(holding) < 4 or not board_flop or len(board_flop) < 6:
                skipped += 1
                continue

            if street not in ("flop", "turn", "river"):
                skipped += 1
                continue

            # Classify board texture from flop
            archetype = classify_flop_texture(board_flop)
            if not archetype:
                skipped += 1
                continue

            hand_class = combo_to_hand_class(holding)
            position = "ip" if hero_pos == "IP" else "oop"
            action = normalize_decision(decision)

            counts[archetype][street][position][hand_class][action] += 1
            archetype_counts[archetype] += 1
            street_counts[street] += 1

    print(f"Total rows: {total_rows}")
    print(f"Skipped: {skipped}")
    print(f"Processed: {total_rows - skipped}")
    print(f"\nStreet distribution:")
    for s, c in sorted(street_counts.items(), key=lambda x: -x[1]):
        print(f"  {s}: {c}")
    print(f"\nArchetype distribution:")
    for a, c in sorted(archetype_counts.items(), key=lambda x: -x[1]):
        print(f"  {a}: {c}")

    # Build output tables — one JSON per archetype
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    for archetype, streets in counts.items():
        table = {
            "archetypeId": archetype,
            "source": "PokerBench 500k solver-optimal postflop decisions",
            "totalRows": archetype_counts[archetype],
            "streets": {},
        }

        for street, positions in streets.items():
            street_data = {}
            for position, hand_classes in positions.items():
                pos_data = {}
                for hand_class, action_counts in sorted(hand_classes.items()):
                    sample_count = sum(action_counts.values())
                    pos_data[hand_class] = build_entry(action_counts, sample_count)
                street_data[position] = pos_data

            table["streets"][street] = street_data

        output_path = OUTPUT_DIR / f"{archetype}.json"
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(table, f, indent=2)

        total_hc = sum(
            len(hc)
            for street_data in table["streets"].values()
            for hc in street_data.values()
        )
        print(f"\nWrote {output_path.name}: {len(streets)} streets, {total_hc} hand class entries")

    # Print sample
    print("\n" + "=" * 60)
    print("SAMPLE: ace_high_dry_rainbow, flop, IP")
    print("=" * 60)
    ahdry = counts.get("ace_high_dry_rainbow", {})
    flop_ip = ahdry.get("flop", {}).get("ip", {})
    for hc in ["AKs", "AKo", "K8o", "K3o", "A2o", "72o"]:
        data = flop_ip.get(hc)
        if data:
            total = sum(data.values())
            print(f"  {hc:4s}: fold={data.get('fold',0)/total*100:5.1f}%  "
                  f"check={data.get('check',0)/total*100:5.1f}%  "
                  f"call={data.get('call',0)/total*100:5.1f}%  "
                  f"raise={data.get('raise',0)/total*100:5.1f}%  (n={total})")
        else:
            print(f"  {hc:4s}: no data")


if __name__ == "__main__":
    aggregate()
