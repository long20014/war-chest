import { describe, it, expect } from 'vitest'
import { initialState, canCross } from './game'

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
