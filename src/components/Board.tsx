import { useEffect, useRef, useState, useCallback } from 'react';
import type { GameState, Piece, Cell } from '../game';
import { initialState, getMoves, getAttacks, applyMove, applyAttack, advanceTurn, isPlayable } from '../game';

const SIZE = 19;
const CELL = 32;
const LABEL = 24;
const CANVAS_W = LABEL + SIZE * CELL + 1;
const CANVAS_H = LABEL + SIZE * CELL + 1;

const PLAYER_COLOR = ['#1d4ed8', '#dc2626'] as const;

const WARP_CELLS = new Set(['4,4', '4,14', '14,4', '14,14']);
const THRONE_CELL = '9,9';

function isCornerCell(row: number, col: number): boolean {
  return (row <= 2 || row >= 16) && (col <= 2 || col >= 16);
}

function isRearCell(row: number, col: number): boolean {
  const topOrBottom = row <= 2 || row >= 16;
  const leftOrRight = col <= 2 || col >= 16;
  const nearLeftCol = col >= 3 && col <= 5;
  const nearRightCol = col >= 13 && col <= 15;
  const nearTopRow = row >= 3 && row <= 5;
  const nearBottomRow = row >= 13 && row <= 15;
  return (topOrBottom && (nearLeftCol || nearRightCol)) ||
         (leftOrRight && (nearTopRow || nearBottomRow));
}

function drawWalls(ctx: CanvasRenderingContext2D) {
  const px = (col: number) => LABEL + col * CELL + 0.5;
  const py = (row: number) => LABEL + row * CELL + 0.5;
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };

  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  ctx.lineCap = 'square';

  // Top-left block (rows 7-8, cols 7-8): right + bottom face throne
  line(px(9), py(7), px(9), py(9));
  line(px(7), py(9), px(9), py(9));

  // Top-right block (rows 7-8, cols 10-11): left + bottom face throne
  line(px(10), py(7), px(10), py(9));
  line(px(10), py(9), px(12), py(9));

  // Bottom-left block (rows 10-11, cols 7-8): right + top face throne
  line(px(9), py(10), px(9), py(12));
  line(px(7), py(10), px(9), py(10));

  // Bottom-right block (rows 10-11, cols 10-11): left + top face throne
  line(px(10), py(10), px(10), py(12));
  line(px(10), py(10), px(12), py(10));
}

function drawBoard(ctx: CanvasRenderingContext2D) {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  ctx.fillStyle = '#000000';
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const COLS = Array.from({ length: SIZE }, (_, i) => String.fromCharCode(65 + i));
  COLS.forEach((letter, c) => {
    ctx.fillText(letter, LABEL + c * CELL + CELL / 2, LABEL / 2);
  });

  ctx.textAlign = 'right';
  const ROWS = Array.from({ length: SIZE }, (_, i) => String(i + 1));
  ROWS.forEach((num, r) => {
    ctx.fillText(num, LABEL - 4, LABEL + r * CELL + CELL / 2);
  });

  ctx.lineWidth = 1;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (isCornerCell(r, c) || isRearCell(r, c)) continue;
      const x = LABEL + c * CELL + 0.5;
      const y = LABEL + r * CELL + 0.5;
      const key = `${r},${c}`;
      ctx.fillStyle = key === THRONE_CELL ? '#ffd700'
        : WARP_CELLS.has(key) ? '#000000'
        : (r + c) % 2 === 0 ? '#f0d9b5' : '#b58863';
      ctx.fillRect(x, y, CELL, CELL);
      ctx.strokeStyle = '#000000';
      ctx.strokeRect(x, y, CELL, CELL);
    }
  }
  drawWalls(ctx);
}

function drawHighlights(
  ctx: CanvasRenderingContext2D,
  moves: Cell[],
  attacks: Cell[],
  sel: Piece | undefined,
) {
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = '#22c55e';
  for (const m of moves) {
    ctx.fillRect(LABEL + m.col * CELL + 0.5, LABEL + m.row * CELL + 0.5, CELL, CELL);
  }
  ctx.fillStyle = '#ef4444';
  for (const a of attacks) {
    ctx.fillRect(LABEL + a.col * CELL + 0.5, LABEL + a.row * CELL + 0.5, CELL, CELL);
  }
  ctx.globalAlpha = 1;

  if (sel) {
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2;
    ctx.strokeRect(LABEL + sel.col * CELL + 1.5, LABEL + sel.row * CELL + 1.5, CELL - 2, CELL - 2);
  }
}

