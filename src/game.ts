export type UnitType = 'KI' | 'GA' | 'AS' | 'KN' | 'AR' | 'AT' | 'MG' | 'SD';
export type Player = 0 | 1;

export interface Piece {
  id: number;
  type: UnitType;
  player: Player;
  row: number;
  col: number;
  revealed?: boolean; // AS only: undefined/false = hidden, true = revealed
  evolved?: boolean;  // true if this piece is an evolved Soldier
  startRow: number;   // spawn cell, for throne-dwell auto-return
  startCol: number;
  throneTurns?: number; // owner-turns spent continuously on the throne
}

export interface GameState {
  pieces: Piece[];
  turn: Player;
  winner: Player | null;
}

export type Cell = { row: number; col: number };

// Orthogonal cell-pairs that a wall sits between. Mirrors drawWalls in Board.tsx.
const WALL_EDGES: [Cell, Cell][] = [
  // top-left block
  [{ row: 7, col: 8 }, { row: 7, col: 9 }], [{ row: 8, col: 8 }, { row: 8, col: 9 }],
  [{ row: 8, col: 7 }, { row: 9, col: 7 }], [{ row: 8, col: 8 }, { row: 9, col: 8 }],
  // top-right block
  [{ row: 7, col: 9 }, { row: 7, col: 10 }], [{ row: 8, col: 9 }, { row: 8, col: 10 }],
  [{ row: 8, col: 10 }, { row: 9, col: 10 }], [{ row: 8, col: 11 }, { row: 9, col: 11 }],
  // bottom-left block
  [{ row: 10, col: 8 }, { row: 10, col: 9 }], [{ row: 11, col: 8 }, { row: 11, col: 9 }],
  [{ row: 9, col: 7 }, { row: 10, col: 7 }], [{ row: 9, col: 8 }, { row: 10, col: 8 }],
  // bottom-right block
  [{ row: 10, col: 9 }, { row: 10, col: 10 }], [{ row: 11, col: 9 }, { row: 11, col: 10 }],
  [{ row: 9, col: 10 }, { row: 10, col: 10 }], [{ row: 9, col: 11 }, { row: 10, col: 11 }],
];

function edgeKey(a: Cell, b: Cell): string {
  const ka = `${a.row},${a.col}`, kb = `${b.row},${b.col}`;
  return ka < kb ? `${ka}-${kb}` : `${kb}-${ka}`;
}

const WALLS = new Set(WALL_EDGES.map(([a, b]) => edgeKey(a, b)));

function blockedOrthogonal(a: Cell, b: Cell): boolean {
  return WALLS.has(edgeKey(a, b));
}

// A diagonal step is blocked if a wall sits on any of the orthogonal edges
// meeting at the shared corner (seals diagonal entry to the palace).
function blockedDiagonal(a: Cell, b: Cell): boolean {
  const c1: Cell = { row: a.row, col: b.col };
  const c2: Cell = { row: b.row, col: a.col };
  return (
    blockedOrthogonal(a, c1) || blockedOrthogonal(a, c2) ||
    blockedOrthogonal(b, c1) || blockedOrthogonal(b, c2)
  );
}

export function canCross(from: Cell, to: Cell, ignoreWalls: boolean): boolean {
  if (ignoreWalls) return true;
  const dr = Math.abs(from.row - to.row), dc = Math.abs(from.col - to.col);
  if (dr + dc === 1) return !blockedOrthogonal(from, to);
  if (dr === 1 && dc === 1) return !blockedDiagonal(from, to);
  return true; // non-adjacent: callers step one cell at a time
}

const SIZE = 19;

export function isPlayable(r: number, c: number): boolean {
  if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return false;
  if ((r <= 2 || r >= 16) && (c <= 2 || c >= 16)) return false;
  const topOrBottom = r <= 2 || r >= 16;
  const leftOrRight = c <= 2 || c >= 16;
  if (topOrBottom && ((c >= 3 && c <= 5) || (c >= 13 && c <= 15))) return false;
  if (leftOrRight && ((r >= 3 && r <= 5) || (r >= 13 && r <= 15))) return false;
  return true;
}

