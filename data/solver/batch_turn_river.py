"""
Turn + River Batch GTO Solver Pipeline
=======================================
Generates turn-only (2-street) and river-only (1-street) solver inputs,
runs batch solves, and parses outputs into frequency tables.

Uses the same 8 flop archetypes as the flop batch. For each archetype,
selects representative flops, then generates turn/river card scenarios
across 6 card categories:
  1. Brick (low, disconnected)
  2. Overcard (higher than board)
  3. Flush arriving (second suit match on rainbow, or third on two-tone)
  4. Straight connecting (fills gaps)
  5. Board pairing (duplicates a rank)
  6. Completing (flush or straight completes)

Usage:
  python batch_turn_river.py generate    # Generate all input files
  python batch_turn_river.py run         # Run solver on all inputs
  python batch_turn_river.py parse       # Parse outputs into frequency tables
  python batch_turn_river.py all         # Do everything
  python batch_turn_river.py status      # Show progress
"""

import json
import math
import os
import sys
import subprocess
import time
from pathlib import Path

# ===================================================================
# CONFIGURATION
# ===================================================================

SOLVER_DIR = Path(__file__).parent / "texassolver"
SOLVER_EXE = SOLVER_DIR / "console_solver.exe"
INPUT_DIR = Path(__file__).parent / "inputs_turn_river"

# Large solver outputs go to D: drive (12TB available)
# Raw JSONs are 500KB-2MB each — too large for git/project dir
OUTPUT_DIR = Path("D:/HoldemVision/solver_data/turn_river_outputs")

TABLES_DIR = Path(__file__).parent.parent / "frequency_tables"
MANIFEST_FILE = Path(__file__).parent / "manifest_turn_river.json"

RANKS = ['2','3','4','5','6','7','8','9','T','J','Q','K','A']
SUITS = ['c','d','h','s']
RANK_VAL = {r: i for i, r in enumerate(RANKS)}
VAL_RANK = {v: k for k, v in RANK_VAL.items()}


def combo_to_hand_class(hand_str):
    """Convert specific combo ('AcKd') to hand class ('AKo')."""
    r1_val = RANK_VAL.get(hand_str[0], 0)
    s1 = hand_str[1]
    r2_val = RANK_VAL.get(hand_str[2], 0)
    s2 = hand_str[3]
    high = VAL_RANK[max(r1_val, r2_val)]
    low = VAL_RANK[min(r1_val, r2_val)]
    if r1_val == r2_val:
        return f"{high}{low}"
    elif s1 == s2:
        return f"{high}{low}s"
    else:
        return f"{high}{low}o"

# Standard 100bb 6-max ranges (BTN vs BB single-raised pot)
BTN_RANGE = (
    "AA,KK,QQ,JJ,TT,99,88,77,66,55:0.75,44:0.5,33:0.5,22:0.25,"
    "AK,AQ,AJ,ATs,ATo:0.75,A9s,A8s,A7s,A6s,A5s,A4s,A3s,A2s,"
    "KQ,KJs,KJo:0.75,KTs,K9s,K8s:0.5,K7s:0.5,K6s:0.5,K5s:0.5,"
    "QJ,QTs,Q9s,Q8s:0.5,"
    "JTs,JTo:0.5,J9s,J8s:0.75,"
    "T9s,T8s:0.75,T7s:0.5,"
    "98s,97s:0.75,96s:0.5,"
    "87s,86s:0.5,85s:0.25,"
    "76s,75s:0.5,"
    "65s,64s:0.5,"
    "54s,53s:0.5,"
    "43s:0.5"
)

BB_RANGE = (
    "QQ:0.5,JJ:0.75,TT,99,88,77,66,55,44,33,22,"
    "AKo:0.25,AQs,AQo:0.75,AJs,AJo:0.75,ATs,ATo:0.75,A9s,A8s,A7s,A6s,A5s,A4s,A3s,A2s,"
    "KQ,KJs,KJo:0.75,KTs,KTo:0.5,K9s,K8s,K7s,K6s,K5s,K4s:0.5,K3s:0.5,K2s:0.5,"
    "QJ,QTs,QTo:0.25,Q9s,Q8s,Q7s,Q6s:0.5,"
    "JTs,JTo:0.5,J9s,J8s,J7s:0.5,"
    "T9s,T8s,T7s,T6s:0.5,"
    "98s,97s,96s:0.5,"
    "87s,86s,85s:0.25,"
    "76s,75s,"
    "65s,64s,"
    "54s,53s,"
    "43s"
)

# Turn solve: pot grew from flop action (~2x original)
TURN_SETTINGS = {
    "pot": 12,
    "stack": 94,
    "thread_num": 8,
    "accuracy": 0.5,
    "max_iteration": 200,
    "print_interval": 50,
    "use_isomorphism": 1,
    "allin_threshold": 0.67,
    "dump_rounds": 2,  # turn + river
}

