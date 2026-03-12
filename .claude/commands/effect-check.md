# Effect Check - When You Might Not Need useEffect

Quick reference guide based on React's "You Might Not Need an Effect" documentation.

## Core Principle

Effects are an **escape hatch** for synchronizing with external systems (APIs, browser APIs, third-party libraries). Most component logic should NOT use Effects.

**Two main antipatterns:**
1. Using Effects to transform data for rendering
2. Using Effects to handle user events

## Common Antipatterns & Fixes

### ❌ Antipattern 1: Updating State Based on Props/State

**DON'T:**
```typescript
const [fullName, setFullName] = useState('');
useEffect(() => {
  setFullName(firstName + ' ' + lastName);
}, [firstName, lastName]);
```

**DO:**
```typescript
const fullName = firstName + ' ' + lastName;
```

**Why:** Calculating during render is simpler, faster, and avoids cascading updates showing stale values.

### ❌ Antipattern 2: Caching Expensive Calculations with State

**DON'T:**
```typescript
const [visibleTodos, setVisibleTodos] = useState([]);
useEffect(() => {
  setVisibleTodos(getFilteredTodos(todos, filter));
}, [todos, filter]);
```

**DO:**
```typescript
const visibleTodos = useMemo(
  () => getFilteredTodos(todos, filter),
  [todos, filter]
);
```

**Why:** `useMemo` prevents recalculation when unrelated state changes without extra renders.

### ❌ Antipattern 3: Resetting State When Props Change

**DON'T:**
```typescript
useEffect(() => {
  setComment('');
  setLikes(0);
}, [userId]);
```

**DO:**
```typescript
<Profile userId={userId} key={userId} />
```

**Why:** Changing `key` forces React to recreate the component with fresh state (including nested children).

### ❌ Antipattern 4: Adjusting Partial State

**DON'T:**
```typescript
const [selection, setSelection] = useState(null);
useEffect(() => {
  setSelection(items.find(i => i.id === selectedId) ?? null);
}, [items, selectedId]);
```

**DO:**
```typescript
const selection = items.find(i => i.id === selectedId) ?? null;
```

**Why:** Computing during render eliminates sync issues and extra renders.

### ❌ Antipattern 5: Event Logic in Effects

**DON'T:**
```typescript
const [product, setProduct] = useState(null);
useEffect(() => {
  if (product) {
    post('/analytics/buy', { productId: product.id });
  }
}, [product]);

function handleBuy() {
  setProduct(currentProduct);
}
```

**DO:**
```typescript
function handleBuy() {
  post('/analytics/buy', { productId: currentProduct.id });
}
```

**Why:** Event handlers provide clear causality and full context about the interaction.

### ❌ Antipattern 6: Chains of Computation Effects

**DON'T:**
```typescript
const [card, setCard] = useState(null);
const [goldCardCount, setGoldCardCount] = useState(0);

useEffect(() => {
  if (card?.gold) {
    setGoldCardCount(c => c + 1);
  }
}, [card]);
```

**DO:**
```typescript
function handleCardSelect(nextCard) {
  setCard(nextCard);
  if (nextCard.gold) {
    setGoldCardCount(c => c + 1);
  }
}
```

**Why:** Avoids cascading updates and makes the relationship between actions explicit.

### ❌ Antipattern 7: Initializing Application State

**DON'T:**
```typescript
useEffect(() => {
  loadAuthToken();
}, []);
```

**DO (App-wide):**
```typescript
if (typeof window !== 'undefined') {
  loadAuthToken();
}

function App() {
  // ...
}
```

**DO (Per-component):**
```typescript
let didInit = false;

function App() {
  if (!didInit) {
    loadAuthToken();
    didInit = true;
  }
  // ...
}
```

**Why:** Top-level initialization runs once and avoids delays/double-execution from Effects.

### ❌ Antipattern 8: Notifying Parent Components

**DON'T:**
```typescript
useEffect(() => {
  onToggle(isOn);
}, [isOn, onToggle]);
```

**DO:**
```typescript
function handleClick() {
  setIsOn(next => !next);
  onToggle(!isOn);
}
```

**Why:** Pass data upward during events, not reactively. Effects complicate data flow.

### ❌ Antipattern 9: Passing Data to Parent via Effects

**DON'T:**
```typescript
// Child
useEffect(() => {
  onDataChange(data);
}, [data, onDataChange]);
```

**DO:**
```typescript
// Lift state up to parent
const [data, setData] = useState(null);
return <Child data={data} onDataChange={setData} />;
```

