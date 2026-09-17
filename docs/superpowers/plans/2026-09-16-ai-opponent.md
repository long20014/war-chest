# Minimax AI Opponent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Minimax + alpha-beta AI that plays Red (Player 1) against the human's Blue (Player 0), reusing the existing pure engine.

**Architecture:** Three UI-independent pure modules under `src/ai/` — `actions.ts` (enumerate every complete legal turn, including warp/evolution/assassin-bonus choices), `evaluate.ts` (static position score), `ai.ts` (fixed-perspective minimax with alpha-beta) — plus a `useEffect` in `Board.tsx` that runs the search on Red's turn and applies the chosen fully-resolved state.

**Tech Stack:** TypeScript (strict), React 19, Vite, Vitest (already configured — `npm test` runs `vitest run`).

**Spec:** docs/superpowers/specs/2026-09-16-ai-opponent-design.md

## Global Constraints

- **No engine changes.** `src/game.ts` is reused as-is. The AI builds turns only by calling exported engine functions, so walls, throne-win, and the throne-dwell timer are enforced for free.
- **Pure modules.** Everything in `src/ai/` is pure and DOM-free; only `Board.tsx` touches React.
- **Player-parametric.** Functions take a `Player` argument; the AI is wired as Red (Player 1) only at the `Board.tsx` call site.
- **Enumerate all evolution types.** When a Soldier can evolve, `legalActions` emits one action per non-King type (user decision).
- **Engine interfaces (exact signatures — do not guess):**
  - Types: `UnitType = 'KI'|'GA'|'AS'|'KN'|'AR'|'AT'|'MG'|'SD'`, `Player = 0|1`, `Cell = { row: number; col: number }`, `Piece { id; type; player; row; col; revealed?; evolved?; startRow; startCol; throneTurns? }`, `GameState { pieces: Piece[]; turn: Player; winner: Player | null }`.
  - `getMoves(piece: Piece, pieces: Piece[]): Cell[]` and `getAttacks(piece: Piece, pieces: Piece[]): Cell[]` — note they take **(piece, pieces)**, not (state, id).
  - `applyMove(state, pieceId, row, col, skipTurnAdvance=false): GameState` — sets `winner` on King-capture or King-onto-empty-throne; when `winner !== null` or `skipTurnAdvance`, returns WITHOUT flipping `turn`.
  - `applyAttack(state, pieceId, row, col): GameState` — advances turn unless `winner` set.
  - `advanceTurn(state): GameState` — flips turn and runs the dwell timer.
  - `getWarpDestinations(state, pieceId): Cell[]`, `applyWarp(state, pieceId, row, col): GameState`.
  - `canEvolve(state, pieceId): boolean`, `applyEvolution(state, pieceId, type: UnitType): GameState`.
  - Throne cell is `(9,9)`; warp cells are `(4,4),(4,14),(14,4),(14,14)`.

---

### Task 1: `src/ai/actions.ts` — legal turn enumeration

**Files:**
- Create: `src/ai/actions.ts`
- Test: `src/ai/actions.test.ts`

**Interfaces:**
- Consumes: engine `getMoves`, `getAttacks`, `applyMove`, `applyAttack`, `advanceTurn`, `getWarpDestinations`, `applyWarp`, `canEvolve`, `applyEvolution`, and types `GameState`, `Piece`, `Cell`, `UnitType`, `Player`.
- Produces: `export interface Action { desc: string; next: GameState }` and `export function legalActions(state: GameState): Action[]`.

- [ ] **Step 1: Write the failing tests**

