import { STRING_LABELS, preferredPosition } from '../../music/fretboard'
import type { SongBar, TargetNote, TimeSignature } from '../../music/types'

/**
 * Tab laid out to be played from.
 *
 * The fixed-width rendering in `music/tab.ts` is for paper. This is the same
 * notation drawn so that the things a player needs at a glance are the things
 * that stand out: where a bar begins, how many beats are in it, and how long
 * each note is held.
 *
 * Measures sit flush against each other and wrap, so a row reads as a line of
 * music rather than as a row of separate boxes.
 */

/** Drawn top to bottom the way tab is always written: thinnest string on top. */
const ROWS = [...STRING_LABELS].reverse()

/** Beat width, in pixels, at the system's natural size. Enough for a two-digit fret. */
const BEAT_WIDTH = 44

/** Bars to a line. Four is what fits a laptop without the numbers crowding. */
const BARS_PER_SYSTEM = 4

export function TabChart({
  bars,
  timeSignature,
}: {
  bars: SongBar[]
  timeSignature: TimeSignature
}): JSX.Element {
  const signatures = new Map<number, TimeSignature>()
  let inForce: TimeSignature | null = null
  for (const bar of bars) {
    const signature = bar.timeSignature ?? timeSignature
    if (inForce === null || signature[0] !== inForce[0] || signature[1] !== inForce[1]) {
      signatures.set(bar.index, signature)
    }
    inForce = signature
  }

  return (
    <div className="tabsheet">
      {chunk(bars, BARS_PER_SYSTEM).map((system) => (
        <div className="tabsystem" key={system[0].index}>
          <StringNames />
          <div className="tabstaff">
            {system.map((bar) => (
              <Measure
                key={bar.index}
                bar={bar}
                signature={bar.timeSignature ?? timeSignature}
                showSignature={signatures.get(bar.index)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size))
  }
  return out
}

/** Repeated at the start of every system, the way a clef is. */
function StringNames(): JSX.Element {
  return (
    <div className="tabnames" aria-hidden="true">
      {ROWS.map((label) => (
        <span key={label}>{label}</span>
      ))}
    </div>
  )
}

function Measure({
  bar,
  signature,
  showSignature,
}: {
  bar: SongBar
  signature: TimeSignature
  showSignature?: TimeSignature
}): JSX.Element {
  const beats = signature[0]

  return (
    <div
      className="tabmeasure"
      data-bar={bar.index}
      style={{ flexGrow: beats, flexBasis: `${beats * BEAT_WIDTH}px` }}
    >
      <div className="tabmeasure-head">
        <span className="tabmeasure-number">{bar.index}</span>
        {bar.chord && <span className="tabmeasure-chord">{bar.chord}</span>}
      </div>

      <div
        className="tabmeasure-staff"
        style={{ '--note-inset': showSignature ? '30px' : '0px' } as React.CSSProperties}
      >
        {ROWS.map((label) => (
          <span key={label} className="tabmeasure-line" />
        ))}
        {showSignature && (
          <span
            className="tabmeasure-meter"
            aria-label={`Time signature: ${showSignature[0]} ${showSignature[1]}`}
          >
            <b>{showSignature[0]}</b>
            <b>{showSignature[1]}</b>
          </span>
        )}
        <span className="tabmeasure-notes">
          {bar.notes.map((note, index) => (
            <Fret key={`${note.startBeat}-${index}`} note={note} beats={beats} />
          ))}
        </span>
      </div>

      <div
        className="tabmeasure-counts"
        aria-hidden="true"
        style={{ paddingLeft: showSignature ? 30 : 0 }}
      >
        {Array.from({ length: beats }, (_, index) => (
          <span key={index}>{index + 1}</span>
        ))}
      </div>
    </div>
  )
}

/**
 * The number sits where the note starts, and the line beside it runs for as
 * long as the note is held -- which is what says whether a bar holds one note
 * or four, the question a grid of bare numbers leaves open.
 */
function Fret({ note, beats }: { note: TargetNote; beats: number }): JSX.Element | null {
  const position = note.position ?? preferredPosition(note.midi)
  if (!position) return null
  const row = ROWS.indexOf(STRING_LABELS[position.string])
  const held = Math.max(0, Math.min(note.durationBeats, beats - note.startBeat))

  return (
    <span
      className="tabmeasure-note"
      style={{
        left: `${(note.startBeat / beats) * 100}%`,
        width: `${(held / beats) * 100}%`,
        top: `calc(${row} * var(--row-height))`,
      }}
    >
      <span className="tabmeasure-fret" data-fret={position.fret}>
        {position.fret}
      </span>
      <span className="tabmeasure-ring" />
    </span>
  )
}
