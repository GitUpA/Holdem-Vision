# Phase A: Bug Fixes — All-in Shove + HU BvB

## B1: All-in shove invisible to classifier

### The Problem

`classifySituationFromState` excludes `all_in` from raise counting entirely:

```typescript
const raiseActions = preflopActions.filter(
  a => a.actionType === "raise" || a.actionType === "bet",
);
```

This was an over-correction. We fixed the bug where short-stack all-in *calls* (amount ≤
currentBet) were counted as raises. But we went too far — all-in *shoves* (amount > currentBet)
ARE raises and must be counted.

### Scenarios

| Action | Amount vs CurrentBet | Should count as raise? | Currently counted? |
|---|---|---|---|
| raise to 6BB | 6 > 1 (BB) | Yes | Yes ✓ |
| all-in shove 50BB | 50 > 1 (BB) | Yes | **No ✗** |
| all-in call 4BB (short stack, facing 6BB raise) | 4 < 6 | No | No ✓ |
| all-in shove 4BB (no prior raise, short stack) | 4 > 1 (BB) | Yes | **No ✗** |

### The Fix

Count `all_in` as a raise when it exceeds the current bet level at the time of the action.

The challenge: `GameAction` doesn't store what `currentBet` was at the time of the action.
We need to derive this from the action sequence.

**Approach:** Walk the action history chronologically. Track the running bet level.
An `all_in` action whose `amount` exceeds the running bet level is a raise.

```typescript
// Track bet level through the action sequence
let currentBetLevel = state.blinds.big; // BB is the initial bet level preflop
const raiseActions: GameAction[] = [];

for (const a of preflopActions) {
  if (a.actionType === "raise" || a.actionType === "bet") {
    raiseActions.push(a);
    currentBetLevel = a.amount ?? currentBetLevel;
  } else if (a.actionType === "all_in" && (a.amount ?? 0) > currentBetLevel) {
    // All-in that exceeds current bet = a raise
    raiseActions.push(a);
    currentBetLevel = a.amount ?? currentBetLevel;
  }
  // all_in with amount <= currentBetLevel = a call, don't count
}
```

**Simpler alternative:** Check `a.amount > currentBetLevel` at the time of the action.
But we need the running bet level. The state machine tracks this in `state.currentBet`,
but that's the CURRENT value, not the value at each action's time.

**Simplest correct approach:** Walk actions in order, maintain running max bet.

### Files Changed

- `convex/lib/preflop/situationRegistry.ts` — `classifySituationFromState` function only

### Edge Cases to Test

