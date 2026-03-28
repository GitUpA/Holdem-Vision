"""
Batch GTO Solver Pipeline
=========================
Generates input configs for TexasSolver, runs batch solves,
and parses output into frequency tables for HoldemVision.

Usage:
  python batch_solve.py generate   # Generate input files
  python batch_solve.py run        # Run solver on all inputs
  python batch_solve.py parse      # Parse outputs into frequency tables
  python batch_solve.py all        # Do everything
"""

import json
import os
import sys
import subprocess
import time
import random
from pathlib import Path

# ═══════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════

SOLVER_DIR = Path(__file__).parent / "texassolver"
SOLVER_EXE = SOLVER_DIR / "console_solver.exe"
INPUT_DIR = Path(__file__).parent / "inputs"
OUTPUT_DIR = Path(__file__).parent / "outputs"
TABLES_DIR = Path(__file__).parent.parent / "frequency_tables"
RANGE_CONFIGS_DIR = Path(__file__).parent / "range_configs"

# Default scenario: BTN vs BB (can be overridden via --scenario)
ACTIVE_SCENARIO = None  # Set via CLI

# Standard 100bb 6-max ranges (BTN vs BB single-raised pot)
# BTN RFI range (~45% of hands)
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

# BB defend range vs BTN RFI (~55% of hands)
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

RANKS = ['2','3','4','5','6','7','8','9','T','J','Q','K','A']
SUITS = ['c','d','h','s']

SOLVER_SETTINGS = {
    "pot": 6,              # 3bb open + 3bb call (roughly)
    "stack": 97,           # 100bb - 3bb
    "thread_num": 8,
    "accuracy": 0.5,
    "max_iteration": 200,
    "print_interval": 50,
    "use_isomorphism": 1,
    "allin_threshold": 0.67,
    "dump_rounds": 1,      # flop only
}

# Bet sizes for each archetype type
BET_SIZES_STANDARD = {
    "oop_flop_bet": "33,75",
    "oop_flop_raise": "60",
    "ip_flop_bet": "33,75",
    "ip_flop_raise": "60",
}

# ═══════════════════════════════════════════════════════
# BOARD GENERATION
# ═══════════════════════════════════════════════════════

def rank_val(r):
    return RANKS.index(r)