// Unrevealed assassins cannot be targeted
function isTargetable(p: Piece): boolean {
  return p.type !== 'AS' || !!p.revealed;
}

// Reveal assassins that are within 2 cells (Chebyshev) of an enemy Guard
function checkAssassinReveal(pieces: Piece[]): Piece[] {
  const guards = pieces.filter(p => p.type === 'GA');
  return pieces.map(p => {
    if (p.type !== 'AS' || p.revealed) return p;
    const nearEnemyGuard = guards.some(g =>
      g.player !== p.player &&
      Math.max(Math.abs(g.row - p.row), Math.abs(g.col - p.col)) <= 2
    );
    return nearEnemyGuard ? { ...p, revealed: true } : p;
  });
}

export function initialState(): GameState {
  let id = 0;
  const mk = (type: UnitType, player: Player, row: number, col: number): Piece =>
    ({ id: id++, type, player, row, col, startRow: row, startCol: col });

  const pieces: Piece[] = [
    // Player 0 — bottom
    mk('KI', 0, 18, 9),
    mk('GA', 0, 18, 8), mk('GA', 0, 18, 10),
    mk('AS', 0, 18, 7), mk('AS', 0, 18, 11),
    mk('KN', 0, 18, 6), mk('KN', 0, 18, 12),
    mk('AR', 0, 17, 6), mk('AR', 0, 17, 8), mk('AR', 0, 17, 10), mk('AR', 0, 17, 12),
    mk('AT', 0, 17, 7), mk('AT', 0, 17, 11),
    mk('MG', 0, 17, 9),
    mk('SD', 0, 16, 6), mk('SD', 0, 16, 7), mk('SD', 0, 16, 8),
    mk('SD', 0, 16, 9), mk('SD', 0, 16, 10), mk('SD', 0, 16, 11), mk('SD', 0, 16, 12),

    // Player 1 — top
    mk('KI', 1, 0, 9),
    mk('GA', 1, 0, 8), mk('GA', 1, 0, 10),
    mk('AS', 1, 0, 7), mk('AS', 1, 0, 11),
    mk('KN', 1, 0, 6), mk('KN', 1, 0, 12),
    mk('AR', 1, 1, 6), mk('AR', 1, 1, 8), mk('AR', 1, 1, 10), mk('AR', 1, 1, 12),
    mk('AT', 1, 1, 7), mk('AT', 1, 1, 11),
    mk('MG', 1, 1, 9),
    mk('SD', 1, 2, 6), mk('SD', 1, 2, 7), mk('SD', 1, 2, 8),
    mk('SD', 1, 2, 9), mk('SD', 1, 2, 10), mk('SD', 1, 2, 11), mk('SD', 1, 2, 12),
  ];

  return { pieces, turn: 0, winner: null };
}

const THRONE_ROW = 9;
const THRONE_COL = 9;

const DIRS8: Cell[] = [
  { row: -1, col: -1 }, { row: -1, col: 0 }, { row: -1, col: 1 },
  { row:  0, col: -1 },                       { row:  0, col: 1 },
  { row:  1, col: -1 }, { row:  1, col: 0 }, { row:  1, col: 1 },
];
const DIRS4: Cell[] = [
  { row: -1, col: 0 }, { row: 1, col: 0 }, { row: 0, col: -1 }, { row: 0, col: 1 },
];
const PERPENDICULARS: Record<string, Cell[]> = {
  '-1,0': [{ row: 0, col: -1 }, { row: 0, col: 1 }],
  '1,0':  [{ row: 0, col: -1 }, { row: 0, col: 1 }],
  '0,1':  [{ row: -1, col: 0 }, { row: 1, col: 0 }],
  '0,-1': [{ row: -1, col: 0 }, { row: 1, col: 0 }],
};

