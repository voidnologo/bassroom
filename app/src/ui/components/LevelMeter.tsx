import { useEffect, useRef, useState } from 'react'
import { useAudio } from '../../state/AudioProvider'

/**
 * How hard the loudest attack is hitting the input, so the gain can be set
 * deliberately rather than guessed at.
 *
 * Peak rather than average: what clips is a peak, and what the onset detector
 * compares against the noise gate is the peak of an attack. An average would
 * sit a good 10 dB lower and read as healthy while plucks were clipping.
 */

/** The detector's own gate is -52 dBFS; a peak this close to it loses quiet plucks. */
const TOO_QUIET_DB = -30
/** Below this there is room to turn up without risking a clipped attack. */
const COULD_BE_LOUDER_DB = -18
/** Above this the headroom left is less than the spread between a soft and a hard pluck. */
const HOT_DB = -6
/** Full scale, with the margin a converter needs to not square off a peak. */
const CLIPPING_DB = -1.5

/** Quietest level the meter draws; below this the bar is empty. */
const FLOOR_DB = -60

export type LevelVerdict = 'silent' | 'too-quiet' | 'could-be-louder' | 'good' | 'hot' | 'clipping'

interface Reading {
  verdict: LevelVerdict
  advice: string
}

export function verdictForPeak(peakDb: number | null): Reading {
  if (peakDb === null || peakDb < FLOOR_DB) {
    return { verdict: 'silent', advice: 'Play a note and watch the meter.' }
  }
  if (peakDb < TOO_QUIET_DB) {
    return {
      verdict: 'too-quiet',
      advice:
        'Too quiet. Quiet plucks will sit under the noise gate and go unheard. Turn the interface gain up.',
    }
  }
  if (peakDb < COULD_BE_LOUDER_DB) {
    return {
      verdict: 'could-be-louder',
      advice:
        'Usable, with room to spare. A little more gain gives the quiet plucks a better chance.',
    }
  }
  if (peakDb < HOT_DB) {
    return {
      verdict: 'good',
      advice: 'Good. Clear of the noise floor, with headroom left for a hard pluck.',
    }
  }
  if (peakDb < CLIPPING_DB) {
    return {
      verdict: 'hot',
      advice:
        'Hot. It works, but a hard pluck has little room left before it clips. Ease the gain down.',
    }
  }
  return {
    verdict: 'clipping',
    advice:
      'Clipping. A squared-off peak is harder to read a pitch from, not easier. Turn the gain down.',
  }
}

const amplitudeToDb = (amplitude: number): number => 20 * Math.log10(Math.max(amplitude, 1e-6))

/** Where a level sits on the drawn bar, 0..1. */
export function barFraction(peakDb: number): number {
  return Math.max(0, Math.min(1, (peakDb - FLOOR_DB) / (0 - FLOOR_DB)))
}

/** How long the loudest attack stays on the meter, so it can be read and acted on. */
const HOLD_MS = 2500

export function LevelMeter() {
  const { engine, state } = useAudio()
  const [peakDb, setPeakDb] = useState<number | null>(null)
  const peakRef = useRef<{ db: number; at: number } | null>(null)

  useEffect(() => {
    const unsubscribe = engine.onOnset((event) => {
      const db = amplitudeToDb(event.level)
      const now = performance.now()
      const held = peakRef.current
      const expired = held === null || now - held.at > HOLD_MS
      if (!expired && db <= held.db) return
      peakRef.current = { db, at: now }
      setPeakDb(db)
    })
    const timer = window.setInterval(() => {
      const held = peakRef.current
      if (held === null || performance.now() - held.at <= HOLD_MS) return
      peakRef.current = null
      setPeakDb(null)
    }, 500)
    return () => {
      unsubscribe()
      window.clearInterval(timer)
    }
  }, [engine])

  const listening = state === 'running'
  const reading = verdictForPeak(listening ? peakDb : null)
  const fraction = peakDb === null ? 0 : barFraction(peakDb)

  return (
    <div className="card">
      <h3>Input level</h3>
      <p className="small muted" style={{ marginTop: 0 }}>
        dBFS counts down from 0, the loudest sound a recording can hold, so everything you play is a
        negative number. What is measured here is the attack: the instant of the pluck, before the
        note settles. It is the loudest part of a bass note, and the part that decides whether the
        gain is set right.
      </p>
      <div className="stack" style={{ gap: 12 }}>
        <div className="row-between">
          <span className="stat-value">{peakDb === null ? '—' : `${peakDb.toFixed(1)}`}</span>
          <span className="mono tiny faint">dBFS, loudest attack</span>
        </div>
        <div className="level-track" role="img" aria-label={reading.advice}>
          <span className="level-band" />
          <span
            className="level-fill"
            data-verdict={reading.verdict}
            style={{ width: `${fraction * 100}%` }}
          />
        </div>
        <div className="level-scale tiny faint">
          <span>{FLOOR_DB}</span>
          <span>too quiet</span>
          <span>good</span>
          <span>0</span>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          Too far down and quiet plucks sink into the noise floor, the hiss and hum that is there
          when you are not playing. Too far up and there is no headroom, the room left below 0, so a
          hard pluck clips: the top of the wave is squared off, and a squared-off wave is harder to
          read a pitch from, not easier.
        </p>
        <p className="small muted" style={{ margin: 0 }}>
          {listening ? reading.advice : 'Start listening to set your gain.'}
        </p>
      </div>
    </div>
  )
}
