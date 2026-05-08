# War Chest — 19×19 Game Board (Canvas)

## Context
Build the initial game board for a custom War Chest game rendered on an HTML5 `<canvas>`. The board is 19×19 cells. The following zones are completely hidden (not drawn):

- **4 corner zones** (3×3 each): top-left, top-right, bottom-left, bottom-right
- **8 rear zones** (3×3 each): 2 per side, immediately inward from each corner along the same edge

Row numbers (1–19) run along the left edge; column letters (A–S) run along the top. No game logic yet — just the board.

Stack: React 19, TypeScript, Vite 8, Tailwind CSS 4.

---

## Files to change

| Action | File |
|--------|------|
| Create | `src/components/Board.tsx` |
| Modify | `src/App.tsx` |

Any previously created HTML-based `Board.tsx` should be replaced wholesale.

---

## Implementation

### Constants

```ts
const SIZE = 19;
const CELL = 32;           // px per cell
const LABEL = 24;          // px reserved for row/col labels
const COLS = Array.from({ length: SIZE }, (_, i) => String.fromCharCode(65 + i)); // A–S
const ROWS = Array.from({ length: SIZE }, (_, i) => String(i + 1));               // 1–19
const CANVAS_W = LABEL + SIZE * CELL;
const CANVAS_H = LABEL + SIZE * CELL;
```

### Unavailable cell helpers (zero-based indices)

Corner zones — the existing 4 corners:
```ts
function isCornerCell(row: number, col: number): boolean {
  return (row <= 2 || row >= 16) && (col <= 2 || col >= 16);
}
```

Rear zones — 8 new 3×3 zones, 2 per edge, immediately inward from each corner:

| Side   | Rear 1                     | Rear 2                      |
|--------|----------------------------|-----------------------------|
| Top    | rows 0–2, cols 3–5 (D–F)  | rows 0–2, cols 13–15 (N–P)  |
| Bottom | rows 16–18, cols 3–5 (D–F)| rows 16–18, cols 13–15 (N–P)|
| Left   | rows 3–5, cols 0–2 (A–C)  | rows 13–15, cols 0–2 (A–C)  |
| Right  | rows 3–5, cols 16–18 (Q–S)| rows 13–15, cols 16–18 (Q–S)|

```ts
function isRearCell(row: number, col: number): boolean {
  const topOrBottom = row <= 2 || row >= 16;
  const leftOrRight = col <= 2 || col >= 16;
  const nearLeftCol  = col >= 3 && col <= 5;
  const nearRightCol = col >= 13 && col <= 15;
  const nearTopRow   = row >= 3 && row <= 5;
  const nearBottomRow = row >= 13 && row <= 15;

  return (topOrBottom && (nearLeftCol || nearRightCol)) ||
         (leftOrRight && (nearTopRow  || nearBottomRow));
}
```

Both helpers are used together in the draw loop:
```ts
if (isCornerCell(r, c) || isRearCell(r, c)) continue;
```

### Component structure

`Board` is a React component that holds a `<canvas>` ref and draws in a `useEffect`.

```tsx
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
```

### Drawing logic — `drawBoard(ctx)`

All drawing happens in a single `drawBoard` function to keep the component lean.

**Step 1 — clear**
```ts
ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
```

**Step 2 — column labels (A–S)**
```ts
ctx.fillStyle = '#9ca3af'; // gray-400
ctx.font = '11px monospace';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
COLS.forEach((letter, c) => {
  const x = LABEL + c * CELL + CELL / 2;
  const y = LABEL / 2;
  ctx.fillText(letter, x, y);
});
```

**Step 3 — row labels (1–19)**
```ts
ctx.textAlign = 'right';
ROWS.forEach((num, r) => {
  const x = LABEL - 4;
  const y = LABEL + r * CELL + CELL / 2;
  ctx.fillText(num, x, y);
});
```

**Step 4 — cells**

For each cell, skip corner cells entirely (don't draw anything). For visible cells, stroke the border rectangle.

```ts
ctx.strokeStyle = '#4b5563'; // gray-600
ctx.lineWidth = 1;
for (let r = 0; r < SIZE; r++) {
  for (let c = 0; c < SIZE; c++) {
    if (isCornerCell(r, c)) continue;
    const x = LABEL + c * CELL;
    const y = LABEL + r * CELL;
    ctx.strokeRect(x + 0.5, y + 0.5, CELL, CELL);
  }
}
```

The `+ 0.5` offset aligns strokes to pixel boundaries, preventing blurry 2px lines on 1× displays.

### `src/App.tsx`

```tsx
import { Board } from './components/Board'

function App() {
  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center gap-6">
      <h1 className="text-4xl font-bold tracking-tight">War Chest</h1>
      <Board />
    </div>
  )
}

export default App
```

---

## Sizing notes
- `CELL = 32` → board area is 608×608px (plus 24px label gutter on each axis)
- `LABEL = 24` → enough room for 1–2 digit numbers and single letters at 11px
- To scale the board, change only `CELL` and/or `LABEL`

---

## Verification
1. Run `npm run dev` and open the dev server
2. Confirm 19 column labels (A–S) across the top and 19 row labels (1–19) down the left
3. Confirm the four 3×3 corner regions are blank
4. Confirm the eight 3×3 rear regions (2 per edge, inward from corners) are also blank
5. Confirm single-pixel cell borders on all remaining cells
5. Run `npm run build` — no TypeScript errors