export function getMoves(piece: Piece, pieces: Piece[]): Cell[] {
  const occupied = new Map(pieces.map(p => [`${p.row},${p.col}`, p]));
  const empty = (r: number, c: number) => isPlayable(r, c) && !occupied.has(`${r},${c}`);
  const meleeOk = (r: number, c: number) => {
    if (!isPlayable(r, c)) return false;
    const hit = occupied.get(`${r},${c}`);
    return !hit || (hit.player !== piece.player && isTargetable(hit));
  };

  const results: Cell[] = [];

  switch (piece.type) {
    case 'KI':
      for (const d of DIRS8) {
        const r = piece.row + d.row, c = piece.col + d.col;
        if (!canCross({ row: piece.row, col: piece.col }, { row: r, col: c }, false)) continue;
        if (r === THRONE_ROW && c === THRONE_COL) {
          if (!occupied.has(`${r},${c}`)) results.push({ row: r, col: c }); // empty throne only
          continue;
        }
        if (meleeOk(r, c)) results.push({ row: r, col: c });
      }
      break;

    case 'GA': case 'SD': case 'AR':
      for (const d of DIRS8) {
        const r = piece.row + d.row, c = piece.col + d.col;
        if (!canCross({ row: piece.row, col: piece.col }, { row: r, col: c }, false)) continue;
        if (meleeOk(r, c)) results.push({ row: r, col: c });
      }
      break;

    case 'AS':
      // Moves to empty cells only (attacks separately)
      for (const d of DIRS8) {
        let prev = { row: piece.row, col: piece.col };
        for (let s = 1; s <= 2; s++) {
          const r = piece.row + d.row * s, c = piece.col + d.col * s;
          if (!canCross(prev, { row: r, col: c }, false)) break;
          if (!isPlayable(r, c)) break;
          if (occupied.has(`${r},${c}`)) break;
          results.push({ row: r, col: c });
          prev = { row: r, col: c };
        }
      }
      break;

    case 'MG':
      // 1-2 steps, 8 dirs, can fly over 1 unit
      for (const d of DIRS8) {
        let skipped = false;
        let prev = { row: piece.row, col: piece.col };
        for (let s = 1; s <= 2; s++) {
          const r = piece.row + d.row * s, c = piece.col + d.col * s;
          if (!canCross(prev, { row: r, col: c }, false)) break;
          if (!isPlayable(r, c)) break;
          if (occupied.has(`${r},${c}`)) {
            if (!skipped) { skipped = true; prev = { row: r, col: c }; continue; } // fly over one unit
            break;
          }
          results.push({ row: r, col: c });
          prev = { row: r, col: c };
        }
      }
      break;

    case 'KN': {
      // Up to 4 steps total, can turn 90° once, can jump over max 2 units
      const seen = new Set<string>();

      const tryPath = (steps: Cell[]) => {
        let jumps = 0;
        let r = piece.row, c = piece.col;
        for (let i = 0; i < steps.length; i++) {
          r += steps[i].row;
          c += steps[i].col;
          if (!canCross({ row: r - steps[i].row, col: c - steps[i].col }, { row: r, col: c }, false)) return;
          if (!isPlayable(r, c)) return;
          const isLast = i === steps.length - 1;
          const hit = occupied.get(`${r},${c}`);
          if (hit) {
            if (isLast) {
              if (hit.player !== piece.player && isTargetable(hit)) {
                const key = `${r},${c}`;
                if (!seen.has(key)) { seen.add(key); results.push({ row: r, col: c }); }
              }
              return;
            }
            jumps++;
            if (jumps > 2) return;
          } else if (isLast) {
            const key = `${r},${c}`;
            if (!seen.has(key)) { seen.add(key); results.push({ row: r, col: c }); }
          }
        }
      };

      // Straight paths (1-4 steps)
      for (const d of DIRS4) {
        for (let len = 1; len <= 4; len++) {
          tryPath(Array.from({ length: len }, () => d));
        }
      }

      // L-shaped paths: a steps in d1, then b steps in perpendicular d2
      for (const d1 of DIRS4) {
        const turnDirs = PERPENDICULARS[`${d1.row},${d1.col}`];
        for (const d2 of turnDirs) {
          for (let a = 1; a <= 3; a++) {
            for (let b = 1; b <= 4 - a; b++) {
              tryPath([
                ...Array.from({ length: a }, () => d1),
                ...Array.from({ length: b }, () => d2),
              ]);
            }
          }
        }
      }
      break;
    }

    case 'AT':
      for (const d of DIRS4) {
        const r = piece.row + d.row, c = piece.col + d.col;
        if (!canCross({ row: piece.row, col: piece.col }, { row: r, col: c }, false)) continue;
        if (empty(r, c)) results.push({ row: r, col: c });
      }
      break;
  }

  return results;
}