# River solve: pot grew further (~3x original)
RIVER_SETTINGS = {
    "pot": 24,
    "stack": 76,
    "thread_num": 8,
    "accuracy": 0.5,
    "max_iteration": 200,
    "print_interval": 50,
    "use_isomorphism": 1,
    "allin_threshold": 0.67,
    "dump_rounds": 1,  # river only
}

# ===================================================================
# REPRESENTATIVE BOARDS — 2 flops per archetype
# ===================================================================

REPRESENTATIVE_FLOPS = {
    "ace_high_dry_rainbow": [
        ["As", "7d", "2c"],
        ["Ah", "8c", "3d"],
    ],
    "kq_high_dry_rainbow": [
        ["Ks", "8d", "3c"],
        ["Qh", "7c", "2d"],
    ],
    "mid_low_dry_rainbow": [
        ["9s", "5d", "2c"],
        ["Ts", "6c", "3d"],
    ],
    "paired_boards": [
        ["8s", "8d", "3c"],
        ["Js", "Jd", "4c"],
    ],
    "two_tone_disconnected": [
        ["Kh", "8h", "3c"],
        ["Qs", "5s", "2d"],
    ],
    "two_tone_connected": [
        ["Jh", "9h", "4c"],
        ["Ts", "8s", "3d"],
    ],
    "monotone": [
        ["8h", "5h", "2h"],
        ["Js", "7s", "3s"],
    ],
    "rainbow_connected": [
        ["8s", "7d", "6c"],
        ["9h", "8c", "7d"],
    ],
}

# ===================================================================
# TURN CARD SELECTION
# ===================================================================

def card_rank(card):
    return RANK_VAL[card[0]]

def card_suit(card):
    return card[1]

def board_ranks(flop):
    return sorted([card_rank(c) for c in flop], reverse=True)

def board_suits(flop):
    return [card_suit(c) for c in flop]

def card_on_board(card, flop):
    """Check if exact card is already on the board."""
    return card in flop

def rank_on_board(rank_char, flop):
    """Check if a rank already appears on the board."""
    return any(c[0] == rank_char for c in flop)

def find_unused_suit(flop, prefer_new=True):
    """Find a suit not used on the board, or least-used suit."""
    used = [card_suit(c) for c in flop]
    unused = [s for s in SUITS if s not in used]
    if unused:
        return unused[0]
    # All suits used (shouldn't happen with 3-card flop), return least common
    from collections import Counter
    counts = Counter(used)
    return min(SUITS, key=lambda s: counts.get(s, 0))

def find_matching_suit(flop, count=1):
    """Find a suit that appears exactly `count` times on the board."""
    from collections import Counter
    counts = Counter(card_suit(c) for c in flop)
    for s, c in counts.items():
        if c == count:
            return s
    return None

