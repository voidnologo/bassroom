import type { Verdict } from '../../engine/judge'
import type { Star } from '../../engine/tempoLadder'
import { xpIntoLevel, levelFor } from '../../progress/gamification'

/** Small shared readouts. Each pairs colour with a shape or a label (RC7). */

export function Stars({ value, label = true }: { value: Star; label?: boolean }) {
  return (
    <span className="stars" aria-label={`${value} of 3 stars`}>
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

const VERDICT_LABELS: Record<Verdict, string> = {
  perfect: 'on the beat',
  good: 'close',
  early: 'early',
  late: 'late',
  'wrong-pitch': 'wrong note',
  missed: 'not played',
  extra: 'extra note',
}

export function VerdictStrip({ verdicts }: { verdicts: Verdict[] }) {
  return (
    <div className="verdict-row" role="list" aria-label="Note by note result">
      {verdicts.map((verdict, index) => (
        <span
          key={index}
          role="listitem"
          className="verdict-chip"
          data-verdict={verdict}
          title={`Note ${index + 1}: ${VERDICT_LABELS[verdict]}`}
        />
      ))}
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
