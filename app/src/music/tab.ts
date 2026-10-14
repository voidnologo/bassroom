import { STRING_LABELS } from './fretboard'
import { barPositionAt, type MeterChange } from './meter'
import type { SongBar, TargetNote, TimeSignature } from './types'

/**
 * ASCII tablature rendering.
 *
 * Lives here rather than in a build script because the app draws tab from the
 * same function that writes the files in `tabs/`. A tab a learner reads on
 * paper and the one the app shows them have to be the same notes, and the only
 * way to guarantee that is for both to come from one renderer over one dataset.
 */

export interface TabOptions {
  /** Columns per beat. Four gives a sixteenth note its own column. */
  columnsPerBeat?: number
  /** Bars drawn before wrapping to a new system. */
  barsPerLine?: number
  /** Draw a counting row ("1 e & a") above the strings. */
  showCounts?: boolean
  /** Draw chord symbols above each bar. */
  showChords?: boolean
  /** Draw bar numbers beneath each bar. */
  showBarNumbers?: boolean
}

const DEFAULTS: Required<TabOptions> = {
  columnsPerBeat: 4,
  barsPerLine: 4,
  showCounts: false,
  showChords: true,
  showBarNumbers: true,
}

const SIXTEENTH_COUNTS = ['e', '&', 'a']

interface LaidOutBar {
  index: number
  chord: string | undefined
  beats: number
  width: number
  rows: string[][]
  counts: string[]
}

export function renderTab(
  barList: SongBar[],
  chartSignature: TimeSignature,
  options: TabOptions = {},
): string {
  const settings = { ...DEFAULTS, ...options }
  const laidOut = layOutBars(barList, chartSignature, settings)
  const systems = chunk(laidOut, settings.barsPerLine)
  return systems.map((system) => renderSystem(system, settings)).join('\n\n')
}

function layOutBars(
  barList: SongBar[],
  chartSignature: TimeSignature,
  settings: Required<TabOptions>,
): LaidOutBar[] {
  let beatsPerBar = chartSignature[0]
  return barList.map((bar) => {
    if (bar.timeSignature) beatsPerBar = bar.timeSignature[0]
    const width = beatsPerBar * settings.columnsPerBeat
    const rows = STRING_LABELS.map(() => new Array<string>(width).fill('-'))
    for (const barNote of bar.notes) placeNote(rows, barNote, settings.columnsPerBeat, width)
    return {
      index: bar.index,
      chord: bar.chord,
      beats: beatsPerBar,
      width,
      rows,
      counts: countRow(beatsPerBar, settings.columnsPerBeat),
    }
  })
}

/**
 * A note's fret number is written at its onset column. Two-digit frets need two
 * columns, so a sixteenth note at the twelfth fret would collide with the note
 * after it; at four columns per beat there is room, and the renderer clips
 * rather than overwriting its neighbour.
 */
function placeNote(
  rows: string[][],
  barNote: TargetNote,
  columnsPerBeat: number,
  width: number,
): void {
  if (!barNote.position) return
  const column = Math.round(barNote.startBeat * columnsPerBeat)
  const digits = String(barNote.position.fret)
  const row = rows[barNote.position.string]
  for (let offset = 0; offset < digits.length && column + offset < width; offset++) {
    row[column + offset] = digits[offset]
  }
}

function countRow(beats: number, columnsPerBeat: number): string[] {
  const columns = new Array<string>(beats * columnsPerBeat).fill(' ')
  for (let beat = 0; beat < beats; beat++) {
    columns[beat * columnsPerBeat] = String(beat + 1)
    for (let sub = 1; sub < columnsPerBeat && sub <= SIXTEENTH_COUNTS.length; sub++) {
      const column = beat * columnsPerBeat + Math.round((sub * columnsPerBeat) / 4)
      if (column < columns.length) columns[column] = SIXTEENTH_COUNTS[sub - 1]
    }
  }
  return columns
}

function renderSystem(system: LaidOutBar[], settings: Required<TabOptions>): string {
  const lines: string[] = []
  if (settings.showChords) lines.push(labelLine(system, (bar) => bar.chord ?? ''))
  if (settings.showCounts) lines.push(`  |${system.map((bar) => bar.counts.join('')).join('|')}|`)

  // Strings are drawn thinnest first, which is the convention on paper and the
  // reverse of the index order used everywhere else in the code.
  for (let string = STRING_LABELS.length - 1; string >= 0; string--) {
    const content = system.map((bar) => bar.rows[string].join('')).join('|')
    lines.push(`${STRING_LABELS[string]} |${content}|`)
  }

  if (settings.showBarNumbers) lines.push(labelLine(system, (bar) => String(bar.index)))
  return lines.join('\n')
}

function labelLine(system: LaidOutBar[], pick: (bar: LaidOutBar) => string): string {
  const cells = system.map((bar) => pick(bar).padEnd(bar.width).slice(0, bar.width))
  return `  |${cells.join('|')}|`
}

function chunk<T>(items: T[], size: number): T[][] {
  const groups: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size))
  }
  return groups
}

/**
 * Group a flat run of notes into bars, so an exercise can be drawn with the
 * same renderer a song chart uses.
 *
 * An exercise stores beats from the start of the body; a chart stores bars
 * holding beats from the start of the bar. This is the conversion between
 * them, and it lives here because both sides of it are notation.
 */
export function barsFromNotes(
  notes: readonly TargetNote[],
  timeSignature: TimeSignature,
  meterChanges: readonly MeterChange[] = [],
): SongBar[] {
  const byIndex = new Map<number, SongBar>()
  let lastBar = 0

  for (const note of notes) {
    const { bar, beatInBar } = barPositionAt(note.startBeat, timeSignature, meterChanges)
    const existing = byIndex.get(bar) ?? { index: bar, timeSignature, notes: [] }
    existing.notes.push({ ...note, startBeat: beatInBar - 1 })
    byIndex.set(bar, existing)
    lastBar = Math.max(lastBar, bar)
  }

  // Every bar up to the last, not only the ones holding a note. A bar of rest
  // is part of the music, and leaving it out shifts everything after it.
  return Array.from({ length: lastBar }, (_, index) => {
    const bar = index + 1
    return byIndex.get(bar) ?? { index: bar, timeSignature, notes: [] }
  })
}