Create `src/ai/actions.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import type { GameState, Piece, UnitType, Player } from '../game';
import { getMoves } from '../game';
import { legalActions } from './actions';

let nextId = 1;
function mk(o: {
  type: UnitType; player: Player; row: number; col: number;
  id?: number; revealed?: boolean; evolved?: boolean; throneTurns?: number;
  startRow?: number; startCol?: number;
}): Piece {
  return {
    id: o.id ?? nextId++, type: o.type, player: o.player, row: o.row, col: o.col,
    revealed: o.revealed, evolved: o.evolved, throneTurns: o.throneTurns,
    startRow: o.startRow ?? o.row, startCol: o.startCol ?? o.col,
  };
}

describe('legalActions', () => {
  it('enumerates one advanced-turn action per move for a lone non-Assassin (away from warps/throne)', () => {
    // GA at (7,7): its 8 neighbours are all playable and none is a warp/throne cell.
    const ga = mk({ type: 'GA', player: 0, row: 7, col: 7 });
    const state: GameState = { pieces: [ga], turn: 0, winner: null };
    const moves = getMoves(ga, state.pieces);
    const actions = legalActions(state);
    expect(actions.length).toBe(moves.length);
    expect(actions.every(a => a.next.turn === 1)).toBe(true);
    expect(actions.every(a => a.next.winner === null)).toBe(true);
  });

  it('produces move-only, move+bonus-attack, and attack-in-place actions for an Assassin next to an enemy', () => {
    const as = mk({ type: 'AS', player: 0, row: 7, col: 7, revealed: true });
    const enemy = mk({ type: 'AR', player: 1, row: 7, col: 8 });
    const state: GameState = { pieces: [as, enemy], turn: 0, winner: null };
    const actions = legalActions(state);
    // attack-in-place: assassin attacks the adjacent enemy without moving
    const inPlace = actions.filter(a =>
      a.next.pieces.some(p => p.id === as.id && p.row === 7 && p.col === 7) &&
      !a.next.pieces.some(p => p.id === enemy.id));
    expect(inPlace.length).toBeGreaterThan(0);
    // a move-only action exists (assassin moved to an empty cell, enemy still alive)
    const moveOnly = actions.filter(a =>
      a.next.pieces.some(p => p.id === as.id && !(p.row === 7 && p.col === 7)) &&
      a.next.pieces.some(p => p.id === enemy.id));
    expect(moveOnly.length).toBeGreaterThan(0);
  });

  it('offers both stay and teleport actions when a move lands on a warp cell', () => {
    // GA at (5,4): can step to the warp cell (4,4). Other warps are empty -> teleport offered.
    const ga = mk({ type: 'GA', player: 0, row: 5, col: 4 });
    const state: GameState = { pieces: [ga], turn: 0, winner: null };
    const actions = legalActions(state);
    const landingOnWarp = actions.filter(a =>
      a.next.pieces.some(p => p.id === ga.id && p.row === 4 && p.col === 4));
    const teleported = actions.filter(a =>
      a.next.pieces.some(p => p.id === ga.id &&
        (p.row !== 4 || p.col !== 4) &&
        [[4,4],[4,14],[14,4],[14,14]].some(([r,c]) => p.row === r && p.col === c)));
    expect(landingOnWarp.length).toBeGreaterThan(0); // the "stay on warp" action
    expect(teleported.length).toBeGreaterThan(0);     // at least one teleport action
  });

  it('emits one action per non-King type when a Soldier reaches the empty throne', () => {
    // SD at (8,9) can step south onto the empty throne (9,9); no evolved unit alive.
    const sd = mk({ type: 'SD', player: 0, row: 8, col: 9 });
    const state: GameState = { pieces: [sd], turn: 0, winner: null };
    const actions = legalActions(state);
    const onThrone = actions.filter(a =>
      a.next.pieces.some(p => p.id === sd.id && p.row === 9 && p.col === 9));
    // 7 non-King types: GA, AS, KN, AR, AT, MG, SD
    expect(onThrone.length).toBe(7);
    const types = new Set(onThrone.map(a =>
      a.next.pieces.find(p => p.id === sd.id)!.type));
    expect(types).toEqual(new Set(['GA','AS','KN','AR','AT','MG','SD']));
    expect(onThrone.every(a =>
      a.next.pieces.find(p => p.id === sd.id)!.evolved === true)).toBe(true);
  });

  it('marks a King-capture and a King-onto-empty-throne as winning actions', () => {
    // capture: GA (turn 0) adjacent to enemy King
    const ga = mk({ type: 'GA', player: 0, row: 7, col: 7 });
    const enemyKing = mk({ type: 'KI', player: 1, row: 7, col: 8 });
    const capState: GameState = { pieces: [ga, enemyKing], turn: 0, winner: null };
    expect(legalActions(capState).some(a => a.next.winner === 0)).toBe(true);

    // throne-win: own King steps onto the empty throne
    const king = mk({ type: 'KI', player: 0, row: 8, col: 9 });
    const throneState: GameState = { pieces: [king], turn: 0, winner: null };
    expect(legalActions(throneState).some(a =>
      a.next.winner === 0 &&
      a.next.pieces.some(p => p.id === king.id && p.row === 9 && p.col === 9))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `legalActions` is not exported / module missing.

- [ ] **Step 3: Implement `src/ai/actions.ts`**

```ts
import type { GameState, Cell, UnitType } from '../game';
import {
  getMoves, getAttacks, applyMove, applyAttack, advanceTurn,
  getWarpDestinations, applyWarp, canEvolve, applyEvolution,
} from '../game';