def pick_turn_cards(flop):
    """
    Pick 6 turn cards for a flop, one per category.
    Returns list of (category_name, card_string) tuples.
    """
    ranks = board_ranks(flop)
    suits = board_suits(flop)
    high_rank = ranks[0]
    low_rank = ranks[-1]
    board_rank_set = set(c[0] for c in flop)
    all_board_cards = set(flop)

    turns = []

    # 1. BRICK: low card, different suit, no connectivity
    brick_rank = '2' if '2' not in board_rank_set else '3'
    if brick_rank in board_rank_set:
        brick_rank = '4'
    brick_suit = find_unused_suit(flop)
    brick = f"{brick_rank}{brick_suit}"
    if brick in all_board_cards:
        brick_suit = [s for s in SUITS if f"{brick_rank}{s}" not in all_board_cards][0]
        brick = f"{brick_rank}{brick_suit}"
    turns.append(("brick", brick))

    # 2. OVERCARD: higher than highest board card
    if high_rank < 12:  # Not ace-high
        over_rank = RANKS[high_rank + 1]
        over_suit = find_unused_suit(flop)
        over = f"{over_rank}{over_suit}"
        if over in all_board_cards:
            over_suit = [s for s in SUITS if f"{over_rank}{s}" not in all_board_cards][0]
            over = f"{over_rank}{over_suit}"
        turns.append(("overcard", over))
    else:
        # Ace-high: use King as "high card arrives"
        ksuit = find_unused_suit(flop)
        k = f"K{ksuit}"
        if k in all_board_cards:
            ksuit = [s for s in SUITS if f"K{s}" not in all_board_cards][0]
            k = f"K{ksuit}"
        turns.append(("overcard", k))

    # 3. FLUSH DRAW ARRIVING: add second of a suit (rainbow) or third (two-tone)
    from collections import Counter
    suit_counts = Counter(suits)
    if suit_counts.most_common(1)[0][1] == 1:
        # Rainbow: pick a suit that appears once, add another of that suit
        target_suit = suits[0]
        fd_rank = '9' if '9' not in board_rank_set else 'T'
        if fd_rank in board_rank_set:
            fd_rank = 'J'
        fd = f"{fd_rank}{target_suit}"
        if fd in all_board_cards:
            fd_rank = 'Q'
            fd = f"{fd_rank}{target_suit}"
        turns.append(("flush_draw", fd))
    elif suit_counts.most_common(1)[0][1] == 2:
        # Two-tone: third of the flush suit = flush completing
        flush_suit = suit_counts.most_common(1)[0][0]
        fc_rank = 'T' if 'T' not in board_rank_set else 'J'
        if fc_rank in board_rank_set:
            fc_rank = 'Q'
        fc = f"{fc_rank}{flush_suit}"
        if fc in all_board_cards:
            fc_rank = '9'
            fc = f"{fc_rank}{flush_suit}"
        turns.append(("flush_completing", fc))
    else:
        # Monotone: fourth of the suit
        mono_suit = suits[0]
        fc_rank = 'A' if 'A' not in board_rank_set else 'K'
        if fc_rank in board_rank_set:
            fc_rank = 'Q'
        fc = f"{fc_rank}{mono_suit}"
        if fc in all_board_cards:
            fc_rank = 'T'
            fc = f"{fc_rank}{mono_suit}"
        turns.append(("flush_completing", fc))

    # 4. STRAIGHT CONNECTING: card that adds straight draw potential
    # Find a rank adjacent to board cards
    for delta in [1, -1, 2, -2]:
        target = ranks[1] + delta  # middle card
        if 0 <= target <= 12 and RANKS[target] not in board_rank_set:
            sc_rank = RANKS[target]
            sc_suit = find_unused_suit(flop)
            sc = f"{sc_rank}{sc_suit}"
            if sc in all_board_cards:
                sc_suit = [s for s in SUITS if f"{sc_rank}{s}" not in all_board_cards][0]
                sc = f"{sc_rank}{sc_suit}"
            turns.append(("straight_connecting", sc))
            break
    else:
        # Fallback: just pick a mid card
        sc_rank = '6' if '6' not in board_rank_set else '7'
        sc_suit = find_unused_suit(flop)
        turns.append(("straight_connecting", f"{sc_rank}{sc_suit}"))

    # 5. BOARD PAIRING: duplicates a board rank
    pair_rank = flop[1][0]  # middle card rank
    pair_suit = [s for s in SUITS if f"{pair_rank}{s}" not in all_board_cards][0]
    turns.append(("board_pairing", f"{pair_rank}{pair_suit}"))

    # 6. HIGH CARD / SECOND PAIR: a face card that doesn't match board
    for fc_rank in ['K', 'Q', 'J', 'T']:
        if fc_rank not in board_rank_set:
            fc_suit = find_unused_suit(flop)
            fc = f"{fc_rank}{fc_suit}"
            if fc in all_board_cards:
                fc_suit = [s for s in SUITS if f"{fc_rank}{s}" not in all_board_cards][0]
                fc = f"{fc_rank}{fc_suit}"
            turns.append(("high_card", fc))
            break

    return turns