function onThrone(piece: Piece): boolean {
  return piece.row === THRONE_ROW && piece.col === THRONE_COL;
}

export function getAttacks(piece: Piece, pieces: Piece[]): Cell[] {
  const occupied = new Map(pieces.map(p => [`${p.row},${p.col}`, p]));
  const isEnemy = (r: number, c: number) => {
    const p = occupied.get(`${r},${c}`);
    return p !== undefined && p.player !== piece.player && isTargetable(p);
  };

  const throne = onThrone(piece);
  const ignoreWalls = onThrone(piece);
  const results: Cell[] = [];

  switch (piece.type) {
    case 'AS': {
      const maxRange = throne ? 2 : 1;
      for (const d of DIRS8) {
        let prev = { row: piece.row, col: piece.col };
        for (let s = 1; s <= maxRange; s++) {
          const r = piece.row + d.row * s, c = piece.col + d.col * s;
          if (!canCross(prev, { row: r, col: c }, ignoreWalls)) break;
          if (!isPlayable(r, c)) break;
          if (occupied.has(`${r},${c}`)) {
            if (isEnemy(r, c)) results.push({ row: r, col: c });
            break;
          }
          prev = { row: r, col: c };
        }
      }
      break;
    }

    case 'AR': {
      const maxRange = throne ? 3 : 2;
      for (const d of DIRS8) {
        let prev = { row: piece.row, col: piece.col };
        for (let s = 1; s <= maxRange; s++) {
          const r = piece.row + d.row * s, c = piece.col + d.col * s;
          if (!canCross(prev, { row: r, col: c }, ignoreWalls)) break;
          if (!isPlayable(r, c)) break;
          if (occupied.has(`${r},${c}`)) {
            if (isEnemy(r, c)) results.push({ row: r, col: c });
            break;
          }
          prev = { row: r, col: c };
        }
      }
      break;
    }

    case 'MG': {
      const maxRange = throne ? 4 : 3;
      for (const d of DIRS8) {
        let prev = { row: piece.row, col: piece.col };
        for (let s = 1; s <= maxRange; s++) {
          const r = piece.row + d.row * s, c = piece.col + d.col * s;
          if (!canCross(prev, { row: r, col: c }, ignoreWalls)) break;
          if (!isPlayable(r, c)) break;
          if (occupied.has(`${r},${c}`)) {
            if (isEnemy(r, c)) results.push({ row: r, col: c });
            break;
          }
          prev = { row: r, col: c };
        }
      }
      break;
    }

    case 'AT': {
      const maxRange = throne ? 5 : 4;
      for (const d of DIRS4) {
        const r1 = piece.row + d.row, c1 = piece.col + d.col;
        if (!canCross({ row: piece.row, col: piece.col }, { row: r1, col: c1 }, ignoreWalls)) continue;
        if (!isPlayable(r1, c1) || occupied.has(`${r1},${c1}`)) continue;
        let prev = { row: r1, col: c1 };
        for (let s = 2; s <= maxRange; s++) {
          const r = piece.row + d.row * s, c = piece.col + d.col * s;
          if (!canCross(prev, { row: r, col: c }, ignoreWalls)) break;
          if (!isPlayable(r, c)) break;
          if (occupied.has(`${r},${c}`)) {
            if (isEnemy(r, c)) results.push({ row: r, col: c });
            break;
          }
          prev = { row: r, col: c };
        }
      }
      break;
    }
  }

  return results;
}