export interface Action {
  desc: string;      // human-readable, for debugging/logging
  next: GameState;   // fully-resolved state after the whole turn (turn advanced, or winner set)
}

const NON_KING_TYPES: UnitType[] = ['GA', 'AS', 'KN', 'AR', 'AT', 'MG', 'SD'];

// Given a non-Assassin move already applied with skipTurnAdvance=true, produce
// every fully-advanced turn it can lead to (warp choices, evolution choices, or plain advance).
function resolveMovedTurn(moved: GameState, id: number, prefix: string): Action[] {
  if (moved.winner !== null) {
    return [{ desc: `${prefix} win`, next: moved }];
  }
  const warps = getWarpDestinations(moved, id);
  if (warps.length > 0) {
    const actions: Action[] = [{ desc: `${prefix} stay`, next: advanceTurn(moved) }];
    for (const w of warps) {
      actions.push({
        desc: `${prefix} warp(${w.row},${w.col})`,
        next: advanceTurn(applyWarp(moved, id, w.row, w.col)),
      });
    }
    return actions;
  }
  if (canEvolve(moved, id)) {
    return NON_KING_TYPES.map(t => ({
      desc: `${prefix} evolve ${t}`,
      next: advanceTurn(applyEvolution(moved, id, t)),
    }));
  }
  return [{ desc: prefix, next: advanceTurn(moved) }];
}

