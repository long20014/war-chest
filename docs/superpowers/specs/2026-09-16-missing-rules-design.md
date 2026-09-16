# Design: Implement Missing Game Rules

**Date:** 2026-09-16
**Status:** Approved for planning

## Goal

Wire the five rules from [docs/plan/rule.md](../../plan/rule.md) that are drawn
but not yet enforced by the engine, so the game is fully playable before an AI
opponent is built on top of it:

1. **Throne-win** — a King entering the empty throne wins.
2. **Walls** — block movement and ranged attacks.
3. **Warp** — teleport between warp cells.
4. **Soldier evolution** — a Soldier reaching the throne evolves.
5. **Throne dwell limit** — a non-King unit can't linger on the throne.

This is a **rules-only** change. The AI is a separate follow-up.

## Context

- Engine ([src/game.ts](../../../src/game.ts)) is pure functions over an
  immutable `GameState`: `getMoves`, `getAttacks`, `applyMove`, `applyAttack`,
  `advanceTurn`, `initialState`.
- UI/turn state lives in [src/components/Board.tsx](../../../src/components/Board.tsx),
  which already has a multi-phase turn flow for the Assassin bonus attack.
- Today only King-**capture** wins. `onThrone()` exists and gives range units a
  +1 attack range, but nothing else in the throne/warp/wall/evolution rules is
  enforced. `drawWalls` renders 16 wall segments around the four diagonal palace
  blocks; movement/attacks ignore them.
- Board geometry: `SIZE = 19`, throne at cell `(9,9)`, warp cells at
  `(4,4)`, `(4,14)`, `(14,4)`, `(14,14)`.

## Non-Goals

- No AI in this spec.
- No change to board rendering (`drawWalls` stays as-is; the engine gets its own
  canonical wall data documented to match the drawn segments).
- No unit-supply economy beyond what Rule 4/5 explicitly require.

## Final Rule Semantics

### 1. Throne-win
- A King moving onto the throne `(9,9)` wins **only if the throne is empty**.
- If any unit occupies the throne, the King cannot move onto it (no
  capture-to-win). Non-King units may enter/capture on the throne normally.
- The existing King-capture win condition is unchanged.

### 2. Walls
- Walls block **movement, ranged attack lines, Knight paths, and Magician
  fly-over**.
- **Exception:** a range unit standing **on the throne** ignores walls entirely
  for its attacks (in addition to its existing +1 range).

### 3. Warp
- When a unit **ends its move** on a warp cell and at least one *other* warp cell
  is empty, the moving player **may** teleport it to any empty warp cell, or stay.
- Applies to any unit that ends movement on a warp (King, Knight, Assassin, …).
- Teleport destination must be an empty warp cell. No swapping/capturing.
- Ordering with the Assassin bonus attack: warp resolves first (new square),
  then the optional bonus attack is computed from the post-warp position.

### 4. Soldier evolution
- When a Soldier moves onto the throne **and its owner has no living evolved
  unit**, the owner chooses any non-King type and the Soldier becomes it
  (`evolved = true`), occupying the throne.
- If the owner already has a living evolved unit, the Soldier may still move onto
  the throne but **stays a Soldier** (no second evolution).
- "Living evolved unit" = any piece owned by that player with `evolved === true`
  still on the board.
- An evolved range unit on the throne gets the throne bonuses (Rule 2 exception,
  +1 range) and is subject to Rule 5.

### 5. Throne dwell limit
- A non-King unit may occupy the throne for at most **3 of its owner's turns**.
- On the owner's turn after that, if the owner has not moved it off the throne,
  it is **auto-returned to its starting cell**. If that cell is occupied by any
  piece (friend or foe), the returning unit is **removed (dies)**.
- Counter resets whenever the unit leaves the throne.
- **Worked example (authoritative, tunable):** unit enters the throne on the
  owner's turn T. Still present at the start of the owner's turns T+1, T+2, T+3
  → counter = 1, 2, 3. At the start of turn T+4 the counter would exceed 3 → the
  unit is ejected/killed before the owner acts.

## Architecture

### Wall representation (main architectural choice)

Add a canonical **blocked-edge set** to `game.ts`:

```ts
// Normalized key for the forbidden step between two orthogonally-adjacent cells.
const WALLS: Set<string>;               // 16 entries, matching drawWalls segments
function edgeKey(a: Cell, b: Cell): string;             // order-independent
function blockedOrthogonal(a: Cell, b: Cell): boolean;  // a,b orthogonally adjacent
function blockedDiagonal(a: Cell, b: Cell): boolean;    // wall at the shared corner
function canCross(from: Cell, to: Cell, ignoreWalls: boolean): boolean;
```

- `blockedDiagonal(a,b)` returns true when either orthogonal edge flanking the
  shared corner is a wall — this is what seals diagonal entry to the palace.
- `canCross` is called by every step/ray in `getMoves`/`getAttacks`;
  `ignoreWalls` is true when the acting piece is a range unit on the throne.