def generate_boards():
    """Generate representative boards for each flop texture archetype."""
    random.seed(42)  # Reproducible
    boards = {}

    # Helper: pick N random cards avoiding conflicts
    def random_card(exclude_ranks=None, exclude_suits=None, force_rank=None, force_suit=None):
        r = random.choice(RANKS) if force_rank is None else force_rank
        s = random.choice(SUITS) if force_suit is None else force_suit
        if exclude_ranks and r in exclude_ranks:
            available = [x for x in RANKS if x not in exclude_ranks]
            r = random.choice(available) if available else r
        if exclude_suits and s in exclude_suits:
            available = [x for x in SUITS if x not in exclude_suits]
            s = random.choice(available) if available else s
        return f"{r}{s}"

    def make_rainbow(ranks_list):
        """Given 3 ranks, assign 3 different suits."""
        suits = random.sample(SUITS, 3)
        return [f"{r}{s}" for r, s in zip(ranks_list, suits)]

    def make_two_tone(ranks_list):
        """2 cards share a suit, 1 different."""
        s1 = random.choice(SUITS)
        s2 = random.choice([s for s in SUITS if s != s1])
        return [f"{ranks_list[0]}{s1}", f"{ranks_list[1]}{s1}", f"{ranks_list[2]}{s2}"]

    def make_monotone(ranks_list):
        """All 3 cards same suit."""
        s = random.choice(SUITS)
        return [f"{r}{s}" for r in ranks_list]

    # --- Archetype 6: Ace-High Dry Rainbow ---
    ace_high_dry = []
    for _ in range(50):
        mid = random.choice(['3','4','5','6','7','8','9'])
        low = random.choice(['2','3','4','5'])
        while low == mid:
            low = random.choice(['2','3','4','5'])
        # Ensure disconnected (gap > 2 between all)
        if abs(rank_val(mid) - rank_val(low)) <= 2:
            mid = random.choice(['7','8','9'])
        cards = make_rainbow(['A', mid, low])
        ace_high_dry.append(cards)
    boards['ace_high_dry_rainbow'] = ace_high_dry[:25]

    # --- Archetype 7: K/Q-High Dry Rainbow ---
    kq_high_dry = []
    for _ in range(50):
        high = random.choice(['K','Q'])
        mid = random.choice(['3','4','5','6','7','8'])
        low = random.choice(['2','3','4'])
        while low == mid:
            low = random.choice(['2','3'])
        if abs(rank_val(mid) - rank_val(low)) <= 1:
            mid = random.choice(['7','8'])
        cards = make_rainbow([high, mid, low])
        kq_high_dry.append(cards)
    boards['kq_high_dry_rainbow'] = kq_high_dry[:25]

    # --- Archetype 8: Mid/Low Dry Rainbow ---
    mid_low_dry = []
    for _ in range(50):
        high = random.choice(['7','8','9','T'])
        mid = random.choice(['4','5','6'])
        low = random.choice(['2','3'])
        while abs(rank_val(high) - rank_val(mid)) <= 1:
            mid = random.choice(['3','4'])
        cards = make_rainbow([high, mid, low])
        mid_low_dry.append(cards)
    boards['mid_low_dry_rainbow'] = mid_low_dry[:25]

    # --- Archetype 9: Paired Boards ---
    paired = []
    for _ in range(50):
        pair_rank = random.choice(RANKS[1:])  # 3 through A
        kicker_rank = random.choice([r for r in RANKS if r != pair_rank])
        s1, s2 = random.sample(SUITS, 2)
        s3 = random.choice([s for s in SUITS if s != s1])
        cards = [f"{pair_rank}{s1}", f"{pair_rank}{s2}", f"{kicker_rank}{s3}"]
        paired.append(cards)
    boards['paired_boards'] = paired[:25]

    # --- Archetype 10: Two-Tone Disconnected ---
    tt_disconnected = []
    for _ in range(50):
        high = random.choice(['A','K','Q','J','T'])
        mid = random.choice(['4','5','6','7'])
        low = random.choice(['2','3'])
        while abs(rank_val(mid) - rank_val(low)) <= 1:
            low = random.choice(['2','3'])
        cards = make_two_tone([high, mid, low])
        tt_disconnected.append(cards)
    boards['two_tone_disconnected'] = tt_disconnected[:25]

    # --- Archetype 11: Two-Tone Connected ---
    tt_connected = []
    for _ in range(50):
        base = random.randint(2, 10)  # 4 through Q
        r1 = RANKS[base]
        r2 = RANKS[base - 1]
        r3 = RANKS[base - 2]
        cards = make_two_tone([r1, r2, r3])
        tt_connected.append(cards)
    boards['two_tone_connected'] = tt_connected[:25]

    # --- Archetype 12: Monotone ---
    mono = []
    for _ in range(50):
        r1 = random.choice(RANKS[4:])  # 6+
        r2 = random.choice(RANKS[2:rank_val(r1)])
        r3 = random.choice(RANKS[:rank_val(r2)])
        if r2 == r3:
            r3 = RANKS[max(0, rank_val(r2) - 2)]
        cards = make_monotone([r1, r2, r3])
        mono.append(cards)
    boards['monotone'] = mono[:25]

    # --- Archetype 13: Rainbow Connected ---
    rainbow_conn = []
    for _ in range(50):
        base = random.randint(2, 10)
        r1 = RANKS[base]
        r2 = RANKS[base - 1]
        r3 = RANKS[base - 2]
        cards = make_rainbow([r1, r2, r3])
        rainbow_conn.append(cards)
    boards['rainbow_connected'] = rainbow_conn[:25]

    # Deduplicate and validate
    for arch, board_list in boards.items():
        seen = set()
        unique = []
        for b in board_list:
            key = tuple(sorted(b))
            if key not in seen:
                seen.add(key)
                unique.append(b)
        boards[arch] = unique

    return boards


# ═══════════════════════════════════════════════════════
# INPUT FILE GENERATION
# ═══════════════════════════════════════════════════════

