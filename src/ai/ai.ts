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