- Canonical `WALLS` entries (derived from `drawWalls`, kept in sync by a comment
  cross-reference), as orthogonal cell-pairs:
  - Around top-left block: (7,8)-(7,9), (8,8)-(8,9), (8,7)-(9,7), (8,8)-(9,8)
  - Top-right: (7,9)-(7,10), (8,9)-(8,10), (8,10)-(9,10), (8,11)-(9,11)
  - Bottom-left: (10,8)-(10,9), (11,8)-(11,9), (9,7)-(10,7), (9,8)-(10,8)
  - Bottom-right: (10,9)-(10,10), (11,9)-(11,10), (9,10)-(10,10), (9,11)-(10,11)

*Alternative considered:* geometric segment-intersection tests against move rays
— more general but overkill for a fixed board. Rejected.

### `Piece` shape changes

```ts
export interface Piece {
  id: number;
  type: UnitType;
  player: Player;
  row: number;
  col: number;
  revealed?: boolean;   // existing (AS)
  evolved?: boolean;    // NEW (Rule 4): true if this piece is an evolved Soldier
  startRow: number;     // NEW (Rule 5): captured in initialState
  startCol: number;     // NEW (Rule 5)
  throneTurns?: number; // NEW (Rule 5): owner-turns spent continuously on throne
}
```

`initialState` records each piece's `startRow`/`startCol` from its spawn cell.

### Engine functions

- **`getMoves`** — thread `canCross` into every step for all piece types
  (DIRS8 melee, Assassin/Magician rays incl. fly-over, Knight paths incl. jumps).
  King may move onto the throne only if empty; Soldier may always move onto the
  throne; the throne is a normal cell for other types.
- **`getAttacks`** — thread `canCross` into every ray; apply the throne
  `ignoreWalls` exception for range units on the throne.
- **Win condition** — `applyMove` sets `winner` when a King lands on the empty
  throne, in addition to the existing King-capture win.
- **New pure helpers (shared by UI and future AI):**
  - `getWarpDestinations(state, pieceId): Cell[]`
  - `applyWarp(state, pieceId, row, col): GameState`
  - `canEvolve(state, pieceId): boolean`
  - `applyEvolution(state, pieceId, type: UnitType): GameState`
  - `resolveThroneTimer(state): GameState` — the maintenance pass for Rule 5.
- **Turn advancement** — route `applyMove`/`applyAttack` through `advanceTurn`,
  and have `advanceTurn` run `resolveThroneTimer` for the player it hands the
  turn to: increment `throneTurns` for that player's pieces on the throne (reset
  for those off it), then eject-or-kill any exceeding 3. This is a small,
  feature-required refactor so the timer is enforced regardless of how a turn
  ends (normal move, capture, assassin skip, warp-stay).

### UI flow ([src/components/Board.tsx](../../../src/components/Board.tsx))

Two new post-move interaction phases, mirroring the existing Assassin bonus
phase (each defers turn advance until resolved):

- **Warp phase:** after a move, if `getWarpDestinations` is non-empty, highlight
  the warp targets. Click a target → `applyWarp`; click elsewhere / the current
  cell → stay. Then continue (assassin bonus phase, or end turn).
- **Evolution phase:** after a move, if `canEvolve`, show a small unit-type
  picker (buttons overlaid on the board). Choosing a type → `applyEvolution`,
  then end turn.
- **Ordering:** warp → evolution/assassin-bonus → end turn.
- Auto-ejection/death from Rule 5 happens inside turn advance, so the board just
  re-renders the resulting state (a unit may vanish or reappear at its start).

## Testing (Vitest)

Add Vitest + a `"test": "vitest run"` script. New `src/game.test.ts`:

- **Walls:** a move/attack across a wall edge is rejected; a diagonal into the
  palace corner is rejected; a range unit on the throne ignores walls.
- **Throne-win:** King wins moving onto an empty throne; King is blocked when the
  throne is occupied; King-capture win still works.
- **Warp:** `getWarpDestinations` lists only empty other warps; `applyWarp`
  relocates the piece; occupied warps are excluded.
- **Evolution:** `canEvolve` true for a Soldier on the throne with no living
  evolved unit; false when one already lives; `applyEvolution` changes type and
  sets `evolved`; a second Soldier on the throne stays a Soldier.
- **Throne dwell:** counter increments per owner-turn; unit is auto-returned to
  its start cell after the limit; unit dies when the start cell is occupied;
  counter resets when the unit leaves the throne (follow the worked example).

## File Change Summary

- **Edit:** `src/game.ts` (wall data + helpers, `Piece` fields, `getMoves`,
  `getAttacks`, `applyMove`, `advanceTurn`, new warp/evolution/timer helpers).
- **Edit:** `src/components/Board.tsx` (warp + evolution interaction phases).
- **Edit:** `docs/plan/rule.md` (document Rule 5; clarify walls/warp/throne to
  match the implemented semantics).
- **New:** `src/game.test.ts`.
- **Edit:** `package.json` (add `vitest` + `test` script); possibly a
  `vitest.config.ts`.
- **Follow-up (not this spec):** revise
  `docs/superpowers/specs/2026-09-16-ai-opponent-design.md` so the AI action
  model enumerates warp destinations and evolution choices.
- **Unchanged:** `drawWalls` rendering.
