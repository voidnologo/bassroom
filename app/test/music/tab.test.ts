import { describe, expect, it } from 'vitest'
import { renderTab } from '../../src/music/tab'
import { bars, note, steady } from '../../src/content/authoring'
import type { TimeSignature } from '../../src/music/types'

const FOUR_FOUR: TimeSignature = [4, 4]
const THREE_FOUR: TimeSignature = [3, 4]

function lines(output: string): string[] {
  return output.split('\n')
}

/** The four string rows, thinnest first, as tab is conventionally drawn. */
function stringRows(output: string): string[] {
  return lines(output).filter((line) => /^[GDAE] \|/.test(line))
}

describe('renderTab', () => {
  it('draws the four strings with the thinnest on top', () => {
    const output = renderTab(bars([{ notes: steady(['E3', 'A3', 'D3', 'G3']) }]), FOUR_FOUR)
    expect(stringRows(output).map((line) => line[0])).toEqual(['G', 'D', 'A', 'E'])
  })

  it('puts a fret number on the string it is played on', () => {
    const output = renderTab(bars([{ notes: [note('A3', 0, 1)] }]), FOUR_FOUR)
    const rows = stringRows(output)
    expect(rows[2]).toContain('3')
    expect(rows[3]).not.toContain('3')
  })

  it('places a note at the column its beat falls on', () => {
    const output = renderTab(bars([{ notes: [note('A5', 2, 1)] }]), FOUR_FOUR, {
      columnsPerBeat: 2,
      showChords: false,
      showBarNumbers: false,
    })
    expect(stringRows(output)[2]).toBe('A |----5---|')
  })

  it('gives a bar as many columns as it has beats', () => {
    const output = renderTab(bars([{ notes: [] }]), THREE_FOUR, {
      columnsPerBeat: 2,
      showChords: false,
      showBarNumbers: false,
    })
    expect(stringRows(output)[0]).toBe('G |------|')
  })

  it('honours a meter change written on a bar', () => {
    const chart = bars([{ notes: [] }, { timeSignature: FOUR_FOUR, notes: [] }])
    const output = renderTab(chart, THREE_FOUR, {
      columnsPerBeat: 1,
      showChords: false,
      showBarNumbers: false,
    })
    expect(stringRows(output)[0]).toBe('G |---|----|')
  })

  it('writes a two-digit fret across two columns', () => {
    const output = renderTab(bars([{ notes: [note('E10', 0, 1)] }]), FOUR_FOUR, {
      columnsPerBeat: 2,
      showChords: false,
      showBarNumbers: false,
    })
    expect(stringRows(output)[3]).toBe('E |10------|')
  })

  it('renders the Angel riff with its sixteenth split intact', () => {
    const riff = bars([
      {
        notes: [
          note('A3', 0, 0.5),
          note('A3', 0.5, 0.5),
          note('A3', 1, 0.5),
          note('A3', 1.5, 0.25),
          note('A3', 1.75, 0.25),
          note('A3', 2, 0.5),
          note('A3', 2.5, 0.5),
          note('A3', 3, 0.5),
          note('A5', 3.5, 0.5),
        ],
      },
    ])
    const output = renderTab(riff, FOUR_FOUR, {
      columnsPerBeat: 4,
      showChords: false,
      showBarNumbers: false,
    })
    expect(stringRows(output)[2]).toBe('A |3-3-3-333-3-3-5-|')
  })

  it('shows chord symbols above the staff when asked', () => {
    const output = renderTab(bars([{ chord: 'Cm', notes: [] }]), FOUR_FOUR, { showChords: true })
    expect(lines(output)[0]).toContain('Cm')
  })

  it('numbers the bars beneath the staff when asked', () => {
    const output = renderTab(bars([{ notes: [] }], 12), FOUR_FOUR, { showBarNumbers: true })
    expect(lines(output)[lines(output).length - 1]).toContain('12')
  })

  it('counts sixteenths above the staff when asked', () => {
    const output = renderTab(bars([{ notes: [] }]), FOUR_FOUR, {
      columnsPerBeat: 4,
      showCounts: true,
      showChords: false,
    })
    expect(lines(output)[0]).toContain('1e&a2e&a3e&a4e&a')
  })

  it('wraps to a new system after the requested number of bars', () => {
    const chart = bars(Array.from({ length: 6 }, () => ({ notes: [] })))
    const output = renderTab(chart, FOUR_FOUR, { barsPerLine: 4 })
    expect(output.split('\n\n')).toHaveLength(2)
  })

  it('keeps every row of a system the same width', () => {
    const chart = bars([{ chord: 'Eb', notes: steady(['A6', 'A6', 'A6']) }], 2)
    const widths = new Set(lines(renderTab(chart, THREE_FOUR)).map((line) => line.length))
    expect(widths.size).toBe(1)
  })

  it('renders an empty bar list as an empty string', () => {
    expect(renderTab([], FOUR_FOUR)).toBe('')
  })

  it('truncates a chord symbol too long for its bar rather than shifting the staff', () => {
    const chart = bars([{ chord: 'Cmaj7#11b13', notes: [] }])
    const widths = new Set(
      lines(renderTab(chart, FOUR_FOUR, { columnsPerBeat: 1 })).map((l) => l.length),
    )
    expect(widths.size).toBe(1)
  })
})
