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
