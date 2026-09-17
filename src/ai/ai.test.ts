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
