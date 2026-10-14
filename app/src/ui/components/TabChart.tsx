import { STRING_LABELS, preferredPosition } from '../../music/fretboard'
import type { SongBar, TimeSignature } from '../../music/types'

/**
 * Tab laid out for a screen rather than for paper.
 *
 * The ASCII rendering in `music/tab.ts` has to hold a fixed-width grid
 * together, so it spends its width on dashes and gets narrower as the music
 * gets busier. Here each bar is its own block that wraps when it runs out of
 * room, the fret numbers are large enough to read at playing distance, and the
 * string a note is on is a row you can follow with your eye.
 *
 * It is the same notation, so a learner reading this can read the printable
 * file in `tabs/` -- the lessons teach one thing, not two.
 */

/** Drawn top to bottom the way tab is always written: thinnest string on top. */
const ROWS = [...STRING_LABELS].reverse()

export function TabChart({
  bars,
  timeSignature,
}: {
  bars: SongBar[]
  timeSignature: TimeSignature
}): JSX.Element {
  return (
    <div className="tabchart">
      {bars.map((bar) => (
        <TabBar key={bar.index} bar={bar} fallbackSignature={timeSignature} />
      ))}
    </div>
  )
}

function TabBar({
  bar,
  fallbackSignature,
}: {
  bar: SongBar
  fallbackSignature: TimeSignature
}): JSX.Element {
  const beatsInBar = (bar.timeSignature ?? fallbackSignature)[0]

  // Eight eighth notes in a column sized for four quarters collide. Width is
  // bought with note count rather than by shrinking the numbers, which are
  // already at the smallest size readable from playing distance.
  const span = bar.notes.length > 6 ? 2 : 1

  return (
    <figure className="tabbar" style={{ gridColumn: `span ${span}` }}>
      <figcaption className="tabbar-head">
        <span className="tabbar-number">{bar.index}</span>
        {bar.chord && <span className="tabbar-chord">{bar.chord}</span>}
      </figcaption>

      <div className="tabbar-grid">
        <div className="tabbar-names">
          {ROWS.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>

        <div className="tabbar-lanes">
          {ROWS.map((label) => (
            <span key={label} className="tabbar-line" />
          ))}

          {Array.from({ length: beatsInBar - 1 }, (_, index) => (
            <span
              key={index}
              className="tabbar-beat"
              style={{ left: `${((index + 1) / beatsInBar) * 100}%` }}
            />
          ))}

          {bar.notes.map((note, index) => {
            const position = note.position ?? preferredPosition(note.midi)
            if (!position) return null
            const row = ROWS.indexOf(STRING_LABELS[position.string])
            return (
              <span
                key={`${note.startBeat}-${index}`}
                className="tabbar-fret"
                style={{
                  left: `${(note.startBeat / beatsInBar) * 100}%`,
                  top: `calc(${row} * var(--row-height))`,
                }}
              >
                {position.fret}
              </span>
            )
          })}
        </div>
      </div>
    </figure>
  )
}
