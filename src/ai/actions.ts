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
