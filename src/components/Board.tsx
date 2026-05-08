import { useEffect, useRef } from 'react';

const SIZE = 19;
const CELL = 32;
const LABEL = 24;
const COLS = Array.from({ length: SIZE }, (_, i) => String.fromCharCode(65 + i));
const ROWS = Array.from({ length: SIZE }, (_, i) => String(i + 1));
const CANVAS_W = LABEL + SIZE * CELL + 1;
const CANVAS_H = LABEL + SIZE * CELL + 1;

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

function drawBoard(ctx: CanvasRenderingContext2D) {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  ctx.fillStyle = '#000000';
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  COLS.forEach((letter, c) => {
    ctx.fillText(letter, LABEL + c * CELL + CELL / 2, LABEL / 2);
  });

  ctx.textAlign = 'right';
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
}

export function Board() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawBoard(ctx);
  }, []);

  return <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} />;
}