export function legalActions(state: GameState): Action[] {
  const actions: Action[] = [];
  const mine = state.pieces.filter(p => p.player === state.turn);

  for (const piece of mine) {
    const id = piece.id;
    const label = `${piece.type}(${piece.row},${piece.col})`;

    // --- Moves ---
    for (const dest of getMoves(piece, state.pieces)) {
      const moved = applyMove(state, id, dest.row, dest.col, true);
      const movePrefix = `${label}->(${dest.row},${dest.col})`;

      if (piece.type === 'AS') {
        // Assassin: move -> optional warp -> optional bonus attack.
        if (moved.winner !== null) {
          actions.push({ desc: `${movePrefix} win`, next: moved });
          continue;
        }
        const warps = getWarpDestinations(moved, id);
        const places: (Cell | null)[] = warps.length > 0 ? [null, ...warps] : [null];
        for (const place of places) {
          const s = place === null ? moved : applyWarp(moved, id, place.row, place.col);
          const at = place === null ? '' : ` warp(${place.row},${place.col})`;
          // move-(warp-)only
          actions.push({ desc: `${movePrefix}${at}`, next: advanceTurn(s) });
          // bonus attacks from the (post-warp) position
          const asn = s.pieces.find(p => p.id === id)!;
          for (const tgt of getAttacks(asn, s.pieces)) {
            actions.push({
              desc: `${movePrefix}${at} x(${tgt.row},${tgt.col})`,
              next: applyAttack(s, id, tgt.row, tgt.col),
            });
          }
        }
      } else {
        // Non-Assassin: resolve warp/evolution/advance.
        actions.push(...resolveMovedTurn(moved, id, movePrefix));
      }
    }

    // --- Range attack in place (piece does not move) ---
    if (piece.type === 'AS' || piece.type === 'AR' || piece.type === 'AT' || piece.type === 'MG') {
      for (const tgt of getAttacks(piece, state.pieces)) {
        actions.push({
          desc: `${label} x(${tgt.row},${tgt.col})`,
          next: applyAttack(state, id, tgt.row, tgt.col),
        });
      }
    }
  }

  return actions;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS (all existing engine tests stay green too).

- [ ] **Step 5: Commit**

```bash
git add src/ai/actions.ts src/ai/actions.test.ts
git commit -m "feat(ai): enumerate legal turns incl. warp/evolution/assassin choices"
```

---

### Task 2: `src/ai/evaluate.ts` — static evaluation

**Files:**
- Create: `src/ai/evaluate.ts`
- Test: `src/ai/evaluate.test.ts`

**Interfaces:**
- Consumes: engine `getMoves`, types `GameState`, `Player`, `UnitType`.
- Produces: `export function evaluate(state: GameState, player: Player): number` (positive = good for `player`).

- [ ] **Step 1: Write the failing tests**

Create `src/ai/evaluate.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import type { GameState, Piece, UnitType, Player } from '../game';
import { evaluate } from './evaluate';

let nextId = 1;
function mk(o: {
  type: UnitType; player: Player; row: number; col: number;
  id?: number; throneTurns?: number;
}): Piece {
  return {
    id: o.id ?? nextId++, type: o.type, player: o.player, row: o.row, col: o.col,
    startRow: o.row, startCol: o.col, throneTurns: o.throneTurns,
  };
}

describe('evaluate', () => {
  it('scores a material advantage positive for that player', () => {
    // Both kings equidistant from the throne (col 3 vs col 15 -> Chebyshev 6 each),
    // so the throne-race term cancels and material dominates.
    const state: GameState = {
      pieces: [
        mk({ type: 'KI', player: 0, row: 9, col: 3 }),
        mk({ type: 'KI', player: 1, row: 9, col: 15 }),
        mk({ type: 'GA', player: 0, row: 12, col: 6 }), // extra material for player 0
      ],
      turn: 0, winner: null,
    };
    expect(evaluate(state, 0)).toBeGreaterThan(0);
    expect(evaluate(state, 1)).toBeLessThan(0);
  });

  it('returns +Infinity when player has won and -Infinity when the opponent has won', () => {
    const s0: GameState = { pieces: [], turn: 0, winner: 0 };
    expect(evaluate(s0, 0)).toBe(Infinity);
    expect(evaluate(s0, 1)).toBe(-Infinity);
  });

  it('prefers its King closer to the empty throne (throne race)', () => {
    const near: GameState = { pieces: [mk({ type: 'KI', player: 0, row: 10, col: 9 })], turn: 0, winner: null };
    const far: GameState = { pieces: [mk({ type: 'KI', player: 0, row: 12, col: 9 })], turn: 0, winner: null };
    expect(evaluate(near, 0)).toBeGreaterThan(evaluate(far, 0));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `evaluate` not exported / module missing.

- [ ] **Step 3: Implement `src/ai/evaluate.ts`**

```ts
import type { GameState, Player, UnitType } from '../game';
import { getMoves } from '../game';

const VALUE: Record<UnitType, number> = {
  KI: 1000, MG: 9, KN: 6, AR: 5, AT: 5, AS: 4, GA: 3, SD: 2,
};

// Tunable weights.
const W = {
  throneRace: 3,   // per Chebyshev step of King-to-empty-throne (only while throne empty)
  dwellRisk: 2,    // per throneTurns of an own non-King piece sitting on the throne
  mobility: 0.1,   // per (own legal move - opponent legal move)
  kingThreat: 4,   // per enemy piece within Chebyshev 2 of a King
};

const THRONE = { row: 9, col: 9 };
const cheb = (r1: number, c1: number, r2: number, c2: number) =>
  Math.max(Math.abs(r1 - r2), Math.abs(c1 - c2));

export function evaluate(state: GameState, player: Player): number {
  if (state.winner === player) return Infinity;
  if (state.winner !== null) return -Infinity;

  const opp: Player = player === 0 ? 1 : 0;
  let score = 0;

  // Material
  for (const p of state.pieces) {
    score += (p.player === player ? 1 : -1) * VALUE[p.type];
  }

  const myKing = state.pieces.find(p => p.type === 'KI' && p.player === player);
  const oppKing = state.pieces.find(p => p.type === 'KI' && p.player === opp);
  const throneOccupied = state.pieces.some(p => p.row === THRONE.row && p.col === THRONE.col);

  // Throne race (only while the throne is empty): closer own King is better; closer enemy King is worse.
  if (!throneOccupied) {
    if (myKing) score -= W.throneRace * cheb(myKing.row, myKing.col, THRONE.row, THRONE.col);
    if (oppKing) score += W.throneRace * cheb(oppKing.row, oppKing.col, THRONE.row, THRONE.col);
  }

  // Dwell risk: penalize own non-King pieces lingering on the throne (about to be auto-killed).
  for (const p of state.pieces) {
    if (p.player === player && p.type !== 'KI' && p.row === THRONE.row && p.col === THRONE.col) {
      score -= W.dwellRisk * (p.throneTurns ?? 0);
    }
  }

  // Mobility (cheap proxy: sum of getMoves lengths).
  const mob = (pl: Player) =>
    state.pieces.filter(p => p.player === pl)
      .reduce((n, p) => n + getMoves(p, state.pieces).length, 0);
  score += W.mobility * (mob(player) - mob(opp));

  // King safety (approximation): count enemy pieces within Chebyshev 2 of each King.
  if (myKing) {
    const threats = state.pieces.filter(p =>
      p.player === opp && cheb(p.row, p.col, myKing.row, myKing.col) <= 2).length;
    score -= W.kingThreat * threats;
  }
  if (oppKing) {
    const threats = state.pieces.filter(p =>
      p.player === player && cheb(p.row, p.col, oppKing.row, oppKing.col) <= 2).length;
    score += W.kingThreat * threats;
  }

  return score;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ai/evaluate.ts src/ai/evaluate.test.ts
git commit -m "feat(ai): static evaluation (material, throne race, dwell, mobility, king safety)"
```

---

### Task 3: `src/ai/ai.ts` — alpha-beta search

**Files:**
- Create: `src/ai/ai.ts`
- Test: `src/ai/ai.test.ts`

**Interfaces:**
- Consumes: `legalActions` + `Action` from `./actions`, `evaluate` from `./evaluate`, types `GameState`, `Player`.
- Produces: `export const AI_DEPTH = 2` and `export function chooseAction(state: GameState, aiPlayer: Player, depth?: number): Action | null`.

**Design note (do not "fix" to negamax):** use **fixed-perspective minimax** with alpha-beta. `evaluate` is always called from `aiPlayer`'s perspective; whether a node maximizes or minimizes is decided by `state.turn === aiPlayer`. This is deliberate: the engine leaves `turn` unflipped on a winning move (`applyMove` returns early when `winner` is set), which would mis-sign a naive negamax negation at winning terminals.

- [ ] **Step 1: Write the failing tests**

Create `src/ai/ai.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import type { GameState, Piece, UnitType, Player } from '../game';
import { chooseAction } from './ai';

let nextId = 1;
function mk(o: {
  type: UnitType; player: Player; row: number; col: number;
  id?: number; revealed?: boolean;
}): Piece {
  return {
    id: o.id ?? nextId++, type: o.type, player: o.player, row: o.row, col: o.col,
    revealed: o.revealed, startRow: o.row, startCol: o.col,
  };
}

describe('chooseAction', () => {
  it('takes a mate-in-one capture of the enemy King', () => {
    const state: GameState = {
      pieces: [
        mk({ type: 'GA', player: 1, row: 7, col: 8 }),  // Red guard next to Blue King
        mk({ type: 'KI', player: 0, row: 7, col: 7 }),  // Blue King (capturable)
        mk({ type: 'KI', player: 1, row: 1, col: 9 }),  // Red King (safe)
      ],
      turn: 1, winner: null,
    };
    const action = chooseAction(state, 1);
    expect(action).not.toBeNull();
    expect(action!.next.winner).toBe(1);
  });

  it('takes a mate-in-one by moving its King onto the empty throne', () => {
    const state: GameState = {
      pieces: [
        mk({ type: 'KI', player: 1, row: 8, col: 9 }),  // Red King one step north of throne
        mk({ type: 'KI', player: 0, row: 16, col: 9 }), // Blue King far away
      ],
      turn: 1, winner: null,
    };
    const action = chooseAction(state, 1);
    expect(action).not.toBeNull();
    expect(action!.next.winner).toBe(1);
    expect(action!.next.pieces.some(p => p.player === 1 && p.type === 'KI' && p.row === 9 && p.col === 9)).toBe(true);
  });

  it('prefers a free capture over a quiet move', () => {
    const state: GameState = {
      pieces: [
        mk({ type: 'GA', player: 1, row: 7, col: 8 }),  // Red guard next to a free Blue archer
        mk({ type: 'AR', player: 0, row: 7, col: 7 }),  // Blue archer (undefended)
        mk({ type: 'KI', player: 0, row: 16, col: 9 }), // Blue King far/safe
        mk({ type: 'KI', player: 1, row: 1, col: 9 }),  // Red King far/safe
      ],
      turn: 1, winner: null,
    };
    const action = chooseAction(state, 1);
    expect(action).not.toBeNull();
    // the Blue archer should be gone in the chosen line
    expect(action!.next.pieces.some(p => p.type === 'AR' && p.player === 0)).toBe(false);
  });

  it('returns null when the player to move has no pieces (no legal actions)', () => {
    const state: GameState = {
      pieces: [mk({ type: 'KI', player: 0, row: 16, col: 9 })],
      turn: 1, winner: null,
    };
    expect(chooseAction(state, 1)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `chooseAction` not exported / module missing.

- [ ] **Step 3: Implement `src/ai/ai.ts`**

```ts
import type { GameState, Player } from '../game';
import { legalActions, type Action } from './actions';
import { evaluate } from './evaluate';

export const AI_DEPTH = 2;

// Cheap move ordering: winning moves first, then bigger captures, to improve pruning.
function orderActions(state: GameState, actions: Action[]): Action[] {
  const oppOf = state.turn === 0 ? 1 : 0;
  const oppCount = (s: GameState) => s.pieces.filter(p => p.player === oppOf).length;
  const base = oppCount(state);
  const rank = (a: Action): number => {
    const winBonus = a.next.winner === state.turn ? 1e6 : 0;
    const captures = base - oppCount(a.next); // >=0
    return winBonus + captures;
  };
  return [...actions].sort((a, b) => rank(b) - rank(a));
}

// Fixed-perspective minimax with alpha-beta. `me` is the perspective; evaluate is always from `me`.
function search(state: GameState, depth: number, alpha: number, beta: number, me: Player): number {
  if (depth === 0 || state.winner !== null) return evaluate(state, me);
  const actions = legalActions(state);
  if (actions.length === 0) return evaluate(state, me);

  const ordered = orderActions(state, actions);
  if (state.turn === me) {
    let best = -Infinity;
    for (const a of ordered) {
      best = Math.max(best, search(a.next, depth - 1, alpha, beta, me));
      alpha = Math.max(alpha, best);
      if (alpha >= beta) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const a of ordered) {
      best = Math.min(best, search(a.next, depth - 1, alpha, beta, me));
      beta = Math.min(beta, best);
      if (alpha >= beta) break;
    }
    return best;
  }
}

export function chooseAction(state: GameState, aiPlayer: Player, depth: number = AI_DEPTH): Action | null {
  const actions = legalActions(state);
  if (actions.length === 0) return null;

  const ordered = orderActions(state, actions);
  let bestAction = ordered[0];
  let bestScore = -Infinity;
  let alpha = -Infinity;
  const beta = Infinity;
  for (const a of ordered) {
    const score = search(a.next, depth - 1, alpha, beta, aiPlayer);
    if (score > bestScore) { bestScore = score; bestAction = a; }
    alpha = Math.max(alpha, bestScore);
  }
  return bestAction;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ai/ai.ts src/ai/ai.test.ts
git commit -m "feat(ai): fixed-perspective minimax with alpha-beta pruning"
```

---

### Task 4: Wire the AI into `Board.tsx`

**Files:**
- Modify: `src/components/Board.tsx`

**Interfaces:**
- Consumes: `chooseAction`, `AI_DEPTH` from `../ai/ai`.
- Produces: Red's turns are played automatically by the AI.

This task has no unit tests (the board is canvas/React). Verify by build + lint + the manual checklist. The implementer must READ the current `Board.tsx` first and adapt to its actual state variables (`state`/`setState`, `clearSelection`, and the human-phase flags `bonusAttackId`, `warpId`, `evolveId`).

- [ ] **Step 1: Add the import**

Add near the other imports at the top of `Board.tsx`:
```tsx
import { chooseAction } from '../ai/ai';
```

- [ ] **Step 2: Add the AI-turn effect**

Inside the `Board` component, after `clearSelection` is defined and after the existing draw `useEffect`, add:
```tsx
const AI_PLAYER = 1; // Red is the AI
useEffect(() => {
  if (state.winner !== null || state.turn !== AI_PLAYER) return;
  // Defensive: never run mid human-interaction phase (those keep turn === 0 anyway).
  if (bonusAttackId !== null || warpId !== null || evolveId !== null) return;
  const timer = setTimeout(() => {
    const action = chooseAction(state, AI_PLAYER);
    if (action) setState(action.next);
    clearSelection();
  }, 300);
  return () => clearTimeout(timer);
}, [state, clearSelection, bonusAttackId, warpId, evolveId]);
```
(If `warpId`/`evolveId` do not exist in the current file under those names, use the actual warp/evolution phase flags; if the file has none, drop those two from the guard and the deps. Confirm against the file.)

- [ ] **Step 3: Optional "Red is thinking…" banner**

If it is a small change against the existing turn banner, show "Red is thinking…" while `state.turn === AI_PLAYER && state.winner === null`. Skip if it complicates the existing banner logic — it is cosmetic.

- [ ] **Step 4: Verify build and lint**

Run: `npm run build`  → Expected: no TypeScript errors.
Run: `npm run lint`   → Expected: no new lint errors (report any pre-existing ones you did not introduce).
Run: `npm test`       → Expected: all AI + engine tests still green.

- [ ] **Step 5: Manual verification (dev server)**

Run `npm run dev`, play as Blue, and confirm:
- After Blue moves, Red moves on its own within ~1s.
- Red captures free pieces, avoids obvious blunders, and will win by capturing the Blue King or reaching the empty throne when it can.
- Red never controls Blue pieces; the human's warp/evolution/assassin phases still work on Blue's turn.
- The game ends and shows the winner overlay when either win condition is met.

- [ ] **Step 6: Commit**

```bash
git add src/components/Board.tsx
git commit -m "feat(ai): play Red automatically via minimax on its turn"
```

---

## Notes for the executor

- `npm test` must stay green after every task (it runs the engine suite plus the new AI suites).
- Tasks 1-3 are pure logic and fully TDD. Task 4 is UI — verified by build + lint + the manual checklist.
- Do not modify `src/game.ts`. If a test seems to need an engine change, stop and flag it — the engine is intentionally frozen for this plan.