function drawPieces(ctx: CanvasRenderingContext2D, pieces: Piece[]) {
  const R = CELL / 2 - 3;
  for (const p of pieces) {
    const x = LABEL + p.col * CELL + CELL / 2;
    const y = LABEL + p.row * CELL + CELL / 2;
    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    // Unrevealed assassin gets yellow border; all others get dark gray
    const hidden = p.type === 'AS' && !p.revealed;
    ctx.strokeStyle = hidden ? '#eab308' : '#374151';
    ctx.lineWidth = hidden ? 2 : 1;
    ctx.stroke();

    ctx.fillStyle = PLAYER_COLOR[p.player];
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.type, x, y);
  }
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sel: Piece | undefined,
  moves: Cell[],
  attacks: Cell[],
) {
  drawBoard(ctx);
  drawHighlights(ctx, moves, attacks, sel);
  drawPieces(ctx, state.pieces);
}

export function Board() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<GameState>(initialState);
  const [selected, setSelected] = useState<number | null>(null);
  const [validMoves, setValidMoves] = useState<Cell[]>([]);
  const [validAttacks, setValidAttacks] = useState<Cell[]>([]);
  // Assassin bonus: pieceId waiting to optionally attack after moving
  const [bonusAttackId, setBonusAttackId] = useState<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const sel = state.pieces.find(p => p.id === (selected ?? bonusAttackId));
    drawScene(ctx, state, sel, validMoves, validAttacks);
  }, [state, selected, validMoves, validAttacks, bonusAttackId]);

  const clearSelection = useCallback(() => {
    setSelected(null); setValidMoves([]); setValidAttacks([]); setBonusAttackId(null);
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (state.winner !== null) return;

    const rect = canvasRef.current!.getBoundingClientRect();
    const col = Math.floor((e.clientX - rect.left - LABEL) / CELL);
    const row = Math.floor((e.clientY - rect.top - LABEL) / CELL);

    if (!isPlayable(row, col)) return;

    // --- Assassin bonus attack phase ---
    if (bonusAttackId !== null) {
      if (validAttacks.some(a => a.row === row && a.col === col)) {
        // Use the attack
        setState(prev => applyAttack(prev, bonusAttackId, row, col));
      } else {
        // Skip bonus attack — advance turn manually
        setState(prev => advanceTurn(prev));
      }
      clearSelection();
      return;
    }

    // --- Normal move destination ---
    if (validMoves.some(m => m.row === row && m.col === col)) {
      const piece = state.pieces.find(p => p.id === selected)!;
      const nextState = applyMove(state, selected!, row, col, piece.type === 'AS');

      if (piece.type === 'AS') {
        // Enter bonus attack phase: assassin moved, now may optionally attack
        const movedPiece = nextState.pieces.find(p => p.id === selected)!;
        const attacks = getAttacks(movedPiece, nextState.pieces);
        setState(nextState);
        setSelected(null);
        setValidMoves([]);
        if (attacks.length > 0) {
          setBonusAttackId(selected);
          setValidAttacks(attacks);
        } else {
          // No attacks available — advance turn
          setState(advanceTurn(nextState));
          setBonusAttackId(null);
          setValidAttacks([]);
        }
      } else {
        setState(nextState);
        clearSelection();
      }
      return;
    }

    // --- Normal range attack ---
    if (validAttacks.some(a => a.row === row && a.col === col)) {
      setState(prev => applyAttack(prev, selected!, row, col));
      clearSelection();
      return;
    }

    // --- Select own piece ---
    const clicked = state.pieces.find(p => p.row === row && p.col === col);
    if (clicked && clicked.player === state.turn) {
      setSelected(clicked.id);
      setValidMoves(getMoves(clicked, state.pieces));
      const isRange = ['AS', 'AR', 'AT', 'MG'].includes(clicked.type);
      setValidAttacks(isRange ? getAttacks(clicked, state.pieces) : []);
      setBonusAttackId(null);
      return;
    }

    clearSelection();
  }, [state, selected, validMoves, validAttacks, bonusAttackId, clearSelection]);

  const winnerName = state.winner === 0 ? 'Blue' : 'Red';
  const turnColor = PLAYER_COLOR[state.turn];
  const inBonusPhase = bonusAttackId !== null;

  return (
    <div className="flex flex-col items-center gap-2">
      {state.winner === null && (
        <p className="text-sm font-semibold" style={{ color: turnColor }}>
          {inBonusPhase
            ? 'Assassin: click to attack or click elsewhere to skip'
            : `${state.turn === 0 ? 'Blue' : 'Red'}'s turn`}
        </p>
      )}
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          onClick={handleClick}
          style={{ cursor: 'pointer' }}
        />
        {state.winner !== null && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <p className="text-white text-3xl font-bold">{winnerName} wins!</p>
          </div>
        )}
      </div>
    </div>
  );
}
