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
