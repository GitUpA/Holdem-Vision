"""
Analyze PokerBench postflop data — classify by archetype + hand category.
Shows distribution and identifies gaps for GTO trainer frequency tables.
"""
import csv

# ═══════════════════════════════════════════════════════
# CARD PARSING
# ═══════════════════════════════════════════════════════

RANK_MAP = {'2':0,'3':1,'4':2,'5':3,'6':4,'7':5,'8':6,'9':7,'T':8,'J':9,'Q':10,'K':11,'A':12}

def parse_card(s):
    return (RANK_MAP.get(s[0], 0), s[1])

def parse_flop(flop_str):
    cards = []
    for i in range(0, len(flop_str), 2):
        if i+1 < len(flop_str):
            cards.append(parse_card(flop_str[i:i+2]))
    return cards

# ═══════════════════════════════════════════════════════
# ARCHETYPE CLASSIFICATION
# ═══════════════════════════════════════════════════════

def classify_board_texture(flop_str):
    cards = parse_flop(flop_str)
    if len(cards) < 3:
        return 'unknown'

    ranks = sorted([c[0] for c in cards], reverse=True)
    suits = [c[1] for c in cards]
    high = ranks[0]
    unique_suits = len(set(suits))
    unique_ranks = len(set(ranks))

    is_monotone = unique_suits == 1
    is_two_tone = unique_suits == 2
    is_rainbow = unique_suits == 3
    is_paired = unique_ranks < 3

    sorted_ranks = sorted(set(ranks))
    gaps = []
    for i in range(len(sorted_ranks)-1):
        gaps.append(sorted_ranks[i+1] - sorted_ranks[i])
    is_connected = any(g <= 2 for g in gaps) if gaps else False

    if is_monotone:
        return 'monotone'
    if is_paired:
        return 'paired_boards'
    if is_rainbow:
        if is_connected and len([g for g in gaps if g <= 2]) >= 2:
            return 'rainbow_connected'
        if high >= 12:
            return 'ace_high_dry_rainbow'
        if high >= 10:
            return 'kq_high_dry_rainbow'
        return 'mid_low_dry_rainbow'
    if is_two_tone:
        if is_connected:
            return 'two_tone_connected'
        return 'two_tone_disconnected'
    return 'unknown'

def classify_postflop_principle(row):
    street = row['evaluation_at']
    preflop_action = row.get('preflop_action', '')

    # Detect 3-bet pot
    parts = preflop_action.split('/')
    bet_amounts = []
    for p in parts:
        if p.endswith('bb'):
            try:
                bet_amounts.append(float(p.replace('bb','')))
            except:
                pass
    is_3bet = len(bet_amounts) >= 2 and any(a > 5 for a in bet_amounts)

    if street == 'River':
        return 'river_decisions'
    if street == 'Turn':
        return 'turn_decisions'
    if street == 'Flop' and is_3bet:
        return 'three_bet_pot_postflop'
    return None

# ═══════════════════════════════════════════════════════
# HAND CATEGORIZATION
# ═══════════════════════════════════════════════════════