def pick_river_cards(flop, turn_card):
    """
    Pick 6 river cards for a flop+turn, one per category.
    Same logic as turn but with 4-card board context.
    """
    board = flop + [turn_card]
    ranks = sorted([card_rank(c) for c in board], reverse=True)
    high_rank = ranks[0]
    board_rank_set = set(c[0] for c in board)
    all_board_cards = set(board)

    from collections import Counter
    suit_counts = Counter(card_suit(c) for c in board)

    rivers = []

    # 1. BRICK
    for br in ['2', '3', '4']:
        if br not in board_rank_set:
            bs = [s for s in SUITS if f"{br}{s}" not in all_board_cards][0]
            rivers.append(("brick", f"{br}{bs}"))
            break
    else:
        for br in RANKS:
            if br not in board_rank_set:
                bs = [s for s in SUITS if f"{br}{s}" not in all_board_cards][0]
                rivers.append(("brick", f"{br}{bs}"))
                break

    # 2. OVERCARD
    if high_rank < 12:
        or_rank = RANKS[high_rank + 1]
        os = [s for s in SUITS if f"{or_rank}{s}" not in all_board_cards][0]
        rivers.append(("overcard", f"{or_rank}{os}"))
    else:
        for or_rank in ['K', 'Q']:
            if or_rank not in board_rank_set:
                os = [s for s in SUITS if f"{or_rank}{s}" not in all_board_cards][0]
                rivers.append(("overcard", f"{or_rank}{os}"))
                break
        else:
            rivers.append(("overcard", rivers[0][1]))  # fallback duplicate

    # 3. FLUSH COMPLETING: if 3 of a suit on board, add 4th
    flush_suit = None
    for s, c in suit_counts.items():
        if c >= 3:
            flush_suit = s
            break
        if c == 2 and flush_suit is None:
            flush_suit = s

    if flush_suit:
        for fr in ['A', 'K', 'Q', 'J', 'T', '9', '8']:
            card = f"{fr}{flush_suit}"
            if card not in all_board_cards and fr not in board_rank_set:
                rivers.append(("flush_completing", card))
                break
        else:
            for fr in RANKS[::-1]:
                card = f"{fr}{flush_suit}"
                if card not in all_board_cards:
                    rivers.append(("flush_completing", card))
                    break
    else:
        # No flush draw possible, use a random suited card
        rivers.append(("flush_completing", rivers[0][1]))

    # 4. STRAIGHT COMPLETING
    for delta in [1, -1, 2]:
        target = ranks[2] + delta
        if 0 <= target <= 12 and RANKS[target] not in board_rank_set:
            sr = RANKS[target]
            ss = [s for s in SUITS if f"{sr}{s}" not in all_board_cards][0]
            rivers.append(("straight_connecting", f"{sr}{ss}"))
            break
    else:
        for sr in ['5', '6', '7', '8', '9']:
            if sr not in board_rank_set:
                ss = [s for s in SUITS if f"{sr}{s}" not in all_board_cards][0]
                rivers.append(("straight_connecting", f"{sr}{ss}"))
                break

    # 5. BOARD PAIRING
    for pr in [c[0] for c in board]:
        card_options = [f"{pr}{s}" for s in SUITS if f"{pr}{s}" not in all_board_cards]
        if card_options:
            rivers.append(("board_pairing", card_options[0]))
            break

    # 6. HIGH CARD
    for hr in ['A', 'K', 'Q', 'J']:
        if hr not in board_rank_set:
            hs = [s for s in SUITS if f"{hr}{s}" not in all_board_cards][0]
            rivers.append(("high_card", f"{hr}{hs}"))
            break
    else:
        rivers.append(("high_card", rivers[0][1]))

    # Deduplicate — ensure no duplicate cards
    seen = set()
    unique = []
    for cat, card in rivers:
        if card not in seen and card not in all_board_cards:
            seen.add(card)
            unique.append((cat, card))
    return unique


# ===================================================================
# INPUT FILE GENERATION
# ===================================================================

def generate_turn_input(flop_cards, turn_card, output_name):
    """Generate a turn-only (2-street) solver input."""
    s = TURN_SETTINGS
    board = flop_cards + [turn_card]
    lines = [
        f"set_pot {s['pot']}",
        f"set_effective_stack {s['stack']}",
        f"set_board {','.join(board)}",
        f"set_range_ip {BTN_RANGE}",
        f"set_range_oop {BB_RANGE}",
        # Turn bet sizes
        "set_bet_sizes oop,turn,bet,50,75",
        "set_bet_sizes oop,turn,raise,60",
        "set_bet_sizes oop,turn,allin",
        "set_bet_sizes ip,turn,bet,50,75",
        "set_bet_sizes ip,turn,raise,60",
        "set_bet_sizes ip,turn,allin",
        # River bet sizes
        "set_bet_sizes oop,river,bet,50,100",
        "set_bet_sizes oop,river,raise,60",
        "set_bet_sizes oop,river,allin",
        "set_bet_sizes ip,river,bet,50,100",
        "set_bet_sizes ip,river,raise,60",
        "set_bet_sizes ip,river,allin",
        f"set_allin_threshold {s['allin_threshold']}",
        "build_tree",
        f"set_thread_num {s['thread_num']}",
        f"set_accuracy {s['accuracy']}",
        f"set_max_iteration {s['max_iteration']}",
        f"set_print_interval {s['print_interval']}",
        f"set_use_isomorphism {s['use_isomorphism']}",
        "start_solve",
        f"set_dump_rounds {s['dump_rounds']}",
        f"dump_result {output_name}",
    ]
    return "\n".join(lines) + "\n"


def generate_river_input(flop_cards, turn_card, river_card, output_name):
    """Generate a river-only (1-street) solver input."""
    s = RIVER_SETTINGS
    board = flop_cards + [turn_card, river_card]
    lines = [
        f"set_pot {s['pot']}",
        f"set_effective_stack {s['stack']}",
        f"set_board {','.join(board)}",
        f"set_range_ip {BTN_RANGE}",
        f"set_range_oop {BB_RANGE}",
        # River bet sizes only
        "set_bet_sizes oop,river,bet,50,100",
        "set_bet_sizes oop,river,raise,60",
        "set_bet_sizes oop,river,allin",
        "set_bet_sizes ip,river,bet,50,100",
        "set_bet_sizes ip,river,raise,60",
        "set_bet_sizes ip,river,allin",
        f"set_allin_threshold {s['allin_threshold']}",
        "build_tree",
        f"set_thread_num {s['thread_num']}",
        f"set_accuracy {s['accuracy']}",
        f"set_max_iteration {s['max_iteration']}",
        f"set_print_interval {s['print_interval']}",
        f"set_use_isomorphism {s['use_isomorphism']}",
        "start_solve",
        f"set_dump_rounds {s['dump_rounds']}",
        f"dump_result {output_name}",
    ]
    return "\n".join(lines) + "\n"


