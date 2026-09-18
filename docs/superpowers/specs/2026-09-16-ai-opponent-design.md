# Design: Minimax AI Opponent

**Date:** 2026-09-16
**Status:** Implemented 2026-09-17 on branch `feat/ai-opponent` (src/ai/actions.ts, evaluate.ts, ai.ts + Board.tsx wiring)

## Goal

Add an AI opponent so a human can play against the computer. The AI always
controls **Red (Player 1)**; the human plays **Blue (Player 0)**. The AI uses
minimax search with alpha-beta pruning.

## Context

- The game engine ([src/game.ts](../../../src/game.ts)) is a set of pure
  functions over an immutable `GameState`: `getMoves`, `getAttacks`,
  `applyMove`, `applyAttack`, `advanceTurn`, `initialState`, plus the
  choice helpers added by the missing-rules feature: `getWarpDestinations`,
  `applyWarp`, `canEvolve`, `applyEvolution`, and the maintenance pass
  `resolveThroneTimer` (run inside `advanceTurn`).
- All turn/selection state lives in React state in
  [src/components/Board.tsx](../../../src/components/Board.tsx).
- **Win conditions (both live):** capturing the enemy King
  (`applyMove`/`applyAttack` set `winner` when the target is `'KI'`), **and**
  a King moving onto the **empty** throne `(9,9)` (`applyMove` sets `winner`).
- **Rules the engine now enforces — the AI gets them for free by reusing the
  engine:** walls block movement/attacks/jumps (baked into `getMoves`/
  `getAttacks`); a range unit on the throne ignores walls; the throne dwell
  timer auto-returns or kills a lingering non-King unit inside `advanceTurn`.
  These need **no special handling** in the AI — every action the AI builds
  routes through the same engine functions, so a walled-off square never
  appears in `getMoves`, and dwell ejection happens when the AI (or human)
  advances the turn.
- **Rules that add branching to a single turn** — these the action model must
  enumerate explicitly (see `actions.ts`): a unit that ends its move on a warp
  cell **may** teleport to an empty other warp or stay; a Soldier reaching the
  empty-of-evolved-units throne **evolves into a chosen non-King type**.
- Hidden information: unrevealed Assassins are non-targetable. The engine
  enforces this via `isTargetable`.

## Non-Goals

- No probabilistic modeling of hidden Assassins — the AI searches the visible
  state (perfect-information search); unrevealed enemy Assassins simply appear
  as non-targetable, which the engine already handles.
- No changes to game rules, the board renderer, or existing win/overlay logic.
  The engine is reused verbatim.
- No difficulty selector or side selector — Red is always the AI.
- No AI-vs-AI mode.

## Architecture

A new UI-independent module directory `src/ai/` with three focused files:

### `src/ai/actions.ts` — the turn model

```ts
export interface Action {
  desc: string;        // human-readable, e.g. "KN (7,2)->(7,4) x AR" or "SD ->throne evolve KN"
  next: GameState;     // resulting state after the FULL turn, turn advanced (or winner set)
}

export function legalActions(state: GameState): Action[];
```

`legalActions` enumerates every complete legal turn for `state.turn`'s player,
each with the fully-resolved resulting `GameState` (turn already advanced, or
`winner` set). It is the single place that flattens the interactive post-move
choices — Assassin bonus-attack, warp teleport, Soldier evolution — into
discrete atomic turns. It reuses the engine functions — **no rule logic is
duplicated**. It mirrors the sequencing the UI uses in `Board.tsx`'s
`resolvePostMove` (warp → evolution → advance; for the Assassin, move → warp →
bonus attack).

**Shared helper — `resolveMovedTurn(moved, id): Action[]`** (used by the
non-Assassin move branch): given a state produced by
`applyMove(state, id, r, c, /*skipTurnAdvance*/ true)`, produce every
fully-resolved turn it can lead to:

1. If `moved.winner !== null` → single action `{ next: moved }` (terminal:
   King captured or King landed on the empty throne). Stop.
