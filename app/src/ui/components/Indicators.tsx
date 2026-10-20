import type { Verdict } from '../../engine/judge'
import type { Star } from '../../engine/tempoLadder'
import { xpIntoLevel, levelFor } from '../../progress/gamification'
import { isTimed } from '../../music/meter'
import type { Exercise } from '../../music/types'

/** Small shared readouts. Each pairs colour with a shape or a label (RC7). */

export function Stars({ value, label = true }: { value: Star; label?: boolean }) {
  return (
    // role="img" is what makes the label win over the glyphs; aria-label is
    // ignored on a bare span, which would read out "star star white star".
    <span className="stars" role="img" aria-label={`${value} of 3 stars`}>
      {'★'.repeat(value)}
      <span className="stars-empty">{'☆'.repeat(3 - value)}</span>
      {label && (
        <span className="tiny faint" style={{ marginLeft: 6 }}>
          {value}/3
        </span>
      )}
    </span>
  )
}

export function Meter({ fraction, good = false }: { fraction: number; good?: boolean }) {
  const percent = Math.max(0, Math.min(1, fraction)) * 100
  return (
    <div className={good ? 'meter meter-good' : 'meter'}>
      <div style={{ width: `${percent}%` }} />
    </div>
  )
}

export function LevelBar({ xp }: { xp: number }) {
  const { into, needed, fraction } = xpIntoLevel(xp)
  return (
    <div className="stack" style={{ gap: 5 }}>
      <div className="row-between tiny muted">
        <span>Level {levelFor(xp)}</span>
        <span className="mono">
          {into} / {needed} XP
        </span>
      </div>
      <Meter fraction={fraction} />
    </div>
  )
}

/**
 * How an exercise is listed where its tempo would otherwise go. A drill with no
 * clock has no target tempo to reach, so naming one invites the learner to
 * chase a number nothing about the drill measures.
 */
export function tempoText(exercise: Exercise): string {
  return isTimed(exercise) ? `${exercise.targetBpm} bpm` : 'No clock'
}

const VERDICT_LABELS: Record<Verdict, string> = {
  perfect: 'on the beat',
  good: 'close',
  early: 'early',
  late: 'late',
  'wrong-pitch': 'wrong note',
  unpitched: 'heard, note unclear',
  missed: 'not played',
  extra: 'extra note',
}

/**
 * `perfect` means the right note at the right moment, and there is no moment to
 * be right about in a drill with no clock.
 */
function labelFor(verdict: Verdict, timed: boolean): string {
  if (verdict === 'perfect' && !timed) return 'right note'
  return VERDICT_LABELS[verdict]
}

export function VerdictStrip({ verdicts, timed }: { verdicts: Verdict[]; timed: boolean }) {
  const counts = new Map<Verdict, number>()
  for (const verdict of verdicts) counts.set(verdict, (counts.get(verdict) ?? 0) + 1)
  const summary = [...counts.entries()]
    .map(([verdict, count]) => `${count} ${labelFor(verdict, timed)}`)
    .join(', ')

  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="verdict-row" role="list" aria-label={`Note by note: ${summary}`}>
        {verdicts.map((verdict, index) => (
          <span
            key={index}
            role="listitem"
            className="verdict-chip"
            data-verdict={verdict}
            aria-label={`Note ${index + 1}: ${labelFor(verdict, timed)}`}
            title={`Note ${index + 1}: ${labelFor(verdict, timed)}`}
          />
        ))}
      </div>
      {/* The chips encode early and late by position, which is no use to a
          screen reader, so the same information is written out. */}
      <p className="tiny faint" style={{ margin: 0 }}>
        {summary}
      </p>
    </div>
  )
}

export function BeatDots({ beatsPerBar, current }: { beatsPerBar: number; current: number }) {
  return (
    <div className="beat-dots" aria-hidden="true">
      {Array.from({ length: beatsPerBar }, (_, index) => (
        <span
          key={index}
          className="beat-dot"
          data-on={index === current}
          data-accent={index === 0}
        />
      ))}
    </div>
  )
}

export function Pill({
  tone = 'plain',
  children,
}: {
  tone?: 'plain' | 'good' | 'warn' | 'bad'
  children: React.ReactNode
}) {
  const className = tone === 'plain' ? 'pill' : `pill pill-${tone}`
  return <span className={className}>{children}</span>
}