1. UTG shoves 50BB as first action → should be `facing_open` for next player (raiseCount=1)
2. UTG raises 3BB, short-stack HJ shoves 4BB (< 6BB min raise) → raiseCount=1 (the shove
   doesn't constitute a full raise, but it does exceed currentBet, so it counts)
3. UTG raises 3BB, short-stack HJ calls all-in for 2BB → raiseCount=1 (call, not raise)
4. UTG limps, HJ shoves 30BB → raiseCount=1, openerPosition=HJ, numLimpers=1
   Situation should be `facing_open` (raise happened after limp)
5. No actions yet, hero first to act → raiseCount=0, rfi

### Impact on Other Derivations

When an `all_in` is now counted as a raise:
- `openerPosition` — the all-in player becomes the opener (or 3-bettor etc.)
- `numLimpers` — unaffected (limps are calls BEFORE any raise)
- `numCallers` — calls after the all-in raise are counted correctly
- `threeBettorPosition` — if the all-in is the 2nd raise, that player is the 3-bettor

---

## B2: Heads-up never triggers blind_vs_blind

### The Problem

In 2-player (HU), positions are `["btn", "bb"]` from `positionsForTableSize(2)`.
The BTN is also the SB in heads-up (posts the small blind, acts first preflop).

The BvB classifier checks:

```typescript
const blinds: Set<Position> = new Set(["sb", "bb"]);
if (openerPosition && blinds.has(heroPosition) && blinds.has(openerPosition) && numCallers === 0) {
  return { ...base, id: "blind_vs_blind", raiseCount: 1 };
}
```

`heroPosition` is `"btn"` and `blinds.has("btn")` is false → BvB never triggers in HU.

### Scenarios

| Table Size | Hero | Villain | Villain Opens | Current Result | Correct Result |
|---|---|---|---|---|---|
| 2 (HU) | btn | bb | raises | facing_open | blind_vs_blind |
| 2 (HU) | bb | btn | raises | facing_open | blind_vs_blind |
| 6 | sb | bb | — | rfi (SB opening) | rfi ✓ |
| 6 | bb | sb | raises | blind_vs_blind | blind_vs_blind ✓ |

### The Fix

In heads-up, BTN = SB. The BvB check should account for this:

```typescript
const isBlind = (pos: Position, tableSize: number): boolean => {
  if (pos === "sb" || pos === "bb") return true;
  if (pos === "btn" && tableSize === 2) return true; // HU: BTN is SB
  return false;
};

if (openerPosition && isBlind(heroPosition, tableSize) 
    && isBlind(openerPosition, tableSize) && numCallers === 0) {
  return { ...base, id: "blind_vs_blind", raiseCount: 1 };
}
```

This is clean — `isBlind` is a small helper, HU-specific, no impact on 3+ player games.

### Files Changed

- `convex/lib/preflop/situationRegistry.ts` — `classifySituation` function only

### Edge Cases to Test

1. HU: BTN raises, hero is BB → blind_vs_blind ✓
2. HU: BB raises (action back to BTN after posting) → This can't happen in standard play
   (BTN acts first in HU preflop). But if BB somehow raises, both are blinds → BvB.
3. 3-player: BTN raises, hero is BB → NOT BvB (BTN is not a blind in 3+ player)
4. 6-max: SB raises, hero is BB → BvB ✓ (unchanged)
5. HU: BTN limps (calls BB), hero is BB → no raiser, `openerPosition=null`.
   This is `bb_vs_sb_complete` if we detect it. Currently: isSBComplete checks
   for SB position, but in HU the "SB" is "btn". Need same fix:
   `isSBComplete` should also check `pos === "btn" && tableSize === 2`.

### Impact on isSBComplete in classifySituationFromState

The `isSBComplete` derivation also needs the HU fix:

```typescript
const isSBComplete = numLimpers > 0
  && limperActions.some(a => {
    const pos = state.players[a.seatIndex].position;
    return pos === "sb" || (pos === "btn" && state.numPlayers === 2);
  })
  && firstRaiseIdx === -1
  && numLimpers === 1;
```

---

## Implementation Steps

### Step 1: Fix B1 (all-in shove counting)
- Rewrite raise counting in `classifySituationFromState` to walk actions chronologically
  and track running bet level
- Count `all_in` as raise only when amount > running bet level
- Add 5 test cases for the edge scenarios listed above

### Step 2: Fix B2 (HU BvB detection)
- Add `isBlind(pos, tableSize)` helper
- Update BvB check in `classifySituation` to use it
- Update `isSBComplete` in `classifySituationFromState` to handle HU BTN = SB
- Add 5 test cases for HU scenarios

### Step 3: Run full test suite
- Type check
- All 1437+ tests pass
- Verify no behavioral regression for 6-max (the common case)

## Risk Assessment

**B1:** Low-medium risk. The raise counting logic changes, which affects all situation
classification. But the fix is strictly more correct — it only changes behavior for
all-in actions, which are rare preflop. The chronological walk is more complex than
the current filter, but it's a one-time derivation per classification.

**B2:** Low risk. The `isBlind` helper only activates for `tableSize === 2`. Zero impact
on 3+ player games. The HU code path is currently wrong, so any change is an improvement.