def generate_all_inputs():
    """Generate all turn and river solver input files."""
    INPUT_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    manifest = {"turn": {}, "river": {}}
    turn_count = 0
    river_count = 0

    for archetype, flops in REPRESENTATIVE_FLOPS.items():
        manifest["turn"][archetype] = []
        manifest["river"][archetype] = []

        for flop_idx, flop in enumerate(flops):
            flop_str = "".join(c.replace(",", "") for c in flop)
            turn_cards = pick_turn_cards(flop)

            for turn_cat, turn_card in turn_cards:
                # --- TURN INPUT ---
                turn_name = f"turn_{archetype}_{flop_idx}_{turn_cat}"
                turn_input_file = INPUT_DIR / f"{turn_name}.txt"
                turn_output_file = f"../../outputs_turn_river/{turn_name}.json"

                content = generate_turn_input(flop, turn_card, turn_output_file)
                turn_input_file.write_text(content)

                manifest["turn"][archetype].append({
                    "name": turn_name,
                    "flop": flop,
                    "turn_card": turn_card,
                    "turn_category": turn_cat,
                    "board": flop + [turn_card],
                    "input": str(turn_input_file),
                    "output": str(OUTPUT_DIR / f"{turn_name}.json"),
                })
                turn_count += 1

                # --- RIVER INPUTS (6 per turn) ---
                river_cards = pick_river_cards(flop, turn_card)

                for river_cat, river_card in river_cards:
                    river_name = f"river_{archetype}_{flop_idx}_{turn_cat}_{river_cat}"
                    river_input_file = INPUT_DIR / f"{river_name}.txt"
                    river_output_file = f"../../outputs_turn_river/{river_name}.json"

                    content = generate_river_input(flop, turn_card, river_card, river_output_file)
                    river_input_file.write_text(content)

                    manifest["river"][archetype].append({
                        "name": river_name,
                        "flop": flop,
                        "turn_card": turn_card,
                        "turn_category": turn_cat,
                        "river_card": river_card,
                        "river_category": river_cat,
                        "board": flop + [turn_card, river_card],
                        "input": str(river_input_file),
                        "output": str(OUTPUT_DIR / f"{river_name}.json"),
                    })
                    river_count += 1

    # Save manifest
    with open(MANIFEST_FILE, 'w') as f:
        json.dump(manifest, f, indent=2)

    print(f"Generated {turn_count} turn + {river_count} river = {turn_count + river_count} total input files")
    print(f"\nTurn solves by archetype:")
    for arch, entries in manifest["turn"].items():
        print(f"  {arch}: {len(entries)} boards")
    print(f"\nRiver solves by archetype:")
    for arch, entries in manifest["river"].items():
        print(f"  {arch}: {len(entries)} boards")

    # Time estimate
    est_turn = turn_count * 20  # ~20s each
    est_river = river_count * 8  # ~8s each
    est_total = est_turn + est_river
    print(f"\nEstimated solve time (sequential):")
    print(f"  Turn: {turn_count} x ~20s = ~{est_turn // 60} min")
    print(f"  River: {river_count} x ~8s = ~{est_river // 60} min")
    print(f"  Total: ~{est_total // 60} min ({est_total / 3600:.1f} hours)")


# ===================================================================
# BATCH SOLVER RUNNER
# ===================================================================

def run_all_solves(street_filter=None):
    """Run solver on all generated input files.

    Args:
        street_filter: "turn", "river", or None for both
    """
    with open(MANIFEST_FILE) as f:
        manifest = json.load(f)

    streets = []
    if street_filter in (None, "turn"):
        for entries in manifest["turn"].values():
            streets.extend(entries)
    if street_filter in (None, "river"):
        for entries in manifest["river"].values():
            streets.extend(entries)

    total = len(streets)
    completed = 0
    skipped = 0
    failed = 0
    start_time = time.time()

    print(f"Running {total} solves...")
    print(f"{'=' * 60}")

    for entry in streets:
        name = entry['name']
        output_path = Path(entry['output'])

        # Skip if already solved
        if output_path.exists() and output_path.stat().st_size > 100:
            skipped += 1
            continue

        board_str = ','.join(entry['board'])
        print(f"  [{completed + skipped + failed + 1}/{total}] {name} ({board_str}) ...", end=" ", flush=True)
        solve_start = time.time()

        try:
            input_content = Path(entry['input']).read_text()
            abs_output = str(output_path.resolve()).replace('\\', '/')
            lines = input_content.strip().split('\n')
            lines = [l if not l.startswith('dump_result') else f'dump_result {abs_output}' for l in lines]

            temp_input = SOLVER_DIR / f"_temp_tr_input.txt"
            temp_input.write_text('\n'.join(lines) + '\n')

            result = subprocess.run(
                [str(SOLVER_EXE), "-i", str(temp_input)],
                cwd=str(SOLVER_DIR),
                capture_output=True,
                text=True,
                timeout=300,  # 5 min max per solve
            )

            solve_time = time.time() - solve_start

            if output_path.exists() and output_path.stat().st_size > 100:
                completed += 1
                size_kb = output_path.stat().st_size // 1024
                print(f"OK ({solve_time:.0f}s, {size_kb}KB)")
            else:
                failed += 1
                print(f"FAIL ({solve_time:.0f}s)")
                err_file = OUTPUT_DIR / f"{name}.err"
                err_file.write_text(result.stderr or result.stdout or "unknown error")

        except subprocess.TimeoutExpired:
            failed += 1
            print("TIMEOUT")
        except Exception as e:
            failed += 1
            print(f"ERROR: {e}")

        # Progress
        done = completed + skipped + failed
        elapsed = time.time() - start_time
        rate = (completed + failed) / elapsed if elapsed > 0 and (completed + failed) > 0 else 0.05
        remaining = (total - done) / rate if rate > 0 else 0
        if done % 10 == 0:
            print(f"    Progress: {done}/{total} | {completed} ok, {skipped} skip, {failed} fail | ~{remaining / 60:.0f}m left")

    elapsed = time.time() - start_time
    print(f"\n{'=' * 60}")
    print(f"DONE: {completed} solved, {skipped} skipped, {failed} failed ({total} total)")
    print(f"Total time: {elapsed:.0f}s ({elapsed / 60:.1f} min)")


