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
  drawWalls(ctx);
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