def classify_hand_category(holding, flop_str):
    hero = [parse_card(holding[0:2]), parse_card(holding[2:4])]
    board = parse_flop(flop_str)

    hero_ranks = sorted([c[0] for c in hero], reverse=True)
    board_ranks = sorted([c[0] for c in board], reverse=True)
    hero_suits = [c[1] for c in hero]
    board_suits = [c[1] for c in board]

    is_pocket_pair = hero_ranks[0] == hero_ranks[1]

    # Count all ranks
    all_ranks_list = hero_ranks + board_ranks
    rank_counts = {}
    for r in all_ranks_list:
        rank_counts[r] = rank_counts.get(r, 0) + 1

    # Sets/trips/quads/full house
    has_quads = any(v >= 4 for v in rank_counts.values())
    has_set = False
    has_trips = False
    for r in hero_ranks:
        if rank_counts.get(r, 0) >= 3:
            if is_pocket_pair and r == hero_ranks[0]:
                has_set = True
            else:
                has_trips = True

    # Two pair (hero contributes to both pairs)
    hero_paired_with_board = [r for r in hero_ranks if r in board_ranks]
    has_two_pair = len(set(hero_paired_with_board)) >= 2

    if has_quads or has_set:
        return 'sets_plus'
    if has_trips and rank_counts.get(hero_ranks[0], 0) >= 3:
        return 'sets_plus'
    if has_two_pair:
        return 'two_pair'

    # Flush draw (hero has 2 suited, 2+ of that suit on board)
    has_flush_draw = False
    if hero_suits[0] == hero_suits[1]:
        matching = sum(1 for bs in board_suits if bs == hero_suits[0])
        has_flush_draw = matching >= 2
    else:
        for hs in hero_suits:
            matching = sum(1 for bs in board_suits if bs == hs)
            if matching >= 3:
                has_flush_draw = True

    # Straight draw (simplified)
    all_unique = sorted(set(hero_ranks + board_ranks))
    has_straight_draw = False
    for start in range(max(0, min(all_unique) - 1), min(all_unique[-1] + 1, 13) if all_unique else 0):
        window = [r for r in all_unique if start <= r <= start + 4]
        if len(window) >= 4:
            has_straight_draw = True
            break
    # Wheel check
    if 12 in all_unique and 0 in all_unique:
        low_cards = [r for r in all_unique if r <= 3]
        if len(low_cards) >= 3:
            has_straight_draw = True

    # Made straight/flush check
    if len(all_unique) >= 5:
        for i in range(len(all_unique) - 4):
            if all_unique[i+4] - all_unique[i] == 4:
                return 'sets_plus'  # straight

    if is_pocket_pair:
        if hero_ranks[0] > board_ranks[0]:
            return 'overpair'
        if hero_ranks[0] > board_ranks[-1]:
            return 'middle_pair'
        return 'bottom_pair'

    # Top pair / middle pair / bottom pair
    top_rank = board_ranks[0]
    mid_rank = board_ranks[1] if len(board_ranks) > 1 else -1

    if hero_ranks[0] == top_rank or hero_ranks[1] == top_rank:
        kicker = hero_ranks[1] if hero_ranks[0] == top_rank else hero_ranks[0]
        if kicker >= 10:
            return 'top_pair_top_kicker'
        return 'top_pair_weak_kicker'

    if hero_ranks[0] == mid_rank or hero_ranks[1] == mid_rank:
        return 'middle_pair'

    if any(r in board_ranks for r in hero_ranks):
        return 'bottom_pair'

    # No pair — draws
    if has_flush_draw and has_straight_draw:
        return 'combo_draw'
    if has_flush_draw:
        return 'flush_draw'
    if has_straight_draw:
        return 'straight_draw'

    # Overcards
    if hero_ranks[0] > board_ranks[0] and hero_ranks[1] > board_ranks[0]:
        return 'overcards'

    return 'air'

# ═══════════════════════════════════════════════════════
# DECISION NORMALIZATION
# ═══════════════════════════════════════════════════════

def normalize_decision(dec, pot_size):
    dec = dec.strip()
    if dec == 'Check':
        return 'check'
    if dec == 'Fold':
        return 'fold'
    if dec == 'Call':
        return 'call'
    if dec.startswith('Bet') or dec.startswith('Raise'):
        try:
            amount = float(dec.split()[-1])
            pot = float(pot_size) if pot_size else 1
            ratio = amount / pot if pot > 0 else 0
            if ratio <= 0.45:
                return 'bet_small'
            elif ratio <= 0.85:
                return 'bet_medium'
            else:
                return 'bet_large'
        except:
            return 'bet_unknown'
    return 'other'

# ═══════════════════════════════════════════════════════
# MAIN ANALYSIS
# ═══════════════════════════════════════════════════════