# ===================================================================
# OUTPUT PARSER
# ===================================================================

def categorize_hand(hand_str, board_cards):
    """Categorize a hand relative to the board (same logic as flop parser)."""
    r1, s1 = RANK_VAL[hand_str[0]], hand_str[1]
    r2, s2 = RANK_VAL[hand_str[2]], hand_str[3]
    board = [(RANK_VAL[c[0]], c[1]) for c in board_cards]
    board_ranks = sorted([b[0] for b in board], reverse=True)
    board_suits = [b[1] for b in board]
    hero_ranks = sorted([r1, r2], reverse=True)

    is_pocket_pair = r1 == r2
    all_ranks = [r1, r2] + [b[0] for b in board]
    rank_counts = {}
    for r in all_ranks:
        rank_counts[r] = rank_counts.get(r, 0) + 1

    # Sets/trips/quads
    for r in [r1, r2]:
        if rank_counts.get(r, 0) >= 3:
            return 'sets_plus'

    # Two pair
    hero_board_matches = [r for r in hero_ranks if r in board_ranks]
    if len(set(hero_board_matches)) >= 2:
        return 'two_pair'

    # Flush draw
    has_flush_draw = False
    if s1 == s2:
        matching = sum(1 for bs in board_suits if bs == s1)
        if len(board_cards) == 4:
            has_flush_draw = matching >= 2  # 4 to flush on turn
        else:
            has_flush_draw = matching >= 3  # flush made on river
    else:
        for hs in [s1, s2]:
            count = sum(1 for bs in board_suits if bs == hs)
            if len(board_cards) == 4 and count >= 2:
                has_flush_draw = True
            elif len(board_cards) == 5 and count >= 3:
                has_flush_draw = True  # Actually made flush

    # Straight draw
    all_unique = sorted(set([r1, r2] + [b[0] for b in board]))
    has_straight_draw = False
    for start in range(13):
        window = [r for r in all_unique if start <= r <= start + 4]
        if len(window) >= 4:
            has_straight_draw = True
            break

    if is_pocket_pair:
        if r1 > board_ranks[0]:
            return 'overpair'
        if r1 > board_ranks[-1]:
            return 'middle_pair'
        return 'underpair'

    top = board_ranks[0]
    if r1 == top or r2 == top:
        kicker = r2 if r1 == top else r1
        if kicker >= 10:
            return 'top_pair_top_kicker'
        return 'top_pair_weak_kicker'

    mid = board_ranks[1] if len(board_ranks) > 1 else -1
    if r1 == mid or r2 == mid:
        return 'middle_pair'

    if any(r in board_ranks for r in [r1, r2]):
        return 'bottom_pair'

    if has_flush_draw and has_straight_draw:
        return 'combo_draw'
    if has_flush_draw:
        return 'flush_draw'
    if has_straight_draw:
        return 'straight_draw'

    if hero_ranks[0] > board_ranks[0] and hero_ranks[1] > board_ranks[0]:
        return 'overcards'

    return 'air'


def normalize_action(action_str, pot_size):
    """Normalize solver action to our categories."""
    if action_str == 'CHECK':
        return 'check'
    if action_str == 'FOLD':
        return 'fold'
    if action_str == 'CALL':
        return 'call'
    if action_str.startswith('BET'):
        try:
            amount = float(action_str.split()[1])
            ratio = amount / pot_size
            if ratio <= 0.45:
                return 'bet_small'
            elif ratio <= 0.85:
                return 'bet_medium'
            else:
                return 'bet_large'
        except:
            return 'bet_medium'
    if action_str.startswith('RAISE'):
        try:
            amount = float(action_str.split()[1])
            ratio = amount / pot_size
            if ratio <= 0.6:
                return 'raise_small'
            else:
                return 'raise_large'
        except:
            return 'raise_large'
    return action_str.lower()


