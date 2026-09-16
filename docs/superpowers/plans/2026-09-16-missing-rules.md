# Missing Game Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce the five drawn-but-unimplemented rules (throne-win, walls, warp, Soldier evolution, throne dwell limit) so War Chest is fully playable.

**Architecture:** Add pure rule logic to `src/game.ts` (a canonical wall-edge set + `canCross` helpers, `Piece` fields, warp/evolution/throne-timer helpers, and wall-aware `getMoves`/`getAttacks`), route all turn advances through `advanceTurn` so the throne timer runs centrally, then add warp/evolution interaction phases to `src/components/Board.tsx`. All rule logic is unit-tested with Vitest.

**Tech Stack:** TypeScript, React 19, Vite 8, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-16-missing-rules-design.md`

## Global Constraints

- Board is 19×19; throne cell is `(row 9, col 9)`; warp cells are `(4,4)`, `(4,14)`, `(14,4)`, `(14,14)`.
- Keep all rule logic in pure functions in `src/game.ts`; do not add rule logic to `Board.tsx`.
- Do NOT modify `drawWalls` in `Board.tsx` (rendering stays as-is); the engine's `WALLS` set is the logic source of truth and must correspond to the drawn segments.
- `Player` is `0 | 1`; `UnitType` is `'KI' | 'GA' | 'AS' | 'KN' | 'AR' | 'AT' | 'MG' | 'SD'`.
- Follow the existing immutable-state style: every apply function returns a new `GameState`; never mutate `state.pieces`.

---

### Task 1: Vitest setup

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/smoke.test.ts` (temporary sanity test, deleted at end of task)

**Interfaces:**
- Consumes: nothing.
- Produces: a working `npm test` command (`vitest run`) using the Node environment.

- [ ] **Step 1: Add Vitest dependency and script**

Run:
```bash
npm install -D vitest@^3
```
Then edit `package.json` `"scripts"` to add:
```json
"test": "vitest run"
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
```

- [ ] **Step 3: Write a smoke test**

Create `src/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest'

describe('vitest', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 4: Run the test to verify the runner works**

Run: `npm test`
Expected: PASS (1 test passed).

- [ ] **Step 5: Delete the smoke test and commit**

```bash
rm src/smoke.test.ts
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest test runner"
```

---

### Task 2: Piece fields + wall data and cross helpers

**Files:**
- Modify: `src/game.ts`
- Create: `src/game.test.ts`

**Interfaces:**
- Consumes: existing `Cell` type (`{ row: number; col: number }`), `initialState`.
- Produces:
  - `Piece` gains: `evolved?: boolean`, `startRow: number`, `startCol: number`, `throneTurns?: number`.
  - `export function canCross(from: Cell, to: Cell, ignoreWalls: boolean): boolean` — `from`/`to` are adjacent cells (orthogonal or diagonal). Returns `false` when a wall blocks the step, `true` otherwise (always `true` when `ignoreWalls`).
  - Internal (not exported): `WALLS: Set<string>`, `edgeKey(a, b)`, `blockedOrthogonal(a, b)`, `blockedDiagonal(a, b)`.

- [ ] **Step 1: Write failing tests for wall crossing and piece start fields**

Create `src/game.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { initialState, canCross } from './game'

describe('canCross (walls)', () => {
  it('blocks the orthogonal step across a palace wall edge', () => {
    // (8,8)-(9,8) is a wall (top-left palace block)
    expect(canCross({ row: 8, col: 8 }, { row: 9, col: 8 }, false)).toBe(false)
  })

  it('allows a normal orthogonal step with no wall', () => {
    expect(canCross({ row: 5, col: 5 }, { row: 5, col: 6 }, false)).toBe(true)
  })

  it('blocks a diagonal step into the sealed palace corner', () => {
    // (8,8)->(9,9): flanked by wall edges (8,8)-(8,9) and (8,8)-(9,8)
    expect(canCross({ row: 8, col: 8 }, { row: 9, col: 9 }, false)).toBe(false)
    // symmetric
    expect(canCross({ row: 9, col: 9 }, { row: 8, col: 8 }, false)).toBe(false)
  })

  it('ignores walls when ignoreWalls is true', () => {
    expect(canCross({ row: 8, col: 8 }, { row: 9, col: 8 }, true)).toBe(true)
  })
})