def load_scenario_config(scenario_id):
    """Load range config from range_configs/ directory."""
    config_path = RANGE_CONFIGS_DIR / f"{scenario_id}.json"
    if not config_path.exists():
        raise FileNotFoundError(f"No range config for scenario '{scenario_id}' at {config_path}")
    with open(config_path) as f:
        return json.load(f)


def generate_input_file(board_cards, output_name, settings=None, scenario=None):
    """Generate a TexasSolver input config for a specific board.

    If scenario is provided, uses range config from range_configs/.
    Otherwise uses default BTN_RANGE / BB_RANGE.
    """
    s = settings or SOLVER_SETTINGS
    bs = BET_SIZES_STANDARD

    # Determine ranges
    if scenario:
        ip_range = scenario["ip"]["rangeString"]
        oop_range = scenario["oop"]["rangeString"]
        pot = scenario.get("pot", s["pot"])
        stack = scenario.get("stack", s["stack"])
    else:
        ip_range = BTN_RANGE
        oop_range = BB_RANGE
        pot = s["pot"]
        stack = s["stack"]

    lines = [
        f"set_pot {pot}",
        f"set_effective_stack {stack}",
        f"set_board {','.join(board_cards)}",
        f"set_range_ip {ip_range}",
        f"set_range_oop {oop_range}",
        f"set_bet_sizes oop,flop,bet,{bs['oop_flop_bet']}",
        f"set_bet_sizes oop,flop,raise,{bs['oop_flop_raise']}",
        f"set_bet_sizes oop,flop,allin",
        f"set_bet_sizes ip,flop,bet,{bs['ip_flop_bet']}",
        f"set_bet_sizes ip,flop,raise,{bs['ip_flop_raise']}",
        f"set_bet_sizes ip,flop,allin",
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


def generate_all_inputs(scenario_id=None):
    """Generate input files for all boards across all archetypes.

    If scenario_id is provided, loads range config and outputs
    to a scenario-specific directory on D: drive.
    """
    scenario = None
    if scenario_id:
        scenario = load_scenario_config(scenario_id)
        # Scenario-specific directories
        input_dir = Path(__file__).parent / f"inputs_{scenario_id}"
        output_dir = Path(f"D:/HoldemVision/solver_data/outputs_{scenario_id}")
        manifest_name = f"manifest_{scenario_id}.json"
        print(f"Scenario: {scenario['name']}")
        print(f"  IP ({scenario['ip']['position']}): {scenario['ip']['handCount']} hand classes")
        print(f"  OOP ({scenario['oop']['position']}): {scenario['oop']['handCount']} hand classes")
    else:
        input_dir = INPUT_DIR
        output_dir = OUTPUT_DIR
        manifest_name = "manifest.json"

    input_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    boards = generate_boards()
    manifest = {}

    for archetype, board_list in boards.items():
        manifest[archetype] = []
        for i, board_cards in enumerate(board_list):
            prefix = f"{scenario_id}_" if scenario_id else ""
            name = f"{prefix}{archetype}_{i:03d}"
            input_file = input_dir / f"{name}.txt"
            output_file = str(output_dir / f"{name}.json")

            content = generate_input_file(board_cards, output_file, scenario=scenario)
            input_file.write_text(content)
            manifest[archetype].append({
                "name": name,
                "board": board_cards,
                "input": str(input_file),
                "output": output_file,
                "scenario": scenario_id or "btn_vs_bb",
            })

    # Save manifest
    manifest_file = Path(__file__).parent / manifest_name
    with open(manifest_file, 'w') as f:
        json.dump(manifest, f, indent=2)

    total = sum(len(v) for v in manifest.values())
    print(f"Generated {total} input files across {len(manifest)} archetypes")
    print(f"Manifest: {manifest_file}")
    print(f"Outputs: {output_dir}")
    for arch, entries in manifest.items():
        print(f"  {arch}: {len(entries)} boards")

    return manifest


# ═══════════════════════════════════════════════════════
# BATCH SOLVER RUNNER
# ═══════════════════════════════════════════════════════

def run_all_solves():
    """Run solver on all generated input files.

    The solver writes output relative to its CWD, so we:
    1. Generate a temp input file with absolute output path
    2. Run from the solver directory
    3. Move the output to our outputs dir
    """
    manifest_file = Path(__file__).parent / "manifest.json"
    with open(manifest_file) as f:
        manifest = json.load(f)

    total = sum(len(v) for v in manifest.values())
    completed = 0
    failed = 0
    start_time = time.time()

    for archetype, entries in manifest.items():
        print(f"\n{'='*60}")
        print(f"  ARCHETYPE: {archetype} ({len(entries)} boards)")
        print(f"{'='*60}")

        for entry in entries:
            name = entry['name']
            output_path = Path(entry['output'])

            # Skip if already solved
            if output_path.exists() and output_path.stat().st_size > 100:
                print(f"  [SKIP] {name} (already solved)")
                completed += 1
                continue

            print(f"  [SOLVE] {name} -- {','.join(entry['board'])} ...", end=" ", flush=True)
            solve_start = time.time()

            try:
                # Read input file and replace output path with absolute path
                input_content = Path(entry['input']).read_text()
                abs_output = str(output_path.resolve()).replace('\\', '/')
                # Replace the dump_result line
                lines = input_content.strip().split('\n')
                lines = [l if not l.startswith('dump_result') else f'dump_result {abs_output}' for l in lines]

                # Write temp input in solver dir
                temp_input = SOLVER_DIR / f"_temp_input.txt"
                temp_input.write_text('\n'.join(lines) + '\n')

                result = subprocess.run(
                    [str(SOLVER_EXE), "-i", str(temp_input)],
                    cwd=str(SOLVER_DIR),
                    capture_output=True,
                    text=True,
                    timeout=600,  # 10 min max per solve
                )

                solve_time = time.time() - solve_start

                if output_path.exists() and output_path.stat().st_size > 100:
                    completed += 1
                    print(f"OK ({solve_time:.0f}s)")
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
            done = completed + failed
            elapsed = time.time() - start_time
            rate = done / elapsed if elapsed > 0 else 0
            remaining = (total - done) / rate if rate > 0 else 0
            print(f"         Progress: {done}/{total} ({elapsed:.0f}s elapsed, ~{remaining:.0f}s remaining)")

    print(f"\n{'='*60}")
    print(f"DONE: {completed} completed, {failed} failed, {total} total")
    print(f"Total time: {time.time() - start_time:.0f}s")


# ═══════════════════════════════════════════════════════
# OUTPUT PARSER
# ═══════════════════════════════════════════════════════

RANK_VAL = {'2':0,'3':1,'4':2,'5':3,'6':4,'7':5,'8':6,'9':7,'T':8,'J':9,'Q':10,'K':11,'A':12}
VAL_RANK = {v: k for k, v in RANK_VAL.items()}

def parse_hand(hand_str):
    """Parse 'AcKd' -> (rank1, suit1, rank2, suit2)."""
    return (RANK_VAL[hand_str[0]], hand_str[1], RANK_VAL[hand_str[2]], hand_str[3])


def combo_to_hand_class(hand_str):
    """Convert specific combo ('AcKd') to hand class ('AKo'). Matches TS comboToHandClass()."""
    r1_val = RANK_VAL.get(hand_str[0], 0)
    s1 = hand_str[1]
    r2_val = RANK_VAL.get(hand_str[2], 0)
    s2 = hand_str[3]

    high = VAL_RANK[max(r1_val, r2_val)]
    low = VAL_RANK[min(r1_val, r2_val)]

    if r1_val == r2_val:
        return f"{high}{low}"  # Pair: "AA"
    elif s1 == s2:
        return f"{high}{low}s"  # Suited: "AKs"
    else:
        return f"{high}{low}o"  # Offsuit: "AKo"

def categorize_hand(hand_str, board_cards):
    """Categorize a hand relative to the board."""
    r1, s1, r2, s2 = parse_hand(hand_str)
    board = [(RANK_VAL[c[0]], c[1]) for c in board_cards]
    board_ranks = sorted([b[0] for b in board], reverse=True)
    board_suits = [b[1] for b in board]
    hero_ranks = sorted([r1, r2], reverse=True)
    hero_suits = [s1, s2]

    is_pocket_pair = r1 == r2

    # Count all ranks
    all_ranks = [r1, r2] + [b[0] for b in board]
    rank_counts = {}
    for r in all_ranks:
        rank_counts[r] = rank_counts.get(r, 0) + 1

    # Sets/trips
    for r in [r1, r2]:
        if rank_counts.get(r, 0) >= 3:
            return 'sets_plus'

    # Two pair (hero contributes both)
    hero_board_matches = [r for r in hero_ranks if r in board_ranks]
    if len(set(hero_board_matches)) >= 2:
        return 'two_pair'

    # Flush draw
    has_flush_draw = False
    if s1 == s2:
        matching = sum(1 for bs in board_suits if bs == s1)
        has_flush_draw = matching >= 2
    else:
        for hs in [s1, s2]:
            if sum(1 for bs in board_suits if bs == hs) >= 2:
                has_flush_draw = True

    # Straight draw (simplified)
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

    # Paired with board
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

    # Unpaired
    if has_flush_draw and has_straight_draw:
        return 'combo_draw'
    if has_flush_draw:
        return 'flush_draw'
    if has_straight_draw:
        return 'straight_draw'

    if hero_ranks[0] > board_ranks[0] and hero_ranks[1] > board_ranks[0]:
        return 'overcards'

    return 'air'


def normalize_action(action_str):
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
            pot = SOLVER_SETTINGS['pot']
            ratio = amount / pot
            if ratio <= 0.45:
                return 'bet_small'
            elif ratio <= 0.85:
                return 'bet_medium'
            else:
                return 'bet_large'
        except:
            return 'bet_unknown'
    return action_str.lower()


def parse_solver_output(filepath, board_cards):
    """Parse a single solver output into categorized + hand-class frequencies.

    Extracts:
    - oop: OOP's first-to-act strategy (root node)
    - ip: IP's strategy after OOP checks (check node)
    - ip_facing_bet: IP's response to OOP's bet (BET nodes) — FOLD/CALL/RAISE
    - oop_facing_bet: OOP's response to IP's bet after check (CHECK→BET nodes)
    """
    with open(filepath) as f:
        data = json.load(f)

    result = {
        "oop": {}, "ip": {},
        "oop_hand_class": {}, "ip_hand_class": {},
        "ip_facing_bet": {}, "ip_facing_bet_hand_class": {},
        "oop_facing_bet": {}, "oop_facing_bet_hand_class": {},
    }

    # Root node is OOP's action (first to act)
    oop_actions = data.get('actions', [])
    oop_strategy = data.get('strategy', {}).get('strategy', {})

    if oop_strategy:
        cat_data, hc_data = aggregate_by_category(oop_strategy, oop_actions, board_cards)
        result['oop'] = cat_data
        result['oop_hand_class'] = hc_data

    children = data.get('childrens', {})

    # IP acts after OOP checks (first to act for IP)
    check_node = children.get('CHECK', {})
    if check_node:
        ip_actions = check_node.get('actions', [])
        ip_strategy = check_node.get('strategy', {}).get('strategy', {})
        if ip_strategy:
            cat_data, hc_data = aggregate_by_category(ip_strategy, ip_actions, board_cards)
            result['ip'] = cat_data
            result['ip_hand_class'] = hc_data

        # OOP facing IP's bet after check→bet (OOP's facing-bet response)
        check_children = check_node.get('childrens', {})
        for child_key, child_node in check_children.items():
            if child_key.startswith('BET') and child_node.get('strategy', {}).get('strategy'):
                fb_actions = child_node.get('actions', [])
                fb_strategy = child_node['strategy']['strategy']
                cat_data, hc_data = aggregate_by_category(fb_strategy, fb_actions, board_cards)
                # Merge into oop_facing_bet (average across bet sizes)
                merge_facing_bet(result['oop_facing_bet'], cat_data)
                merge_facing_bet(result['oop_facing_bet_hand_class'], hc_data)

    # IP facing OOP's bet (IP's facing-bet response)
    for child_key, child_node in children.items():
        if child_key.startswith('BET') and child_node.get('strategy', {}).get('strategy'):
            fb_actions = child_node.get('actions', [])
            fb_strategy = child_node['strategy']['strategy']
            cat_data, hc_data = aggregate_by_category(fb_strategy, fb_actions, board_cards)
            # Merge into ip_facing_bet (average across bet sizes)
            merge_facing_bet(result['ip_facing_bet'], cat_data)
            merge_facing_bet(result['ip_facing_bet_hand_class'], hc_data)

    return result


def merge_facing_bet(target, source):
    """Merge facing-bet data from multiple bet sizes by averaging."""
    for key, freqs in source.items():
        if key not in target:
            target[key] = {'_merge_count': 0}
        target[key]['_merge_count'] = target[key].get('_merge_count', 0) + 1
        n = target[key]['_merge_count']
        for action, prob in freqs.items():
            if action == '_count' or action == '_merge_count':
                continue
            old = target[key].get(action, 0)
            # Running average
            target[key][action] = old + (prob - old) / n


def aggregate_by_category(strategy, actions, board_cards):
    """Aggregate per-combo strategy into hand category AND hand class frequencies."""
    categories = {}
    hand_classes = {}

    norm_actions = [normalize_action(a) for a in actions]
    unique_actions = sorted(set(norm_actions))

    for hand, probs in strategy.items():
        cat = categorize_hand(hand, board_cards)
        hc = combo_to_hand_class(hand)

        # Per-category aggregation (existing)
        if cat not in categories:
            categories[cat] = {'totals': {a: 0.0 for a in unique_actions}, 'count': 0}
        for i, p in enumerate(probs):
            na = norm_actions[i]
            categories[cat]['totals'][na] = categories[cat]['totals'].get(na, 0) + p
        categories[cat]['count'] += 1

        # Per-hand-class aggregation (new)
        if hc not in hand_classes:
            hand_classes[hc] = {'totals': {a: 0.0 for a in unique_actions}, 'count': 0}
        for i, p in enumerate(probs):
            na = norm_actions[i]
            hand_classes[hc]['totals'][na] = hand_classes[hc]['totals'].get(na, 0) + p
        hand_classes[hc]['count'] += 1

    # Convert categories to averages
    cat_result = {}
    for cat, data in categories.items():
        if data['count'] > 0:
            cat_result[cat] = {a: v / data['count'] for a, v in data['totals'].items()}
            cat_result[cat]['_count'] = data['count']

    # Convert hand classes to averages
    hc_result = {}
    for hc, data in hand_classes.items():
        if data['count'] > 0:
            hc_result[hc] = {a: round(v / data['count'], 4) for a, v in data['totals'].items()}

    return cat_result, hc_result


def parse_all_outputs():
    """Parse all solver outputs and aggregate into frequency tables."""
    manifest_file = Path(__file__).parent / "manifest.json"
    with open(manifest_file) as f:
        manifest = json.load(f)

    TABLES_DIR.mkdir(parents=True, exist_ok=True)

    for archetype, entries in manifest.items():
        print(f"\nParsing {archetype}...")

        # Collect all board results
        all_ip = {}   # hand_cat -> {action: [values across boards]}
        all_oop = {}
        all_ip_hc = {}   # hand_class -> {action: [values across boards]}
        all_oop_hc = {}
        parsed = 0

        for entry in entries:
            output_path = Path(entry['output'])
            if not output_path.exists():
                continue

            try:
                result = parse_solver_output(output_path, entry['board'])
                parsed += 1

                # Collect per-category data (existing)
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

                # Collect per-hand-class data (new)
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
            print(f"  No outputs found — skipping")
            continue

        # Average across all boards
        def average_freqs(data):
            result = {}
            for cat, actions in data.items():
                result[cat] = {}
                for action, values in actions.items():
                    result[cat][action] = round(sum(values) / len(values), 4)
            return result

        # Compute frequency band stats (min, max, stddev per action)
        def compute_band_stats(data):
            """Compute statistical bands from per-board value arrays."""
            import math
            result = {}
            for cat, actions in data.items():
                result[cat] = {}
                for action, values in actions.items():
                    n = len(values)
                    if n == 0:
                        continue
                    mean = sum(values) / n
                    if n > 1:
                        variance = sum((v - mean) ** 2 for v in values) / n
                        std_dev = math.sqrt(variance)
                    else:
                        std_dev = 0.0
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

        # Compute archetype-level accuracy
        all_std_devs = []
        for bands in [ip_bands, oop_bands]:
            for cat_bands in bands.values():
                for action_stats in cat_bands.values():
                    if isinstance(action_stats, dict) and action_stats.get('sampleCount', 0) >= 2:
                        all_std_devs.append(action_stats['stdDev'])
        avg_std = sum(all_std_devs) / len(all_std_devs) if all_std_devs else 0
        accuracy = max(0, min(1, 1 - avg_std))

        # Build final table
        table = {
            "archetypeId": archetype,
            "boardsAnalyzed": parsed,
            "context": {
                "street": "flop",
                "potType": "srp",
                "heroPosition": "btn",
                "villainPosition": "bb",
            },
            "ip_frequencies": ip_avg,
            "oop_frequencies": oop_avg,
            "actions_ip": sorted(set(a for cat in ip_avg.values() for a in cat.keys())),
            "actions_oop": sorted(set(a for cat in oop_avg.values() for a in cat.keys())),
            # Band data — per-board distributions for TypeScript FrequencyBand computation
            "ip_distributions": {cat: {act: vals for act, vals in actions.items()}
                                  for cat, actions in all_ip.items()},
            "oop_distributions": {cat: {act: vals for act, vals in actions.items()}
                                   for cat, actions in all_oop.items()},
            # Pre-computed band stats for quick reference
            "ip_bands": ip_bands,
            "oop_bands": oop_bands,
            # Per-hand-class frequencies (169 grid, averaged across boards)
            "ip_hand_class": ip_hc_avg,
            "oop_hand_class": oop_hc_avg,
            # Archetype accuracy summary
            "accuracy": {
                "avgStdDev": round(avg_std, 4),
                "accuracy": round(accuracy, 4),
                "boardCount": parsed,
            },
        }

        table_file = TABLES_DIR / f"{archetype}.json"
        with open(table_file, 'w') as f:
            json.dump(table, f, indent=2)

        # Accuracy label
        if accuracy >= 0.95:
            acc_label = "very high"
        elif accuracy >= 0.90:
            acc_label = "high"
        elif accuracy >= 0.80:
            acc_label = "moderate"
        else:
            acc_label = "approximate"

        print(f"  {parsed} boards parsed")
        print(f"  IP categories: {list(ip_avg.keys())}")
        print(f"  Archetype accuracy: {accuracy:.1%} ({acc_label}), avg stdDev: {avg_std:.4f}")
        print(f"  Written to {table_file}")


# ═══════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════

if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'help'

    # --scenario flag: e.g., "python batch_solve.py generate --scenario co_vs_bb"
    scenario_id = None
    for i, arg in enumerate(sys.argv):
        if arg == '--scenario' and i + 1 < len(sys.argv):
            scenario_id = sys.argv[i + 1]

    if cmd == 'generate':
        generate_all_inputs(scenario_id)
    elif cmd == 'run':
        run_all_solves()
    elif cmd == 'parse':
        parse_all_outputs()
    elif cmd == 'all':
        generate_all_inputs(scenario_id)
        run_all_solves()
        parse_all_outputs()
    elif cmd == 'scenarios':
        # List available scenarios
        print("Available scenarios:")
        for f in sorted(RANGE_CONFIGS_DIR.glob("*.json")):
            config = json.loads(f.read_text())
            print(f"  {f.stem}: {config['name']} — IP {config['ip']['handCount']} hands, OOP {config['oop']['handCount']} hands")
    else:
        print(__doc__)
        print("\nScenario support:")
        print("  python batch_solve.py generate --scenario co_vs_bb")
        print("  python batch_solve.py scenarios    # list available scenarios")