2. Else let `warps = getWarpDestinations(moved, id)`.
   - If `warps.length > 0`: for each choice in `[stay, ...warps]`, let
     `s = (choice === stay) ? moved : applyWarp(moved, id, choice.row, choice.col)`,
     and emit `advanceTurn(s)`. (A warp cell is never the throne, so no
     evolution follows a warp.)
   - Else if `canEvolve(moved, id)`: for each `t` in the non-King types
     `['GA','AS','KN','AR','AT','MG','SD']`, emit
     `advanceTurn(applyEvolution(moved, id, t))`. (Includes `'SD'` — declining
     to change type is a legal "evolution" choice and keeps the option space
     honest; the search will rank it.)
   - Else emit `advanceTurn(moved)`.

Enumeration per own piece:

- **Non-Assassin move / capture:** for each cell in `getMoves(piece)`,
  `moved = applyMove(state, id, r, c, /*skipTurnAdvance*/ true)`, then append
  `resolveMovedTurn(moved, id)`.
- **Assassin move:** for each cell in `getMoves(piece)` (moves onto empty cells
  only), `moved = applyMove(state, id, r, c, /*skipTurnAdvance*/ true)`, then:
  - Let `warps = getWarpDestinations(moved, id)`.
  - For each `place` in `warps.length > 0 ? [stay, ...warps] : [stay]`:
    let `s = (place === stay) ? moved : applyWarp(moved, id, place.row, place.col)`.
    - Emit a **move-(warp-)only** action = `advanceTurn(s)`.
    - For each cell in `getAttacks(assassinIn(s), s.pieces)`, emit a **move +
      bonus-attack** action = `applyAttack(s, id, r, c)` (advances turn / may
      set `winner`).
  - An Assassin never evolves (it is not a Soldier), so no evolution branch.
- **Range attack in place (AS, AR, AT, MG):** for each cell in
  `getAttacks(piece)`, produce one action via `applyAttack(state, id, r, c)`.
  The piece does not move, so no warp/evolution follows.

Note: an Assassin can also "attack 1 cell without moving" — this is covered by
the range-attack-in-place branch (`getAttacks` on the unmoved Assassin).

### `src/ai/evaluate.ts` — static evaluation

```ts
export function evaluate(state: GameState, player: Player): number;
```

Score from `player`'s perspective (positive = good for `player`):

- **Terminal:** if `state.winner === player` return `+Infinity`; if the other
  player won return `-Infinity`. (This already captures the throne-win, since
  `applyMove` sets `winner` when a King reaches the empty throne.)
- **Material:** sum of unit values for `player` minus values for the opponent.
  Approximate values (tunable constant table): `KI` large (e.g. 1000 — losing
  it is loss, but included for consistency), `MG` 9, `KN` 6, `AR`/`AT` 5, `AS`
  4, `GA` 3, `SD` 2. An evolved Soldier is scored by its **current** `type`, so
  evolution shows up as a material gain automatically.
- **Throne race (new):** because a King can win by reaching the empty throne,
  add a small weight × (enemy-King distance-to-empty-throne − own-King
  distance-to-empty-throne), using Chebyshev distance and applied only while
  the throne is unoccupied. This nudges the King toward a throne win without
  overriding material.
- **Dwell risk (new, small):** a small penalty for each of `player`'s own
  non-King pieces sitting on the throne with a high `throneTurns` (close to the
  3-turn eviction), so the AI doesn't strand a valuable piece there to be
  auto-killed.
- **Mobility:** small weight × (count of `player`'s legal moves − opponent's),
  approximated by summing `getMoves` lengths to stay cheap.
- **King safety:** small penalty when the player's King has enemy attackers
  adjacent / in range; bonus for the opposite on the enemy King.

Weights live in a small constant table at the top of the file for easy tuning.

### `src/ai/ai.ts` — the search

```ts
export const AI_DEPTH = 2;
export function chooseAction(state: GameState, aiPlayer: Player, depth?: number): Action | null;
```

Fixed-perspective minimax with alpha-beta pruning over `legalActions`:

- Base case: `depth === 0` or terminal → return `evaluate` (always from the
  AI's perspective).
- Recurse on each action's `next` state; the node maximizes when
  `state.turn === aiPlayer` and minimizes otherwise. **Not** negamax: because
  the engine leaves `turn` unflipped on a winning move (`applyMove` returns
  early once `winner` is set), a naive negamax negation would mis-sign winning
  terminals — so the perspective is fixed and max/min is chosen by whose turn
  it is.
- **Move ordering:** evaluate capturing/attacking/winning actions first (cheap
  proxy: actions whose `next` has `winner` set, or fewer opponent pieces) to
  maximize pruning.
- Returns the top-level `Action` with the best score, or `null` if the player
  has no legal actions (stuck — treated as a pass/loss; not expected in normal
  play but handled defensively).
- `AI_DEPTH = 2` (Red's move + Blue's best reply). A single exported constant so
  it's trivial to bump to 3 for stronger play. Note the branching factor now
  includes warp (up to +3 variants per warp-landing move) and evolution (×7 for
  a Soldier reaching the throne); depth 2 stays comfortably fast, but this is
  why the constant is centralized.

## UI Integration (`src/components/Board.tsx`)

- Add a `useEffect` keyed on `state`: when `state.turn === 1` (Red = AI) and
  `state.winner === null`, schedule the AI turn.
- Use a short `setTimeout` (e.g. 300 ms) so React paints the "Red's turn" /
  "Red is thinking…" text before the (synchronous) search runs, and so a human
  click isn't immediately followed by a frozen frame. Clear the timeout on
  cleanup to avoid double-applies (React 19 strict-mode double effect).
- On completion, `setState(action.next)` (or leave state unchanged if `null`).
  `action.next` is already fully resolved (warp/evolution/bonus-attack applied,
  turn advanced), so the AI never enters the human warp/evolution/bonus phases.
- The AI effect must not fire while the human is mid-phase: it is gated on
  `state.turn === 1`, and the human's move/warp/evolution/bonus phases all keep
  `state.turn === 0` until resolved, so the effect stays dormant during them.
- Human clicks are already gated on `state.turn`, so Red pieces can't be moved
  by the human.
- Optional: change the turn banner to show "Red is thinking…" while the AI runs
  (a small local `thinking` boolean).

## Testing (Vitest)

Vitest is already configured (added by the missing-rules feature: the `test`
script runs `vitest run` in a Node environment). The AI tests reuse it — no new
setup.

Test files:

- `src/ai/actions.test.ts`
  - a simple constructed position yields the expected set of actions for a
    non-Assassin piece;
  - an Assassin adjacent to an enemy produces both a move-only and a
    move+bonus-attack action, and an attack-in-place action;
  - **warp:** a unit whose only move lands it on a warp cell (with one empty
    other warp) yields both a stay action and a teleport action;
  - **evolution:** a Soldier one step from the empty throne, with no living
    evolved unit for its player, yields one action per non-King type (all with
    the Soldier now on the throne and the chosen `type`/`evolved`);
  - a move that captures the enemy King, and a King move onto the empty throne,
    each yield an action with `next.winner` set.
- `src/ai/evaluate.test.ts`
  - a position where `player` has captured material scores positive;
  - `winner === player` returns `+Infinity`; opponent win returns `-Infinity`;
  - with the throne empty, the same material but a King closer to the throne
    scores higher (throne-race term).
- `src/ai/ai.test.ts`
  - **mate-in-one (capture):** a position where Red can capture the Blue King in
    one turn → `chooseAction` returns that action (`next.winner === 1`);
  - **mate-in-one (throne):** Red's King one step from the empty throne →
    `chooseAction` moves it onto the throne (`next.winner === 1`);
  - **obvious capture:** Red prefers a free capture over a non-capturing move;
  - returns `null` (or handled) when no legal actions exist.

## File Change Summary

- **New:** `src/ai/actions.ts`, `src/ai/evaluate.ts`, `src/ai/ai.ts`
- **New:** `src/ai/actions.test.ts`, `src/ai/evaluate.test.ts`, `src/ai/ai.test.ts`
- **Edit:** `src/components/Board.tsx` (AI-turn effect + optional "thinking" banner)
- **Unchanged:** `src/game.ts` (engine reused as-is — including the new
  rule helpers), `package.json`/Vitest config (already set up).