describe('initialState piece start fields', () => {
  it('records each piece start cell', () => {
    const s = initialState()
    for (const p of s.pieces) {
      expect(p.startRow).toBe(p.row)
      expect(p.startCol).toBe(p.col)
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL (`canCross` is not exported; `startRow`/`startCol` undefined).

- [ ] **Step 3: Extend the `Piece` interface**

In `src/game.ts`, update the interface:
```ts
export interface Piece {
  id: number;
  type: UnitType;
  player: Player;
  row: number;
  col: number;
  revealed?: boolean; // AS only
  evolved?: boolean;  // true if this piece is an evolved Soldier
  startRow: number;   // spawn cell, for throne-dwell auto-return
  startCol: number;
  throneTurns?: number; // owner-turns spent continuously on the throne
}
```

- [ ] **Step 4: Set start cells in `initialState`**

Change the `mk` helper so every piece records its spawn cell:
```ts
const mk = (type: UnitType, player: Player, row: number, col: number): Piece =>
  ({ id: id++, type, player, row, col, startRow: row, startCol: col });
```

- [ ] **Step 5: Add the wall data and cross helpers**

Add near the top of `src/game.ts` (after the `Cell` type). The 16 edges correspond exactly to the segments in `drawWalls`:
```ts
// Orthogonal cell-pairs that a wall sits between. Mirrors drawWalls in Board.tsx.
const WALL_EDGES: [Cell, Cell][] = [
  // top-left block
  [{ row: 7, col: 8 }, { row: 7, col: 9 }], [{ row: 8, col: 8 }, { row: 8, col: 9 }],
  [{ row: 8, col: 7 }, { row: 9, col: 7 }], [{ row: 8, col: 8 }, { row: 9, col: 8 }],
  // top-right block
  [{ row: 7, col: 9 }, { row: 7, col: 10 }], [{ row: 8, col: 9 }, { row: 8, col: 10 }],
  [{ row: 8, col: 10 }, { row: 9, col: 10 }], [{ row: 8, col: 11 }, { row: 9, col: 11 }],
  // bottom-left block
  [{ row: 10, col: 8 }, { row: 10, col: 9 }], [{ row: 11, col: 8 }, { row: 11, col: 9 }],
  [{ row: 9, col: 7 }, { row: 10, col: 7 }], [{ row: 9, col: 8 }, { row: 10, col: 8 }],
  // bottom-right block
  [{ row: 10, col: 9 }, { row: 10, col: 10 }], [{ row: 11, col: 9 }, { row: 11, col: 10 }],
  [{ row: 9, col: 10 }, { row: 10, col: 10 }], [{ row: 9, col: 11 }, { row: 10, col: 11 }],
];

function edgeKey(a: Cell, b: Cell): string {
  const ka = `${a.row},${a.col}`, kb = `${b.row},${b.col}`;
  return ka < kb ? `${ka}-${kb}` : `${kb}-${ka}`;
}

const WALLS = new Set(WALL_EDGES.map(([a, b]) => edgeKey(a, b)));

function blockedOrthogonal(a: Cell, b: Cell): boolean {
  return WALLS.has(edgeKey(a, b));
}

// A diagonal step is blocked if a wall sits on any of the orthogonal edges
// meeting at the shared corner (seals diagonal entry to the palace).
function blockedDiagonal(a: Cell, b: Cell): boolean {
  const c1: Cell = { row: a.row, col: b.col };
  const c2: Cell = { row: b.row, col: a.col };
  return (
    blockedOrthogonal(a, c1) || blockedOrthogonal(a, c2) ||
    blockedOrthogonal(b, c1) || blockedOrthogonal(b, c2)
  );
}

export function canCross(from: Cell, to: Cell, ignoreWalls: boolean): boolean {
  if (ignoreWalls) return true;
  const dr = Math.abs(from.row - to.row), dc = Math.abs(from.col - to.col);
  if (dr + dc === 1) return !blockedOrthogonal(from, to);
  if (dr === 1 && dc === 1) return !blockedDiagonal(from, to);
  return true; // non-adjacent: callers step one cell at a time
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/game.ts src/game.test.ts
git commit -m "feat: add wall-edge data, canCross, and piece start/evolved/throneTurns fields"
```

---

### Task 3: Wall-aware movement and attacks

**Files:**
- Modify: `src/game.ts` (`getMoves`, `getAttacks`)
- Modify: `src/game.test.ts`

**Interfaces:**
- Consumes: `canCross` (Task 2), existing `getMoves`, `getAttacks`, `onThrone`.
- Produces: `getMoves`/`getAttacks` that never let a piece step/fire across a wall, except a range unit standing on the throne ignores walls when attacking.

- [ ] **Step 1: Write failing tests**

Add to `src/game.test.ts`:
```ts
import { getMoves, getAttacks } from './game'
import type { Piece, GameState } from './game'

function piece(over: Partial<Piece> & { type: Piece['type']; row: number; col: number }): Piece {
  return { id: 1, player: 0, revealed: false, startRow: over.row, startCol: over.col, ...over }
}

describe('walls block movement', () => {
  it('a Guard cannot step across a palace wall edge', () => {
    // Guard at (8,8); (9,8) is walled off, (8,9) is walled off
    const g = piece({ type: 'GA', row: 8, col: 8 })
    const moves = getMoves(g, [g])
    expect(moves).not.toContainEqual({ row: 9, col: 8 })
    expect(moves).not.toContainEqual({ row: 8, col: 9 })
    // (7,7) is open (no wall on that diagonal)
    expect(moves).toContainEqual({ row: 7, col: 7 })
  })
})

describe('walls block ranged attacks', () => {
  it('an Archer cannot shoot across a wall', () => {
    // Archer at (8,7) firing right toward enemy at (8,9): blocked by (8,8)-(8,9) wall
    const ar = piece({ type: 'AR', row: 8, col: 7 })
    const enemy = piece({ id: 2, type: 'SD', player: 1, row: 8, col: 9, startRow: 8, startCol: 9 })
    const attacks = getAttacks(ar, [ar, enemy])
    expect(attacks).not.toContainEqual({ row: 8, col: 9 })
  })

  it('a range unit on the throne ignores walls when attacking', () => {
    // Archer on throne firing up-left toward enemy at (8,8); throne exception applies
    const ar = piece({ type: 'AR', row: 9, col: 9, startRow: 17, startCol: 6 })
    const enemy = piece({ id: 2, type: 'SD', player: 1, row: 8, col: 8, startRow: 8, startCol: 8 })
    const attacks = getAttacks(ar, [ar, enemy])
    expect(attacks).toContainEqual({ row: 8, col: 8 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL (walls not yet enforced).

- [ ] **Step 3: Thread `canCross` into `getMoves`**

In each movement branch, reject steps that cross a wall. For single-step melee (`KI`, `GA`, `SD`, `AR` DIRS8 group) add a guard before pushing:
```ts
if (!canCross({ row: piece.row, col: piece.col }, { row: r, col: c }, false)) continue;
```
For multi-step rays (`AS`, `MG`) and the artillery step (`AT`), track the previous cell and check each consecutive step, breaking when blocked:
```ts
let prev = { row: piece.row, col: piece.col };
// inside the per-step loop, before accepting cell {r,c}:
if (!canCross(prev, { row: r, col: c }, false)) break;
prev = { row: r, col: c };
```
For the Knight (`tryPath`), check `canCross` between consecutive path cells; if blocked, `return` (path invalid):
```ts
// inside tryPath, after computing new r,c and before the isPlayable checks:
if (!canCross({ row: r - steps[i].row, col: c - steps[i].col }, { row: r, col: c }, false)) return;
```

- [ ] **Step 4: Thread `canCross` into `getAttacks`**

At the top of `getAttacks` compute the throne exception:
```ts
const ignoreWalls = onThrone(piece);
```
For every ray branch (`AS`, `AR`, `MG`, `AT`), track the previous cell and break when a step is blocked:
```ts
let prev = { row: piece.row, col: piece.col };
// inside the per-step loop, before inspecting cell {r,c}:
if (!canCross(prev, { row: r, col: c }, ignoreWalls)) break;
prev = { row: r, col: c };
```
For `AT`, apply the same check on both the mandatory empty first cell and the ranged cells.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game.ts src/game.test.ts
git commit -m "feat: walls block movement and ranged attacks (throne range unit excepted)"
```

---

### Task 4: Throne-win and King throne-entry restriction

**Files:**
- Modify: `src/game.ts` (`getMoves` King branch, `applyMove`)
- Modify: `src/game.test.ts`

**Interfaces:**
- Consumes: `getMoves`, `applyMove`, `THRONE_ROW`/`THRONE_COL` constants.
- Produces: King may move onto the throne only when empty; `applyMove` sets `winner` when a King lands on the empty throne.

- [ ] **Step 1: Write failing tests**

Add to `src/game.test.ts`:
```ts
import { applyMove } from './game'

describe('throne-win', () => {
  it('King wins by moving onto the empty throne', () => {
    const king = piece({ type: 'KI', row: 9, col: 8 })
    const state: GameState = { pieces: [king], turn: 0, winner: null }
    const moves = getMoves(king, state.pieces)
    expect(moves).toContainEqual({ row: 9, col: 9 })
    const next = applyMove(state, king.id, 9, 9)
    expect(next.winner).toBe(0)
  })

  it('King cannot move onto an occupied throne', () => {
    const king = piece({ type: 'KI', row: 9, col: 8 })
    const blocker = piece({ id: 2, type: 'SD', player: 1, row: 9, col: 9, startRow: 9, startCol: 9 })
    const moves = getMoves(king, [king, blocker])
    expect(moves).not.toContainEqual({ row: 9, col: 9 })
  })

  it('King-capture win still works', () => {
    const king = piece({ type: 'KI', row: 5, col: 5 })
    const enemyKing = piece({ id: 2, type: 'KI', player: 1, row: 5, col: 6, startRow: 5, startCol: 6 })
    const state: GameState = { pieces: [king, enemyKing], turn: 0, winner: null }
    const next = applyMove(state, king.id, 5, 6)
    expect(next.winner).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL (King enters occupied throne / no throne-win).

- [ ] **Step 3: Split the King out of the melee group in `getMoves`**

Give `KI` its own case (remove it from `case 'KI': case 'GA': ...`):
```ts
case 'KI':
  for (const d of DIRS8) {
    const r = piece.row + d.row, c = piece.col + d.col;
    if (!canCross({ row: piece.row, col: piece.col }, { row: r, col: c }, false)) continue;
    if (r === THRONE_ROW && c === THRONE_COL) {
      if (!occupied.has(`${r},${c}`)) results.push({ row: r, col: c }); // empty throne only
      continue;
    }
    if (meleeOk(r, c)) results.push({ row: r, col: c });
  }
  break;
```
(Move the `THRONE_ROW`/`THRONE_COL` consts above `getMoves` if they are declared below it.)

- [ ] **Step 4: Add the throne-win to `applyMove`**

In `applyMove`, extend the winner check:
```ts
const enteredThrone = moving.type === 'KI' && row === THRONE_ROW && col === THRONE_COL;
const winner: Player | null =
  target?.type === 'KI' ? moving.player
  : enteredThrone ? moving.player
  : null;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game.ts src/game.test.ts
git commit -m "feat: King wins on empty throne; blocked from occupied throne"
```

---

### Task 5: Warp helpers

**Files:**
- Modify: `src/game.ts`
- Modify: `src/game.test.ts`

**Interfaces:**
- Consumes: `GameState`, `Cell`.
- Produces:
  - `export function getWarpDestinations(state: GameState, pieceId: number): Cell[]`
  - `export function applyWarp(state: GameState, pieceId: number, row: number, col: number): GameState`

- [ ] **Step 1: Write failing tests**

Add to `src/game.test.ts`:
```ts
import { getWarpDestinations, applyWarp } from './game'

describe('warp', () => {
  it('lists empty other warp cells when the piece is on a warp', () => {
    const p = piece({ type: 'KN', row: 4, col: 4 })
    const dests = getWarpDestinations({ pieces: [p], turn: 0, winner: null }, p.id)
    expect(dests).toContainEqual({ row: 4, col: 14 })
    expect(dests).toContainEqual({ row: 14, col: 4 })
    expect(dests).toContainEqual({ row: 14, col: 14 })
    expect(dests).not.toContainEqual({ row: 4, col: 4 })
  })

  it('excludes occupied warp cells', () => {
    const p = piece({ type: 'KN', row: 4, col: 4 })
    const other = piece({ id: 2, type: 'SD', player: 1, row: 4, col: 14, startRow: 4, startCol: 14 })
    const dests = getWarpDestinations({ pieces: [p, other], turn: 0, winner: null }, p.id)
    expect(dests).not.toContainEqual({ row: 4, col: 14 })
  })

  it('returns [] when the piece is not on a warp', () => {
    const p = piece({ type: 'KN', row: 5, col: 5 })
    expect(getWarpDestinations({ pieces: [p], turn: 0, winner: null }, p.id)).toEqual([])
  })

  it('applyWarp relocates the piece', () => {
    const p = piece({ type: 'KN', row: 4, col: 4 })
    const next = applyWarp({ pieces: [p], turn: 0, winner: null }, p.id, 14, 14)
    const moved = next.pieces.find(x => x.id === p.id)!
    expect([moved.row, moved.col]).toEqual([14, 14])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL (helpers not exported).

- [ ] **Step 3: Implement the warp helpers**

Add to `src/game.ts`:
```ts
const WARP_CELLS: Cell[] = [
  { row: 4, col: 4 }, { row: 4, col: 14 }, { row: 14, col: 4 }, { row: 14, col: 14 },
];

export function getWarpDestinations(state: GameState, pieceId: number): Cell[] {
  const p = state.pieces.find(x => x.id === pieceId)!;
  const onWarp = WARP_CELLS.some(w => w.row === p.row && w.col === p.col);
  if (!onWarp) return [];
  const occupied = new Set(state.pieces.map(x => `${x.row},${x.col}`));
  return WARP_CELLS.filter(w =>
    !(w.row === p.row && w.col === p.col) && !occupied.has(`${w.row},${w.col}`),
  );
}

export function applyWarp(state: GameState, pieceId: number, row: number, col: number): GameState {
  return {
    ...state,
    pieces: state.pieces.map(p => (p.id === pieceId ? { ...p, row, col } : p)),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game.ts src/game.test.ts
git commit -m "feat: add warp destination + teleport helpers"
```

---

### Task 6: Soldier evolution helpers

**Files:**
- Modify: `src/game.ts`
- Modify: `src/game.test.ts`

**Interfaces:**
- Consumes: `GameState`, `UnitType`, `THRONE_ROW`/`THRONE_COL`.
- Produces:
  - `export function canEvolve(state: GameState, pieceId: number): boolean`
  - `export function applyEvolution(state: GameState, pieceId: number, type: UnitType): GameState`

- [ ] **Step 1: Write failing tests**

Add to `src/game.test.ts`:
```ts
import { canEvolve, applyEvolution } from './game'

describe('evolution', () => {
  it('a Soldier on the throne can evolve when no evolved unit lives', () => {
    const sd = piece({ type: 'SD', row: 9, col: 9 })
    expect(canEvolve({ pieces: [sd], turn: 0, winner: null }, sd.id)).toBe(true)
  })

  it('a Soldier cannot evolve while an evolved unit already lives', () => {
    const sd = piece({ type: 'SD', row: 9, col: 9 })
    const already = piece({ id: 2, type: 'MG', player: 0, row: 5, col: 5, startRow: 5, startCol: 5, evolved: true })
    expect(canEvolve({ pieces: [sd, already], turn: 0, winner: null }, sd.id)).toBe(false)
  })

  it('a Soldier not on the throne cannot evolve', () => {
    const sd = piece({ type: 'SD', row: 8, col: 9 })
    expect(canEvolve({ pieces: [sd], turn: 0, winner: null }, sd.id)).toBe(false)
  })

  it('applyEvolution changes type and marks evolved', () => {
    const sd = piece({ type: 'SD', row: 9, col: 9 })
    const next = applyEvolution({ pieces: [sd], turn: 0, winner: null }, sd.id, 'MG')
    const evolved = next.pieces.find(x => x.id === sd.id)!
    expect(evolved.type).toBe('MG')
    expect(evolved.evolved).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL (helpers not exported).

- [ ] **Step 3: Implement the evolution helpers**

Add to `src/game.ts`:
```ts
export function canEvolve(state: GameState, pieceId: number): boolean {
  const p = state.pieces.find(x => x.id === pieceId)!;
  if (p.type !== 'SD' || p.row !== THRONE_ROW || p.col !== THRONE_COL) return false;
  const hasEvolved = state.pieces.some(x => x.player === p.player && x.evolved);
  return !hasEvolved;
}

export function applyEvolution(state: GameState, pieceId: number, type: UnitType): GameState {
  return {
    ...state,
    pieces: state.pieces.map(p => (p.id === pieceId ? { ...p, type, evolved: true } : p)),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game.ts src/game.test.ts
git commit -m "feat: add Soldier evolution helpers (one evolved unit per player)"
```

---

### Task 7: Throne dwell timer

**Files:**
- Modify: `src/game.ts` (`advanceTurn`, `applyMove`, `applyAttack`, new `resolveThroneTimer`)
- Modify: `src/game.test.ts`

**Interfaces:**
- Consumes: `GameState`, `advanceTurn`, `applyMove`, `applyAttack`, `Piece.startRow`/`startCol`/`throneTurns`.
- Produces: `export function resolveThroneTimer(state: GameState): GameState` — increments the on-throne counter for `state.turn`'s non-King pieces (resets others), and ejects/kills any that exceed 3 owner-turns. `advanceTurn` runs it after flipping; `applyMove`/`applyAttack` route their turn advance through `advanceTurn`.

- [ ] **Step 1: Write failing tests**

Add to `src/game.test.ts`:
```ts
import { advanceTurn, applyAttack } from './game'

describe('throne dwell limit', () => {
  it('a non-King unit is ejected to its start after 3 owner-turns on the throne', () => {
    // AR on throne, its start cell (17,6) is free. Player 0 owns it.
    let state: GameState = {
      pieces: [piece({ type: 'AR', row: 9, col: 9, startRow: 17, startCol: 6 })],
      turn: 0, winner: null,
    }
    // Simulate owner turns beginning: advanceTurn hands the turn to a player and
    // runs the timer for that player. Bring the turn back to player 0 four times.
    const toPlayer0 = (s: GameState) => (s.turn === 0 ? s : advanceTurn(s))
    // start on player 1's turn so the first advance hands it to player 0
    state = { ...state, turn: 1 }
    state = advanceTurn(state) // -> player 0, counter 1
    let ar = state.pieces[0]; expect(ar.throneTurns).toBe(1)
    state = advanceTurn(state) // -> player 1
    state = advanceTurn(state) // -> player 0, counter 2
    expect(state.pieces[0].throneTurns).toBe(2)
    state = advanceTurn(state); state = advanceTurn(state) // -> player 0, counter 3
    expect(state.pieces[0].throneTurns).toBe(3)
    state = advanceTurn(state); state = advanceTurn(state) // -> player 0, would be 4 -> eject
    ar = state.pieces[0]
    expect([ar.row, ar.col]).toEqual([17, 6])
    expect(ar.throneTurns).toBe(0)
    void toPlayer0
  })

  it('the unit dies when its start cell is occupied at eject time', () => {
    let state: GameState = {
      pieces: [
        piece({ type: 'AR', row: 9, col: 9, startRow: 17, startCol: 6 }),
        piece({ id: 2, type: 'SD', player: 0, row: 17, col: 6, startRow: 17, startCol: 6 }),
      ],
      turn: 1, winner: null,
    }
    for (let i = 0; i < 8; i++) state = advanceTurn(state) // cycle past the limit
    expect(state.pieces.find(p => p.id === 1)).toBeUndefined() // AR removed
  })

  it('the counter resets when the unit leaves the throne', () => {
    let state: GameState = {
      pieces: [piece({ type: 'AR', row: 9, col: 9, startRow: 17, startCol: 6, throneTurns: 2 })],
      turn: 1, winner: null,
    }
    // move it off the throne, then advance to player 0
    state = { ...state, pieces: [{ ...state.pieces[0], row: 9, col: 8 }] }
    state = advanceTurn(state) // -> player 0, off throne
    expect(state.pieces[0].throneTurns).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL (`resolveThroneTimer` not exported / timer not applied).

- [ ] **Step 3: Implement `resolveThroneTimer` and route `advanceTurn` through it**

Add to `src/game.ts` and replace the existing `advanceTurn`:
```ts
export function resolveThroneTimer(state: GameState): GameState {
  const player = state.turn; // the player about to move
  // increment for that player's non-King pieces on the throne; reset the rest
  const ticked = state.pieces.map(p => {
    if (p.player !== player || p.type === 'KI') return p;
    const onThroneCell = p.row === THRONE_ROW && p.col === THRONE_COL;
    if (!onThroneCell) return p.throneTurns ? { ...p, throneTurns: 0 } : p;
    return { ...p, throneTurns: (p.throneTurns ?? 0) + 1 };
  });
  // eject or kill any that exceeded 3
  const result: Piece[] = [];
  for (const p of ticked) {
    const expired =
      p.player === player && p.type !== 'KI' &&
      p.row === THRONE_ROW && p.col === THRONE_COL && (p.throneTurns ?? 0) > 3;
    if (!expired) { result.push(p); continue; }
    const startOccupied = ticked.some(o => o.id !== p.id && o.row === p.startRow && o.col === p.startCol);
    if (startOccupied) continue; // dies
    result.push({ ...p, row: p.startRow, col: p.startCol, throneTurns: 0 });
  }
  return { ...state, pieces: result };
}

export function advanceTurn(state: GameState): GameState {
  const flipped: GameState = { ...state, turn: state.turn === 0 ? 1 : 0 };
  return resolveThroneTimer(flipped);
}
```

- [ ] **Step 4: Route `applyMove` and `applyAttack` turn advance through `advanceTurn`**

In `applyMove`, replace the inline `turn` computation and return with:
```ts
const base: GameState = { pieces, turn: state.turn, winner };
if (winner !== null || skipTurnAdvance) return base;
return advanceTurn(base);
```
In `applyAttack`, similarly:
```ts
const base: GameState = { pieces, turn: state.turn, winner };
if (winner !== null) return base;
return advanceTurn(base);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all game tests green).

- [ ] **Step 6: Commit**

```bash
git add src/game.ts src/game.test.ts
git commit -m "feat: enforce throne dwell limit (auto-return or death after 3 owner-turns)"
```

---

### Task 8: Board UI phases + rules doc update

**Files:**
- Modify: `src/components/Board.tsx`
- Modify: `docs/plan/rule.md`

**Interfaces:**
- Consumes: `getWarpDestinations`, `applyWarp`, `canEvolve`, `applyEvolution`, `advanceTurn`, `applyMove` (all from `src/game.ts`).
- Produces: interactive warp + evolution phases in the board; updated rules doc.

- [ ] **Step 1: Add warp/evolution state and imports**

In `Board.tsx`, extend the import from `../game` to include `getWarpDestinations, applyWarp, canEvolve, applyEvolution`. Add state near the other `useState` hooks:
```tsx
const [warpId, setWarpId] = useState<number | null>(null);
const [warpDests, setWarpDests] = useState<Cell[]>([]);
const [evolveId, setEvolveId] = useState<number | null>(null);
```
Update `clearSelection` to also clear these three.

- [ ] **Step 2: Add a post-move resolver helper**

Inside `Board`, add a function that runs after a non-attack landing to sequence warp → evolution → end turn. It takes the state produced by a move made with `skipTurnAdvance = true`:
```tsx
const resolvePostMove = useCallback((movedState: GameState, pieceId: number) => {
  const warps = getWarpDestinations(movedState, pieceId);
  if (warps.length > 0) {
    setState(movedState);
    setWarpId(pieceId);
    setWarpDests(warps);
    return;
  }
  if (canEvolve(movedState, pieceId)) {
    setState(movedState);
    setEvolveId(pieceId);
    return;
  }
  setState(advanceTurn(movedState));
  clearSelection();
}, [clearSelection]);
```

- [ ] **Step 3: Route non-Assassin moves through the resolver**

In `handleClick`, in the normal move branch, for non-Assassin pieces call `applyMove` with `skipTurnAdvance = true` and hand off to `resolvePostMove` instead of advancing immediately:
```tsx
if (piece.type !== 'AS') {
  const moved = applyMove(state, selected!, row, col, true);
  if (moved.winner !== null) { setState(moved); clearSelection(); return; }
  resolvePostMove(moved, selected!);
  return;
}
```
For the Assassin flow, resolve the ordering explicitly as **move → warp (if any) → bonus attack**. Concretely: after `applyMove(state, id, r, c, true)`, check `getWarpDestinations(moved, id)`. If non-empty, enter the warp phase first (set `warpId`/`warpDests`) and do NOT compute the bonus attack yet. The warp-phase handler (Step 4), when the acting piece is an Assassin, must — after teleporting or staying — recompute `getAttacks(assassinAtNewPos, resultState.pieces)` and, if any, enter the existing bonus-attack phase (`setBonusAttackId(id)`, `setValidAttacks(attacks)`) instead of advancing the turn. If there are no warp destinations, keep the current behavior (compute the bonus attack from the moved square immediately). An Assassin never evolves, so skip the `canEvolve` branch for it.

- [ ] **Step 4: Handle clicks during the warp phase**

Near the top of `handleClick` (before the normal branches), add:
```tsx
if (warpId !== null) {
  if (warpDests.some(w => w.row === row && w.col === col)) {
    const warped = applyWarp(state, warpId, row, col);
    setState(canEvolve(warped, warpId) ? warped : advanceTurn(warped));
    if (canEvolve(warped, warpId)) { setEvolveId(warpId); }
    setWarpId(null); setWarpDests([]);
    if (!canEvolve(warped, warpId)) clearSelection();
  } else {
    // stay: no teleport
    setState(canEvolve(state, warpId) ? state : advanceTurn(state));
    if (canEvolve(state, warpId)) setEvolveId(warpId);
    setWarpId(null); setWarpDests([]);
    if (!canEvolve(state, warpId)) clearSelection();
  }
  return;
}
```

- [ ] **Step 5: Render the warp highlights and the evolution picker**

In the `useEffect` draw call, pass `warpDests` as extra highlighted cells (reuse the green move color or a distinct color). Add an evolution picker overlay in the JSX, shown when `evolveId !== null`:
```tsx
{evolveId !== null && (
  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
    <div className="bg-white rounded p-3 flex flex-wrap gap-2 max-w-[240px]">
      {(['GA','AS','KN','AR','AT','MG','SD'] as const).map(t => (
        <button
          key={t}
          className="border px-2 py-1 text-sm"
          onClick={() => {
            setState(prev => advanceTurn(applyEvolution(prev, evolveId, t)));
            setEvolveId(null);
            clearSelection();
          }}
        >{t}</button>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 6: Verify the build and lint**

Run: `npm run build`
Expected: no TypeScript errors.
Run: `npm run lint`
Expected: no new lint errors.

- [ ] **Step 7: Manually verify in the dev server**

Run: `npm run dev`, then in the browser confirm:
- A King moving onto the empty throne ends the game (Blue/Red wins).
- A unit cannot move or shoot across a palace wall; a range unit on the throne can.
- A unit ending on a warp cell offers teleport targets; clicking one relocates it, clicking elsewhere stays.
- A Soldier reaching the throne shows the evolution picker (only when no evolved unit is alive).
- A non-King unit left on the throne is returned to its start (or removed if occupied) after enough of its own turns.

- [ ] **Step 8: Update the rules doc**

In `docs/plan/rule.md`, add Rule 5 (throne dwell limit) to the Combat/Throne section and clarify the wording of Walls (block move + attack), Warp (optional teleport to an empty warp), Throne (King enters an *empty* throne to win), and Evolution (one evolved unit per player at a time). Example addition:
```markdown
- **Throne dwell:** A non-King unit may occupy the Throne for at most **3 of its owner's turns**. On the owner's next turn it is automatically returned to its starting cell; if that cell is occupied, the unit is removed (killed).
- **Evolution:** Only one evolved Soldier per player may exist at a time. A Soldier reaching the Throne while an evolved unit already lives stays a Soldier.
- **King-win:** A King wins by entering the Throne only when it is empty.
```

- [ ] **Step 9: Commit**

```bash
git add src/components/Board.tsx docs/plan/rule.md
git commit -m "feat: warp + evolution interaction phases; document new rules"
```

---

## Notes for the executor

- Run `npm test` after every engine task; the suite must stay green.
- Tasks 2–7 are pure-logic and fully TDD. Task 8 is UI — its correctness is verified by build + lint + the manual checklist, since the board is canvas-driven and not unit-tested here.
- After this plan lands, revise `docs/superpowers/specs/2026-09-16-ai-opponent-design.md` so the AI action model enumerates warp destinations and evolution choices, then build the AI.
