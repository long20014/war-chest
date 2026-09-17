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
