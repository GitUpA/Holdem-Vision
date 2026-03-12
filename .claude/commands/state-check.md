# State Check - Don't Sync State, Derive It

Quick reference guide based on Kent C. Dodds' "Don't Sync State. Derive It!" article.

## Core Principle

**Never create separate state variables for values that can be calculated from existing state.**

Instead of syncing multiple state variables, derive computed values on every render. This eliminates synchronization bugs and reduces complexity.

## The Problem: State Synchronization

### ❌ Antipattern: Multiple Synced State Variables

```typescript
const [squares, setSquares] = useState(Array(9).fill(null));
const [nextValue, setNextValue] = useState('X');
const [winner, setWinner] = useState(null);
const [status, setStatus] = useState('Next player: X');

function selectSquare(square: number) {
  // Must update ALL related state variables
  const newSquares = [...squares];
  newSquares[square] = nextValue;
  setSquares(newSquares);

  const newWinner = calculateWinner(newSquares);
  setWinner(newWinner);

  const newNextValue = calculateNextValue(newSquares);
  setNextValue(newNextValue);

  const newStatus = calculateStatus(newWinner, newSquares, newNextValue);
  setStatus(newStatus);
}

// Adding new features means updating ALL state in ALL handlers
function selectTwoSquares(square1: number, square2: number) {
  // Easy to forget updating all derived state!
  const newSquares = [...squares];
  newSquares[square1] = nextValue;
  newSquares[square2] = calculateNextValue(newSquares);
  setSquares(newSquares);
  // Forgot to update winner, nextValue, status → BUG! 🐛
}
```

**Problems:**
- **Fragile:** Every handler must update all related state
- **Bug-prone:** Easy to forget updates when adding features
- **Maintenance nightmare:** Changes require hunting down all update sites
- **Sync bugs:** State can fall out of sync, showing stale values

### ✅ Solution: Derive State from Single Source of Truth

```typescript
const [squares, setSquares] = useState(Array(9).fill(null));

// Derive everything else from squares
const nextValue = calculateNextValue(squares);
const winner = calculateWinner(squares);
const status = calculateStatus(winner, squares, nextValue);

function selectSquare(square: number) {
  // Only update source state
  const newSquares = [...squares];
  newSquares[square] = nextValue;
  setSquares(newSquares);
  // All derived values automatically update on next render!
}

function selectTwoSquares(square1: number, square2: number) {
  // Simple and bug-free
  const newSquares = [...squares];
  newSquares[square1] = nextValue;
  newSquares[square2] = calculateNextValue(newSquares);
  setSquares(newSquares);
  // Derived values automatically stay in sync
}
```

**Benefits:**
- **Single source of truth:** Only `squares` is state
- **Always in sync:** Derived values computed fresh on every render
- **Simple handlers:** Update only source state
- **Easy to extend:** New features don't require tracking down state updates
- **No sync bugs:** Impossible for derived values to be stale

## Performance: Don't Optimize Prematurely

**Reality check:** JavaScript is FAST.

The example `calculateWinner` function performs **15 MILLION operations per second**. Recalculating on every render is negligible for most applications.

### When to Optimize

Only use `useMemo` if you have **measured evidence** of performance issues:

```typescript
// ✅ Only if profiling shows this is actually slow
const winner = useMemo(
  () => calculateWinner(squares),
  [squares]
);
```

**Don't assume you need optimization.** Premature `useMemo` adds complexity without benefit.

## Pattern Examples

### ❌ BAD: Syncing Filtered Lists

```typescript
const [items, setItems] = useState([...]);
const [filter, setFilter] = useState('all');
const [filteredItems, setFilteredItems] = useState([...]);

useEffect(() => {
  setFilteredItems(
    items.filter(item =>
      filter === 'all' || item.status === filter
    )
  );
}, [items, filter]);
```

### ✅ GOOD: Derive Filtered Lists

```typescript
const [items, setItems] = useState([...]);
const [filter, setFilter] = useState('all');

const filteredItems = items.filter(item =>
  filter === 'all' || item.status === filter
);
```

### ❌ BAD: Syncing Totals

```typescript
const [cartItems, setCartItems] = useState([...]);
const [subtotal, setSubtotal] = useState(0);
const [tax, setTax] = useState(0);
const [total, setTotal] = useState(0);

function addToCart(item: Item) {
  const newItems = [...cartItems, item];
  setCartItems(newItems);

  const newSubtotal = calculateSubtotal(newItems);
  setSubtotal(newSubtotal);

  const newTax = newSubtotal * 0.1;
  setTax(newTax);

  setTotal(newSubtotal + newTax);
}
```

### ✅ GOOD: Derive Totals

```typescript
const [cartItems, setCartItems] = useState([...]);

const subtotal = cartItems.reduce((sum, item) => sum + item.price, 0);
const tax = subtotal * 0.1;
const total = subtotal + tax;

function addToCart(item: Item) {
  setCartItems(prev => [...prev, item]);
  // All totals automatically recalculate
}
```

