# Design: Minimax AI Opponent

**Date:** 2026-09-16
**Status:** Approved for planning

## Goal

Add an AI opponent so a human can play against the computer. The AI always
controls **Red (Player 1)**; the human plays **Blue (Player 0)**. The AI uses
minimax search with alpha-beta pruning.

## Context

- The game engine ([src/game.ts](../../../src/game.ts)) is a set of pure
  functions over an immutable `GameState`: `getMoves`, `getAttacks`,
  `applyMove`, `applyAttack`, `advanceTurn`, `initialState`.
- All turn/selection state lives in React state in
  [src/components/Board.tsx](../../../src/components/Board.tsx).
- The only implemented win condition is **capturing the enemy King**
  (`applyMove`/`applyAttack` set `winner` when the target is `'KI'`). Throne-win,
  warps, walls, and Soldier evolution from the rules doc are **not** wired into
  the engine, so the AI ignores them too.
- Hidden information: unrevealed Assassins are non-targetable. The engine
  enforces this via `isTargetable`.

## Non-Goals

- No probabilistic modeling of hidden Assassins — the AI searches the visible
  state (perfect-information search); unrevealed enemy Assassins simply appear
  as non-targetable, which the engine already handles.
- No changes to game rules, the board renderer, or existing win/overlay logic.
- No difficulty selector or side selector — Red is always the AI.
- No AI-vs-AI mode.

## Architecture

A new UI-independent module directory `src/ai/` with three focused files:

### `src/ai/actions.ts` — the turn model

```ts
export interface Action {
  desc: string;        // human-readable, e.g. "KN e2->e4 x AR"
  next: GameState;     // resulting state after the FULL turn, turn advanced
}

export function legalActions(state: GameState): Action[];
```

`legalActions` enumerates every complete legal turn for `state.turn`'s player,
each with the fully-resolved resulting `GameState` (turn already advanced or
`winner` set). It is the single place that flattens the interactive Assassin
"move, then optionally bonus-attack" into discrete atomic turns. It reuses the
engine functions — **no rule logic is duplicated**.

Enumeration per own piece:

- **Non-Assassin move / capture:** for each cell in `getMoves(piece)`, produce
  one action via `applyMove(state, id, r, c)` (advances turn / sets winner).
- **Assassin move:** for each cell in `getMoves(piece)` (moves onto empty cells
  only), apply `applyMove(state, id, r, c, /*skipTurnAdvance*/ true)`, then:
  - produce a **move-only** action = `advanceTurn(movedState)`.
  - for each cell in `getAttacks(movedAssassin, movedState.pieces)`, produce a
    **move + bonus-attack** action = `applyAttack(movedState, id, r, c)`.
- **Range attack in place (AS, AR, AT, MG):** for each cell in
  `getAttacks(piece)`, produce one action via `applyAttack(state, id, r, c)`.

Note: an Assassin can also "attack 1 cell without moving" — this is covered by
the range-attack-in-place branch (`getAttacks` on the unmoved Assassin).

### `src/ai/evaluate.ts` — static evaluation

```ts
export function evaluate(state: GameState, player: Player): number;
```

Score from `player`'s perspective (positive = good for `player`):

- **Terminal:** if `state.winner === player` return `+Infinity`; if the other
  player won return `-Infinity`.
- **Material:** sum of unit values for `player` minus values for the opponent.
  Approximate values (tunable constant table): `KI` large (e.g. 1000 — losing
  it is loss, but included for consistency), `MG` 9, `KN` 6, `AR`/`AT` 5, `AS`
  4, `GA` 3, `SD` 2.
- **Mobility:** small weight × (count of `player`'s legal actions − opponent's),
  approximated by summing `getMoves` lengths to stay cheap.
- **King safety:** small penalty when the player's King has enemy attackers
  adjacent / in range; bonus for the opposite on the enemy King.

Weights live in a small constant table at the top of the file for easy tuning.

### `src/ai/ai.ts` — the search

```ts
export const AI_DEPTH = 2;
export function chooseAction(state: GameState, aiPlayer: Player, depth?: number): Action | null;
```

Negamax with alpha-beta pruning over `legalActions`:

- Base case: `depth === 0` or terminal → return `evaluate`.
- Recurse on each action's `next` state, negating child scores.
- **Move ordering:** evaluate capturing/attacking actions first (cheap proxy:
  actions whose `next` has fewer opponent pieces, or `winner` set) to maximize
  pruning.
- Returns the top-level `Action` with the best score, or `null` if the player
  has no legal actions (stuck — treated as a pass/loss; not expected in normal
  play but handled defensively).
- `AI_DEPTH = 2` (Red's move + Blue's best reply). A single exported constant so
  it's trivial to bump to 3 for stronger play.

## UI Integration (`src/components/Board.tsx`)

- Add a `useEffect` keyed on `state`: when `state.turn === 1` (Red = AI) and
  `state.winner === null`, schedule the AI turn.
- Use a short `setTimeout` (e.g. 300 ms) so React paints the "Red's turn" /
  "Red is thinking…" text before the (synchronous) search runs, and so a human
  click isn't immediately followed by a frozen frame. Clear the timeout on
  cleanup to avoid double-applies (React 19 strict-mode double effect).
- On completion, `setState(action.next)` (or leave state unchanged if `null`).
- The human's Assassin bonus-attack flow is unaffected: it keeps `turn === 0`
  until resolved, so the AI effect never fires mid-bonus-phase.
- Human clicks are already gated on `state.turn`, so Red pieces can't be moved
  by the human.
- Optional: change the turn banner to show "Red is thinking…" while the AI runs
  (a small local `thinking` boolean).

## Testing (Vitest)

Add Vitest as a dev dependency and a `"test": "vitest run"` script. Configure it
to run in a Node/jsdom-free environment (pure functions, no DOM needed).

Test files:

- `src/ai/actions.test.ts`
  - a simple constructed position yields the expected set of actions for a
    non-Assassin piece;
  - an Assassin adjacent to an enemy produces both a move-only and a
    move+bonus-attack action, and an attack-in-place action;
  - an action that captures the enemy King has `next.winner` set.
- `src/ai/evaluate.test.ts`
  - a position where `player` has captured material scores positive;
  - `winner === player` returns `+Infinity`; opponent win returns `-Infinity`.
- `src/ai/ai.test.ts`
  - **mate-in-one:** a position where Red can capture the Blue King in one turn
    → `chooseAction` returns that action (`next.winner === 1`);
  - **obvious capture:** Red prefers a free capture over a non-capturing move;
  - returns `null` (or handled) when no legal actions exist.

## File Change Summary

- **New:** `src/ai/actions.ts`, `src/ai/evaluate.ts`, `src/ai/ai.ts`
- **New:** `src/ai/actions.test.ts`, `src/ai/evaluate.test.ts`, `src/ai/ai.test.ts`
- **Edit:** `src/components/Board.tsx` (AI-turn effect + optional "thinking" banner)
- **Edit:** `package.json` (add `vitest` devDependency + `test` script)
- **Possibly new:** `vitest.config.ts` (or reuse `vite.config.ts`) if needed.
- **Unchanged:** `src/game.ts` (engine reused as-is).
