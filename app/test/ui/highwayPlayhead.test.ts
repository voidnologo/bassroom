import { describe, expect, it } from 'vitest'
import { isUnderTheLine, passedWidth } from '../../src/ui/components/NoteHighway'
import { note } from '../../src/content/authoring'

const QUARTER = note('E0', 4, 1)

describe('isUnderTheLine', () => {
  it.each([
    ['before it arrives', 3.9, false],
    ['the moment it arrives', 4, true],
    ['part way through', 4.6, true],
    ['the moment it is over', 5, false],
  ])('%s', (_name, beat, expected) => {
    expect(isUnderTheLine(QUARTER, beat, undefined)).toBe(expected)
  })

  it('stops once the note has been judged, so the verdict colour is not overpainted', () => {
    expect(isUnderTheLine(QUARTER, 4.5, 'perfect')).toBe(false)
  })

  it('stays lit for the whole of a note held across several beats', () => {
    const held = note('E0', 4, 4)
    expect(isUnderTheLine(held, 7.9, undefined)).toBe(true)
    expect(isUnderTheLine(held, 8, undefined)).toBe(false)
  })
})

describe('passedWidth', () => {
  it('is nothing while the note is still right of the line', () => {
    expect(passedWidth(120, 40, 100)).toBe(0)
  })

  it('is the part left of the line while the note is crossing it', () => {
    expect(passedWidth(90, 40, 100)).toBe(10)
  })

  it('is the whole note once it has gone by, never more', () => {
    expect(passedWidth(20, 40, 100)).toBe(40)
  })
})
