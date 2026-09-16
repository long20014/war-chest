import { describe, it, expect } from 'vitest'
import { initialState, canCross, getMoves, getAttacks } from './game'
import type { Piece } from './game'

function piece(over: Partial<Piece> & { type: Piece['type']; row: number; col: number }): Piece {
  return { id: 1, player: 0, revealed: false, startRow: over.row, startCol: over.col, ...over }
}

describe('canCross (walls)', () => {
  it('blocks the orthogonal step across a palace wall edge', () => {
    // (8,8)-(9,8) is a wall (top-left palace block)
    expect(canCross({ row: 8, col: 8 }, { row: 9, col: 8 }, false)).toBe(false)
  })

  it('allows a normal orthogonal step with no wall', () => {
    expect(canCross({ row: 5, col: 5 }, { row: 5, col: 6 }, false)).toBe(true)
  })

  it('blocks a diagonal step into the sealed palace corner', () => {
    // (8,8)->(9,9): flanked by wall edges (8,8)-(8,9) and (8,8)-(9,8)
    expect(canCross({ row: 8, col: 8 }, { row: 9, col: 9 }, false)).toBe(false)
    // symmetric
    expect(canCross({ row: 9, col: 9 }, { row: 8, col: 8 }, false)).toBe(false)
  })

  it('ignores walls when ignoreWalls is true', () => {
    expect(canCross({ row: 8, col: 8 }, { row: 9, col: 8 }, true)).toBe(true)
  })
})

describe('initialState piece start fields', () => {
  it('records each piece start cell', () => {
    const s = initialState()
    for (const p of s.pieces) {
      expect(p.startRow).toBe(p.row)
      expect(p.startCol).toBe(p.col)
    }
  })
})

describe('walls block movement', () => {
  it('a Guard cannot step across a palace wall edge', () => {
    // Guard at (8,8); (9,8) is walled off, (8,9) is walled off
    const g = piece({ type: 'GA', row: 8, col: 8 })
    const moves = getMoves(g, [g])
    expect(moves).not.toContainEqual({ row: 9, col: 8 })
    expect(moves).not.toContainEqual({ row: 8, col: 9 })
    // (7,7) is open (no wall on that diagonal)
    expect(moves).toContainEqual({ row: 7, col: 7 })
  })
})

describe('walls block ranged attacks', () => {
  it('an Archer cannot shoot across a wall', () => {
    // Archer at (8,7) firing right toward enemy at (8,9): blocked by (8,8)-(8,9) wall
    const ar = piece({ type: 'AR', row: 8, col: 7 })
    const enemy = piece({ id: 2, type: 'SD', player: 1, row: 8, col: 9, startRow: 8, startCol: 9 })
    const attacks = getAttacks(ar, [ar, enemy])
    expect(attacks).not.toContainEqual({ row: 8, col: 9 })
  })

  it('a range unit on the throne ignores walls when attacking', () => {
    // Archer on throne firing up-left toward enemy at (8,8); throne exception applies
    const ar = piece({ type: 'AR', row: 9, col: 9, startRow: 17, startCol: 6 })
    const enemy = piece({ id: 2, type: 'SD', player: 1, row: 8, col: 8, startRow: 8, startCol: 8 })
    const attacks = getAttacks(ar, [ar, enemy])
    expect(attacks).toContainEqual({ row: 8, col: 8 })
  })
})