export function advanceTurn(state: GameState): GameState {
  return { ...state, turn: state.turn === 0 ? 1 : 0 };
}

export function applyMove(
  state: GameState,
  pieceId: number,
  row: number,
  col: number,
  skipTurnAdvance = false,
): GameState {
  const moving = state.pieces.find(p => p.id === pieceId)!;
  const target = state.pieces.find(p => p.row === row && p.col === col && p.id !== pieceId);

  // Assassin is revealed when it kills a unit by moving onto it
  const movedPiece: Piece = {
    ...moving,
    row,
    col,
    ...(moving.type === 'AS' && target ? { revealed: true } : {}),
  };

  let pieces = state.pieces
    .filter(p => p.id !== pieceId && p.id !== target?.id)
    .concat(movedPiece);

  pieces = checkAssassinReveal(pieces);

  const enteredThrone = moving.type === 'KI' && row === THRONE_ROW && col === THRONE_COL;
  const winner: Player | null =
    target?.type === 'KI' ? moving.player
    : enteredThrone ? moving.player
    : null;
  const turn: Player = (winner !== null || skipTurnAdvance)
    ? state.turn
    : (state.turn === 0 ? 1 : 0);

  return { pieces, turn, winner };
}

export function applyAttack(state: GameState, pieceId: number, row: number, col: number): GameState {
  const attacker = state.pieces.find(p => p.id === pieceId)!;
  const target = state.pieces.find(p => p.row === row && p.col === col)!;

  // Assassin is revealed when it attacks
  let pieces = state.pieces
    .filter(p => p.id !== target.id)
    .map(p => p.id === pieceId && p.type === 'AS' ? { ...p, revealed: true } : p);

  pieces = checkAssassinReveal(pieces);

  const winner: Player | null = target.type === 'KI' ? attacker.player : null;
  const turn: Player = winner !== null ? state.turn : (state.turn === 0 ? 1 : 0);

  return { pieces, turn, winner };
}

const WARP_CELLS: Cell[] = [
  { row: 4, col: 4 }, { row: 4, col: 14 }, { row: 14, col: 4 }, { row: 14, col: 14 },
];

export function getWarpDestinations(state: GameState, pieceId: number): Cell[] {
  const p = state.pieces.find(x => x.id === pieceId)!;
  const onWarp = WARP_CELLS.some(w => w.row === p.row && w.col === p.col);
  if (!onWarp) return [];
  const occupied = new Set(state.pieces.map(x => `${x.row},${x.col}`));
  return WARP_CELLS.filter(w =>
    !(w.row === p.row && w.col === p.col) && !occupied.has(`${w.row},${w.col}`),
  );
}

export function applyWarp(state: GameState, pieceId: number, row: number, col: number): GameState {
  return {
    ...state,
    pieces: state.pieces.map(p => (p.id === pieceId ? { ...p, row, col } : p)),
  };
}

export function canEvolve(state: GameState, pieceId: number): boolean {
  const p = state.pieces.find(x => x.id === pieceId)!;
  if (p.type !== 'SD' || p.row !== THRONE_ROW || p.col !== THRONE_COL) return false;
  const hasEvolved = state.pieces.some(x => x.player === p.player && x.evolved);
  return !hasEvolved;
}

export function applyEvolution(state: GameState, pieceId: number, type: UnitType): GameState {
  return {
    ...state,
    pieces: state.pieces.map(p => (p.id === pieceId ? { ...p, type, evolved: true } : p)),
  };
}