### ❌ BAD: Syncing Form Validation

```typescript
const [email, setEmail] = useState('');
const [password, setPassword] = useState('');
const [isValid, setIsValid] = useState(false);

useEffect(() => {
  setIsValid(email.includes('@') && password.length >= 8);
}, [email, password]);
```

### ✅ GOOD: Derive Validation

```typescript
const [email, setEmail] = useState('');
const [password, setPassword] = useState('');

const isValid = email.includes('@') && password.length >= 8;
```

### ❌ BAD: Syncing Selection State

```typescript
const [selectedId, setSelectedId] = useState(null);
const [selectedItem, setSelectedItem] = useState(null);

useEffect(() => {
  setSelectedItem(
    items.find(item => item.id === selectedId) ?? null
  );
}, [selectedId, items]);
```

### ✅ GOOD: Derive Selection

```typescript
const [selectedId, setSelectedId] = useState(null);

const selectedItem = items.find(item => item.id === selectedId) ?? null;
```

## Decision Tree

**When you're about to create a new state variable, ask:**

1. **Can this be calculated from existing state?**
   - YES → Don't use state, derive it
   - NO → Continue to #2

2. **Does this value come from props?**
   - YES → Don't use state, derive it or use the prop directly
   - NO → Continue to #3

3. **Is this value based on user input or external data?**
   - YES → This needs state
   - NO → Derive it

## Alternative: useReducer

For complex state with many derived values, `useReducer` can centralize state updates:

```typescript
const [state, dispatch] = useReducer(reducer, initialState);

function reducer(state, action) {
  switch (action.type) {
    case 'SELECT_SQUARE':
      const newSquares = [...state.squares];
      newSquares[action.square] = calculateNextValue(state.squares);
      return { squares: newSquares };
    // All derived values calculated in component, not reducer
  }
}

// Still derive from state
const nextValue = calculateNextValue(state.squares);
const winner = calculateWinner(state.squares);
```

**Note:** Even with `useReducer`, derive computed values rather than storing them in reducer state.

## Red Flags

If you see these patterns, refactor to derivation:

- ❌ `useEffect` that updates state based on other state
- ❌ Multiple `setState` calls in one event handler
- ❌ State variables that are always calculated from other state
- ❌ Comments like "sync X with Y" or "keep X updated"
- ❌ Bugs where UI shows stale/inconsistent values

## Benefits Summary

**Deriving state instead of syncing:**
- ✅ **Eliminates sync bugs** - impossible to get out of sync
- ✅ **Simpler code** - fewer state variables to track
- ✅ **Easier maintenance** - changes in one place
- ✅ **Better refactoring** - calculations can be moved/reused easily
- ✅ **Fewer bugs** - less manual synchronization to forget
- ✅ **Clearer data flow** - obvious what depends on what

## Framework Context (Convex + Next.js)

In this Convex-powered codebase, `useQuery` from `convex/react` returns reactive data that auto-updates. Derive from it — never sync into separate state.

```typescript
// ✅ CORRECT: Derive filtered/sorted data from Convex query
function ProfileList() {
  const profiles = useQuery(api.profiles.list);

  // Derive — no separate state needed
  const presets = profiles?.filter(p => p.isPreset) ?? [];
  const custom = profiles?.filter(p => !p.isPreset) ?? [];
  const hasCustom = custom.length > 0;

  return <div>...</div>;
}

// ✅ CORRECT: Derive in custom hooks from game state
function useOpponents(seats: SeatState[], heroSeatIndex: number) {
  // Derive active opponents — no state, no effect
  const opponents = useMemo(() =>
    seats.filter(s => !s.isHero && s.status !== "folded")
         .map(s => ({ seatIndex: s.seatIndex, label: s.label, actions: s.actions })),
    [seats]
  );
  return opponents;
}

// ❌ WRONG: Syncing Convex query into local state
function ProfileList() {
  const profiles = useQuery(api.profiles.list);
  const [presets, setPresets] = useState([]);

  useEffect(() => {
    setPresets(profiles?.filter(p => p.isPreset) ?? []); // DON'T!
  }, [profiles]);

  return <div>...</div>;
}
```

**Extra consideration for Convex:** If you're filtering/sorting large datasets, consider whether the filtering belongs in the Convex query function (server-side) rather than client-side derivation. Derive on the client only when the full dataset is already needed or is small.

## Quick Reference

**Golden Rule:** If you can calculate it, don't store it.

**State is for:**
- User input values (card selections, form fields)
- Server data lives in Convex (via `useQuery` — already reactive)
- UI state (modals open, active lens, selected seat)
- Values that CAN'T be derived

**Derivation is for:**
- Filtered lists (active opponents, preset profiles)
- Sorted lists
- Computed totals (pot size, stack ratios)
- Validation states (isValid, canAct)
- Formatted strings (hand descriptions, equity %)
- Selected items from IDs
- Any value calculated from other data
