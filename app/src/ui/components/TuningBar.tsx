import { tuningStateOf, type TuningState } from '../../music/notes'

/**
 * How far either side of the note the bar shows. Beyond this the reading is
 * better described as a different note than as a badly tuned one, and the
 * fill pins to the end rather than running off it.
 */
const RANGE_CENTS = 50

/** Shown in the state slot while nothing is heard, so the row keeps its height. */
const WAITING_LABEL = 'waiting'

const LABELS: Record<TuningState, string> = {
  'in-tune': 'in tune',
  sharp: 'sharp',
  flat: 'flat',
}

/**
 * A balance bar for tuning: the fill grows from the centre toward the side the
 * note is out on, and its length is the size of the error.
 *
 * Reading a signed number means decoding a minus sign and a magnitude while
 * both hands are on the instrument. A bar is read from the corner of the eye,
 * so the number beside it only has to answer "how far", not "which way".
 *
 * Direction is carried by position, state by the label, and colour only
 * agrees with both (RC7) -- the bar is still usable in greyscale.
 */
/**
 * `cents` is null when nothing is being heard. The track, its in-tune zone and
 * its scale are still drawn: the bar is what says what the tuner does, and a
 * card that is empty until a string is plucked does not say it.
 */
export function TuningBar({ cents }: { cents: number | null }): JSX.Element {
  const state = cents === null ? null : tuningStateOf(cents)
  const clamped = Math.max(-RANGE_CENTS, Math.min(RANGE_CENTS, cents ?? 0))
  const halfWidthPercent = (Math.abs(clamped) / RANGE_CENTS) * 50
  const fillLeftPercent = clamped < 0 ? 50 - halfWidthPercent : 50
  // The fill has no width at all when the note is dead on, which would make a
  // perfectly tuned string look the same as no reading. The head always marks
  // where the note actually sits.
  const headPercent = 50 + (clamped / RANGE_CENTS) * 50

  return (
    <div className="tuning">
      <div className="tuning-track" role="img" aria-label={readoutLabel(cents, state)}>
        <span className="tuning-zone" />
        {[-RANGE_CENTS / 2, RANGE_CENTS / 2].map((tick) => (
          <span
            key={tick}
            className="tuning-tick"
            style={{ left: `${50 + (tick / RANGE_CENTS) * 50}%` }}
          />
        ))}
        {state !== null && (
          <span
            className="tuning-fill"
            data-state={state}
            style={{ left: `${fillLeftPercent}%`, width: `${halfWidthPercent}%` }}
          />
        )}
        <span className="tuning-centre" />
        {state !== null && (
          <span className="tuning-head" data-state={state} style={{ left: `${headPercent}%` }} />
        )}
      </div>
      <div className="tuning-scale">
        <span>flat</span>
        <span className="tuning-state" data-state={state ?? 'waiting'}>
          {state === null ? WAITING_LABEL : LABELS[state]}
        </span>
        <span>sharp</span>
      </div>
    </div>
  )
}

function readoutLabel(cents: number | null, state: TuningState | null): string {
  if (cents === null || state === null) return 'No note heard yet'
  if (state === 'in-tune') return 'In tune'
  return `${Math.abs(Math.round(cents))} cents ${state}, out of ${RANGE_CENTS}`
}