archetype_counts = {}
archetype_hand_cats = {}  # (archetype, hand_cat) -> {action: count}
total = 0
errors = 0

print("Processing 500K rows...")

with open('data/pokerbench/dataset/postflop_500k_train_set_game_scenario_information.csv') as f:
    reader = csv.DictReader(f)
    for row in reader:
        total += 1
        if total % 100000 == 0:
            print(f"  ...{total} rows")
        try:
            flop = row['board_flop']
            holding = row['holding']
            decision = row['correct_decision']
            pot_size = row.get('pot_size', '1')

            principle = classify_postflop_principle(row)
            if principle:
                archetype = principle
            else:
                archetype = classify_board_texture(flop)

            hand_cat = classify_hand_category(holding, flop)
            action = normalize_decision(decision, pot_size)

            archetype_counts[archetype] = archetype_counts.get(archetype, 0) + 1

            key = (archetype, hand_cat)
            if key not in archetype_hand_cats:
                archetype_hand_cats[key] = {}
            archetype_hand_cats[key][action] = archetype_hand_cats[key].get(action, 0) + 1

        except Exception as e:
            errors += 1

print(f"\nTotal: {total}, errors: {errors}")

# ═══════════════════════════════════════════════════════
# REPORT
# ═══════════════════════════════════════════════════════

print("\n" + "=" * 75)
print("ARCHETYPE DISTRIBUTION (postflop 500K)")
print("=" * 75)

MIN_ROWS_GOOD = 5000
MIN_ROWS_OK = 1000

for arch, count in sorted(archetype_counts.items(), key=lambda x: -x[1]):
    pct = count / total * 100
    bar = "#" * int(pct / 2)
    status = "OK" if count >= MIN_ROWS_GOOD else "THIN" if count >= MIN_ROWS_OK else "GAP"
    print(f"  {arch:35s} {count:7d} ({pct:5.1f}%)  [{status:4s}] {bar}")

print("\n" + "=" * 75)
print("HAND CATEGORY × ACTION FREQUENCIES PER ARCHETYPE")
print("=" * 75)

for arch in sorted(archetype_counts.keys()):
    arch_total = archetype_counts[arch]
    print(f"\n{'-' * 75}")
    print(f"  {arch.upper()} ({arch_total:,} rows)")
    print(f"{'-' * 75}")

    cats = {}
    for (a, hc), actions in archetype_hand_cats.items():
        if a == arch:
            cats[hc] = actions

    for hc in sorted(cats.keys(), key=lambda x: -sum(cats[x].values())):
        actions = cats[hc]
        cat_total = sum(actions.values())
        pct = cat_total / arch_total * 100

        # Show frequencies
        freqs = []
        for action, cnt in sorted(actions.items(), key=lambda x: -x[1]):
            freq = cnt / cat_total * 100
            freqs.append(f"{action}:{freq:.0f}%")
        freq_str = "  ".join(freqs)

        print(f"    {hc:26s} {cat_total:6d} ({pct:5.1f}%)  {freq_str}")

# Summary
print("\n" + "=" * 75)
print("COVERAGE SUMMARY")
print("=" * 75)

target_archetypes = [
    'ace_high_dry_rainbow', 'kq_high_dry_rainbow', 'mid_low_dry_rainbow',
    'paired_boards', 'two_tone_disconnected', 'two_tone_connected',
    'monotone', 'rainbow_connected',
    'turn_decisions', 'river_decisions', 'three_bet_pot_postflop'
]

for arch in target_archetypes:
    count = archetype_counts.get(arch, 0)
    n_cats = len([k for k in archetype_hand_cats if k[0] == arch])
    status = "GOOD" if count >= MIN_ROWS_GOOD else "THIN" if count >= MIN_ROWS_OK else "GAP"
    print(f"  {arch:35s} {count:7d} rows, {n_cats:2d} hand categories  [{status}]")