def parse_solver_output(filepath, board_cards, pot_size):
    """Parse a solver output into categorized + hand-class frequencies."""
    with open(filepath) as f:
        data = json.load(f)

    result = {"oop": {}, "ip": {}, "oop_hand_class": {}, "ip_hand_class": {}}

    oop_actions = data.get('actions', [])
    oop_strategy = data.get('strategy', {}).get('strategy', {})

    if oop_strategy:
        cat_data, hc_data = aggregate_by_category(oop_strategy, oop_actions, board_cards, pot_size)
        result['oop'] = cat_data
        result['oop_hand_class'] = hc_data

    # IP acts after OOP checks
    check_node = data.get('childrens', {}).get('CHECK', {})
    if check_node:
        ip_actions = check_node.get('actions', [])
        ip_strategy = check_node.get('strategy', {}).get('strategy', {})
        if ip_strategy:
            cat_data, hc_data = aggregate_by_category(ip_strategy, ip_actions, board_cards, pot_size)
            result['ip'] = cat_data
            result['ip_hand_class'] = hc_data

    return result


def aggregate_by_category(strategy, actions, board_cards, pot_size):
    """Aggregate per-combo strategy into hand category AND hand class frequencies."""
    categories = {}
    hand_classes = {}
    norm_actions = [normalize_action(a, pot_size) for a in actions]
    unique_actions = sorted(set(norm_actions))

    for hand, probs in strategy.items():
        cat = categorize_hand(hand, board_cards)
        hc = combo_to_hand_class(hand)

        # Per-category (existing)
        if cat not in categories:
            categories[cat] = {'totals': {a: 0.0 for a in unique_actions}, 'count': 0}
        for i, p in enumerate(probs):
            if i < len(norm_actions):
                na = norm_actions[i]
                categories[cat]['totals'][na] = categories[cat]['totals'].get(na, 0) + p
        categories[cat]['count'] += 1

        # Per-hand-class (new)
        if hc not in hand_classes:
            hand_classes[hc] = {'totals': {a: 0.0 for a in unique_actions}, 'count': 0}
        for i, p in enumerate(probs):
            if i < len(norm_actions):
                na = norm_actions[i]
                hand_classes[hc]['totals'][na] = hand_classes[hc]['totals'].get(na, 0) + p
        hand_classes[hc]['count'] += 1

    cat_result = {}
    for cat, data in categories.items():
        if data['count'] > 0:
            cat_result[cat] = {a: v / data['count'] for a, v in data['totals'].items()}
            cat_result[cat]['_count'] = data['count']

    hc_result = {}
    for hc, data in hand_classes.items():
        if data['count'] > 0:
            hc_result[hc] = {a: round(v / data['count'], 4) for a, v in data['totals'].items()}

    return cat_result, hc_result


