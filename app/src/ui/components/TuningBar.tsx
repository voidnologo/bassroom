import { tuningStateOf, type TuningState } from '../../music/notes'

/**
 * How far either side of the note the bar shows. Beyond this the reading is
 * better described as a different note than as a badly tuned one, and the
 * fill pins to the end rather than running off it.
 */
const RANGE_CENTS = 50

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
export function TuningBar({ cents }: { cents: number }): JSX.Element {
  const state = tuningStateOf(cents)
  const clamped = Math.max(-RANGE_CENTS, Math.min(RANGE_CENTS, cents))
  const halfWidthPercent = (Math.abs(clamped) / RANGE_CENTS) * 50
  const fillLeftPercent = clamped < 0 ? 50 - halfWidthPercent : 50
  // The fill has no width at all when the note is dead on, which would make a
  // perfectly tuned string look the same as no reading. The head always marks
  // where the note actually sits.
  const headPercent = 50 + (clamped / RANGE_CENTS) * 50

  return (
    <div className="tuning">
      <div
        className="tuning-track"
        role="img"
        aria-label={
          state === 'in-tune'
            ? 'In tune'
            : `${Math.abs(Math.round(cents))} cents ${state}, out of ${RANGE_CENTS}`
        }
      >
        <span className="tuning-zone" />
        {[-RANGE_CENTS / 2, RANGE_CENTS / 2].map((tick) => (
          <span
            key={tick}
            className="tuning-tick"
            style={{ left: `${50 + (tick / RANGE_CENTS) * 50}%` }}
          />
        ))}
        <span
          className="tuning-fill"
          data-state={state}
          style={{ left: `${fillLeftPercent}%`, width: `${halfWidthPercent}%` }}
        />
        <span className="tuning-centre" />
        <span className="tuning-head" data-state={state} style={{ left: `${headPercent}%` }} />
      </div>
      <div className="tuning-scale">
        <span>flat</span>
        <span className="tuning-state" data-state={state}>
          {LABELS[state]}
        </span>
        <span>sharp</span>
      </div>
    </div>
  )
}