**Why:** Unidirectional data flow (props down, events up) is React's core pattern.

### ❌ Antipattern 10: Subscribing to External Stores

**DON'T:**
```typescript
const [data, setData] = useState(null);
useEffect(() => {
  const handler = () => setData(store.getData());
  store.subscribe(handler);
  return () => store.unsubscribe(handler);
}, []);
```

**DO:**
```typescript
const data = useSyncExternalStore(
  store.subscribe,
  store.getData,
  store.getServerData
);
```

**Why:** `useSyncExternalStore` handles React 18 concurrent rendering and hydration correctly.

### ❌ Antipattern 11: Fetching Data in Effects

**DON'T:**
```typescript
useEffect(() => {
  let ignore = false;
  fetch(`/api/data/${id}`)
    .then(res => res.json())
    .then(data => {
      if (!ignore) setData(data);
    });
  return () => { ignore = true; };
}, [id]);
```

**DO:**
```typescript
// Use a framework's data fetching mechanism:
const data = use(fetch(`/api/data/${id}`));

// OR use React Query, SWR, or framework features:
const { data } = useQuery(['data', id], () => fetchData(id));
```

**Why:** Framework solutions handle caching, deduplication, race conditions, and loading states correctly.

## When You SHOULD Use Effects

Effects are appropriate for:

1. **External system synchronization:**
   - Browser APIs (DOM manipulation, timers, intersections)
   - Third-party libraries (maps, video players, chat widgets)
   - Network connections (WebSockets)
   - Browser-only setup (analytics, logging)

2. **Examples:**
   ```typescript
   // Syncing with browser API
   useEffect(() => {
     const timer = setInterval(() => tick(), 1000);
     return () => clearInterval(timer);
   }, []);

   // Syncing with external widget
   useEffect(() => {
     const connection = createConnection(roomId);
     connection.connect();
     return () => connection.disconnect();
   }, [roomId]);
   ```

## Quick Decision Tree

**Ask yourself:**
1. **Is this for rendering?** → Calculate during render
2. **Is this a user interaction?** → Use event handler
3. **Is this derived state?** → Calculate or use `useMemo`
4. **Does state need reset?** → Use `key` prop
5. **Is this external synchronization?** → Use Effect

## Benefits of Avoiding Unnecessary Effects

- **Faster:** Eliminates cascading re-renders
- **Simpler:** Reduces state management complexity
- **Fewer bugs:** Avoids stale closures and race conditions
- **Better UX:** No flashing of stale/default values
- **Clearer causality:** Explicit relationships between actions

## Red Flags

If you see these patterns, reconsider the Effect:
- Effect sets state based on props/state
- Effect runs on every prop/state change
- Multiple Effects form a chain
- Effect contains event-like logic (POSTs, navigation)
- Effect "notifies" parent components
- Effect only runs once (`[]` deps) but isn't external sync

## Framework Context (Convex + Next.js)

In this codebase:
- **Data fetching:** Convex reactive queries (`useQuery` from `convex/react`) — auto-subscribe, auto-update
- **Writes:** `useMutation(api.foo.bar)` — call in event handlers, never in Effects
- **Auth sync:** Clerk + `ConvexProviderWithClerk` handles JWT forwarding
- **Local UI state:** `useState` with computed values
- **Conditional queries:** Pass `"skip"` as args (never wrap `useQuery` in an `if`)
- **Pure logic:** Import from `convex/lib/` — zero Convex imports, testable with Vitest

**Pattern:**
```typescript
// ✅ CORRECT: Convex reactive query (auto-updates, no manual fetch)
const profiles = useQuery(api.profiles.list);

// ✅ CORRECT: Conditional query with "skip"
const user = useQuery(api.users.currentUser, isReady ? {} : "skip");

// ✅ CORRECT: Derived value from reactive query
const activeProfiles = useMemo(
  () => profiles?.filter(p => !p.isPreset) ?? [],
  [profiles]
);

// ❌ WRONG: Fetching in an Effect (Convex queries are already reactive)
useEffect(() => {
  fetchProfiles().then(setProfiles);
}, []);

// ❌ WRONG: Effect updating state from a Convex query
useEffect(() => {
  if (profiles) setFilteredProfiles(profiles.filter(p => !p.isPreset));
}, [profiles]);

// ❌ WRONG: Calling mutation in an Effect instead of event handler
useEffect(() => {
  if (shouldSave) saveMutation({ data });
}, [shouldSave]);
```