def parse_all_outputs():
    """Parse all turn/river solver outputs into frequency tables."""
    with open(MANIFEST_FILE) as f:
        manifest = json.load(f)

    TABLES_DIR.mkdir(parents=True, exist_ok=True)

    for street in ["turn", "river"]:
        pot_size = TURN_SETTINGS["pot"] if street == "turn" else RIVER_SETTINGS["pot"]

        for archetype, entries in manifest[street].items():
            table_name = f"{street}_{archetype}"
            print(f"\nParsing {table_name}...")

            all_ip = {}
            all_oop = {}
            all_ip_hc = {}
            all_oop_hc = {}
            parsed = 0

            for entry in entries:
                output_path = Path(entry['output'])
                if not output_path.exists():
                    continue

                try:
                    result = parse_solver_output(output_path, entry['board'], pot_size)
                    parsed += 1

                    for cat, freqs in result.get('ip', {}).items():
                        if cat not in all_ip:
                            all_ip[cat] = {}
                        for action, val in freqs.items():
                            if action == '_count':
                                continue
                            if action not in all_ip[cat]:
                                all_ip[cat][action] = []
                            all_ip[cat][action].append(val)

                    for cat, freqs in result.get('oop', {}).items():
                        if cat not in all_oop:
                            all_oop[cat] = {}
                        for action, val in freqs.items():
                            if action == '_count':
                                continue
                            if action not in all_oop[cat]:
                                all_oop[cat][action] = []
                            all_oop[cat][action].append(val)

                    for hc, freqs in result.get('ip_hand_class', {}).items():
                        if hc not in all_ip_hc:
                            all_ip_hc[hc] = {}
                        for action, val in freqs.items():
                            if action not in all_ip_hc[hc]:
                                all_ip_hc[hc][action] = []
                            all_ip_hc[hc][action].append(val)

                    for hc, freqs in result.get('oop_hand_class', {}).items():
                        if hc not in all_oop_hc:
                            all_oop_hc[hc] = {}
                        for action, val in freqs.items():
                            if action not in all_oop_hc[hc]:
                                all_oop_hc[hc][action] = []
                            all_oop_hc[hc][action].append(val)

                except Exception as e:
                    print(f"  Error parsing {entry['name']}: {e}")

            if parsed == 0:
                print(f"  No outputs found - skipping")
                continue

            def average_freqs(data):
                result = {}
                for cat, actions in data.items():
                    result[cat] = {}
                    for action, values in actions.items():
                        result[cat][action] = round(sum(values) / len(values), 4)
                return result

            def compute_band_stats(data):
                result = {}
                for cat, actions in data.items():
                    result[cat] = {}
                    for action, values in actions.items():
                        n = len(values)
                        if n == 0:
                            continue
                        mean = sum(values) / n
                        std_dev = math.sqrt(sum((v - mean) ** 2 for v in values) / n) if n > 1 else 0.0
                        result[cat][action] = {
                            "mean": round(mean, 4),
                            "stdDev": round(std_dev, 4),
                            "min": round(min(values), 4),
                            "max": round(max(values), 4),
                            "sampleCount": n,
                        }
                return result

            ip_avg = average_freqs(all_ip)
            oop_avg = average_freqs(all_oop)
            ip_bands = compute_band_stats(all_ip)
            oop_bands = compute_band_stats(all_oop)
            ip_hc_avg = average_freqs(all_ip_hc)
            oop_hc_avg = average_freqs(all_oop_hc)

            # Accuracy
            all_std_devs = []
            for bands in [ip_bands, oop_bands]:
                for cat_bands in bands.values():
                    for action_stats in cat_bands.values():
                        if isinstance(action_stats, dict) and action_stats.get('sampleCount', 0) >= 2:
                            all_std_devs.append(action_stats['stdDev'])
            avg_std = sum(all_std_devs) / len(all_std_devs) if all_std_devs else 0
            accuracy = max(0, min(1, 1 - avg_std))

            table = {
                "archetypeId": archetype,
                "street": street,
                "boardsAnalyzed": parsed,
                "context": {
                    "street": street,
                    "potType": "srp",
                    "heroPosition": "btn",
                    "villainPosition": "bb",
                },
                "ip_frequencies": ip_avg,
                "oop_frequencies": oop_avg,
                "actions_ip": sorted(set(a for cat in ip_avg.values() for a in cat.keys())),
                "actions_oop": sorted(set(a for cat in oop_avg.values() for a in cat.keys())),
                "ip_distributions": {cat: {act: vals for act, vals in actions.items()}
                                      for cat, actions in all_ip.items()},
                "oop_distributions": {cat: {act: vals for act, vals in actions.items()}
                                       for cat, actions in all_oop.items()},
                "ip_bands": ip_bands,
                "oop_bands": oop_bands,
                "ip_hand_class": ip_hc_avg,
                "oop_hand_class": oop_hc_avg,
                "accuracy": {
                    "avgStdDev": round(avg_std, 4),
                    "accuracy": round(accuracy, 4),
                    "boardCount": parsed,
                },
            }

            table_file = TABLES_DIR / f"{table_name}.json"
            with open(table_file, 'w') as f:
                json.dump(table, f, indent=2)

            acc_label = "very high" if accuracy >= 0.95 else "high" if accuracy >= 0.90 else "moderate" if accuracy >= 0.80 else "approximate"
            print(f"  {parsed} boards parsed")
            print(f"  IP categories: {list(ip_avg.keys())}")
            print(f"  Accuracy: {accuracy:.1%} ({acc_label})")
            print(f"  Written to {table_file}")


def show_status():
    """Show current progress of the batch run."""
    if not MANIFEST_FILE.exists():
        print("No manifest found. Run 'generate' first.")
        return

    with open(MANIFEST_FILE) as f:
        manifest = json.load(f)

    for street in ["turn", "river"]:
        total = sum(len(v) for v in manifest[street].values())
        done = 0
        for entries in manifest[street].values():
            for entry in entries:
                if Path(entry['output']).exists():
                    done += 1
        print(f"{street.upper()}: {done}/{total} solved ({done*100//total if total else 0}%)")


# ===================================================================
# MAIN
# ===================================================================

if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'help'

    if cmd == 'generate':
        generate_all_inputs()
    elif cmd == 'run':
        street = sys.argv[2] if len(sys.argv) > 2 else None
        run_all_solves(street)
    elif cmd == 'parse':
        parse_all_outputs()
    elif cmd == 'all':
        generate_all_inputs()
        run_all_solves()
        parse_all_outputs()
    elif cmd == 'status':
        show_status()
    else:
        print(__doc__)
