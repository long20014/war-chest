import { describe, it, expect } from 'vitest'
import { initialState, canCross, getMoves, getAttacks, applyMove, getWarpDestinations, applyWarp, canEvolve, applyEvolution, advanceTurn } from './game'
import type { Piece, GameState } from './game'

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

describe('throne-win', () => {
  it('King wins by moving onto the empty throne', () => {
    const king = piece({ type: 'KI', row: 9, col: 8 })
    const state: GameState = { pieces: [king], turn: 0, winner: null }
    const moves = getMoves(king, state.pieces)
    expect(moves).toContainEqual({ row: 9, col: 9 })
    const next = applyMove(state, king.id, 9, 9)
    expect(next.winner).toBe(0)
  })

  it('King cannot move onto an occupied throne', () => {
    const king = piece({ type: 'KI', row: 9, col: 8 })
    const blocker = piece({ id: 2, type: 'SD', player: 1, row: 9, col: 9, startRow: 9, startCol: 9 })
    const moves = getMoves(king, [king, blocker])
    expect(moves).not.toContainEqual({ row: 9, col: 9 })
  })

  it('King-capture win still works', () => {
    const king = piece({ type: 'KI', row: 5, col: 5 })
    const enemyKing = piece({ id: 2, type: 'KI', player: 1, row: 5, col: 6, startRow: 5, startCol: 6 })
    const state: GameState = { pieces: [king, enemyKing], turn: 0, winner: null }
    const next = applyMove(state, king.id, 5, 6)
    expect(next.winner).toBe(0)
  })
})

describe('warp', () => {
  it('lists empty other warp cells when the piece is on a warp', () => {
    const p = piece({ type: 'KN', row: 4, col: 4 })
    const dests = getWarpDestinations({ pieces: [p], turn: 0, winner: null }, p.id)
    expect(dests).toContainEqual({ row: 4, col: 14 })
    expect(dests).toContainEqual({ row: 14, col: 4 })
    expect(dests).toContainEqual({ row: 14, col: 14 })
    expect(dests).not.toContainEqual({ row: 4, col: 4 })
  })

  it('excludes occupied warp cells', () => {
    const p = piece({ type: 'KN', row: 4, col: 4 })
    const other = piece({ id: 2, type: 'SD', player: 1, row: 4, col: 14, startRow: 4, startCol: 14 })
    const dests = getWarpDestinations({ pieces: [p, other], turn: 0, winner: null }, p.id)
    expect(dests).not.toContainEqual({ row: 4, col: 14 })
  })

  it('returns [] when the piece is not on a warp', () => {
    const p = piece({ type: 'KN', row: 5, col: 5 })
    expect(getWarpDestinations({ pieces: [p], turn: 0, winner: null }, p.id)).toEqual([])
  })

  it('applyWarp relocates the piece', () => {
    const p = piece({ type: 'KN', row: 4, col: 4 })
    const next = applyWarp({ pieces: [p], turn: 0, winner: null }, p.id, 14, 14)
    const moved = next.pieces.find(x => x.id === p.id)!
    expect([moved.row, moved.col]).toEqual([14, 14])
  })
})

describe('evolution', () => {
  it('a Soldier on the throne can evolve when no evolved unit lives', () => {
    const sd = piece({ type: 'SD', row: 9, col: 9 })
    expect(canEvolve({ pieces: [sd], turn: 0, winner: null }, sd.id)).toBe(true)
  })

  it('a Soldier cannot evolve while an evolved unit already lives', () => {
    const sd = piece({ type: 'SD', row: 9, col: 9 })
    const already = piece({ id: 2, type: 'MG', player: 0, row: 5, col: 5, startRow: 5, startCol: 5, evolved: true })
    expect(canEvolve({ pieces: [sd, already], turn: 0, winner: null }, sd.id)).toBe(false)
  })

  it('a Soldier not on the throne cannot evolve', () => {
    const sd = piece({ type: 'SD', row: 8, col: 9 })
    expect(canEvolve({ pieces: [sd], turn: 0, winner: null }, sd.id)).toBe(false)
  })

  it('applyEvolution changes type and marks evolved', () => {
    const sd = piece({ type: 'SD', row: 9, col: 9 })
    const next = applyEvolution({ pieces: [sd], turn: 0, winner: null }, sd.id, 'MG')
    const evolved = next.pieces.find(x => x.id === sd.id)!
    expect(evolved.type).toBe('MG')
    expect(evolved.evolved).toBe(true)
  })
})

describe('throne dwell limit', () => {
  it('a non-King unit is ejected to its start after 3 owner-turns on the throne', () => {
    // AR on throne, its start cell (17,6) is free. Player 0 owns it.
    let state: GameState = {
      pieces: [piece({ type: 'AR', row: 9, col: 9, startRow: 17, startCol: 6 })],
      turn: 0, winner: null,
    }
    // Simulate owner turns beginning: advanceTurn hands the turn to a player and
    // runs the timer for that player. Bring the turn back to player 0 four times.
    // start on player 1's turn so the first advance hands it to player 0
    state = { ...state, turn: 1 }
    state = advanceTurn(state) // -> player 0, counter 1
    let ar = state.pieces[0]; expect(ar.throneTurns).toBe(1)
    state = advanceTurn(state) // -> player 1
    state = advanceTurn(state) // -> player 0, counter 2
    expect(state.pieces[0].throneTurns).toBe(2)
    state = advanceTurn(state); state = advanceTurn(state) // -> player 0, counter 3
    expect(state.pieces[0].throneTurns).toBe(3)
    state = advanceTurn(state); state = advanceTurn(state) // -> player 0, would be 4 -> eject
    ar = state.pieces[0]
    expect([ar.row, ar.col]).toEqual([17, 6])
    expect(ar.throneTurns).toBe(0)
  })

  it('the unit dies when its start cell is occupied at eject time', () => {
    let state: GameState = {
      pieces: [
        piece({ type: 'AR', row: 9, col: 9, startRow: 17, startCol: 6 }),
        piece({ id: 2, type: 'SD', player: 0, row: 17, col: 6, startRow: 17, startCol: 6 }),
      ],
      turn: 1, winner: null,
    }
    for (let i = 0; i < 8; i++) state = advanceTurn(state) // cycle past the limit
    expect(state.pieces.find(p => p.id === 1)).toBeUndefined() // AR removed
  })

  it('the counter resets when the unit leaves the throne', () => {
    let state: GameState = {
      pieces: [piece({ type: 'AR', row: 9, col: 9, startRow: 17, startCol: 6, throneTurns: 2 })],
      turn: 1, winner: null,
    }
    // move it off the throne, then advance to player 0
    state = { ...state, pieces: [{ ...state.pieces[0], row: 9, col: 8 }] }
    state = advanceTurn(state) // -> player 0, off throne
    expect(state.pieces[0].throneTurns).toBe(0)
  })
})
