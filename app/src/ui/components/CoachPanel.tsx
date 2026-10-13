import type { CoachFeedback, Observation } from '../../coach/types'
import { Pill } from './Indicators'

/**
 * What the coach said about the last take.
 *
 * At most three observations and exactly one next action, which is the shape
 * the providers are contracted to return. A beginner given three things to fix
 * fixes none of them.
 */

export function CoachPanel({
  feedback,
  pending,
  onAct,
}: {
  feedback: CoachFeedback | null
  pending: boolean
  onAct?: (feedback: CoachFeedback) => void
}) {
  if (pending) {
    return (
      <div className="card">
        <h3>Coach</h3>
        <p className="muted small">Looking at that take…</p>
      </div>
    )
  }

  if (!feedback) return null

  const label = actionLabel(feedback.nextAction.kind)

  return (
    <div className="card">
      <div className="row-between" style={{ marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>Coach</h3>
        <span className="tiny faint mono">
          {feedback.providerId} · {feedback.confidence} confidence
        </span>
      </div>

      <p style={{ fontSize: '1.05rem' }}>{feedback.headline}</p>

      {feedback.observations.length > 0 && (
        <ul className="clean" style={{ marginTop: 14 }}>
          {feedback.observations.map((observation) => (
            <ObservationRow key={observation.id} observation={observation} />
          ))}
        </ul>
      )}

      <div className="row-between wrap" style={{ marginTop: 16, gap: 12 }}>
        <div>
          <div className="stat-label">Do this next</div>
          <div>{feedback.nextAction.detail}</div>
        </div>
        {onAct && label !== null && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onAct(feedback)}>
            {label}
          </button>
        )}
      </div>
    </div>
  )
}

function ObservationRow({ observation }: { observation: Observation }) {
  return (
    <li>
      <div className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
        <Pill tone={toneFor(observation.severity)}>{labelFor(observation.severity)}</Pill>
        <div>
          <div>{observation.statement}</div>
          {observation.evidence && <div className="small muted">{observation.evidence}</div>}
        </div>
      </div>
    </li>
  )
}

function toneFor(severity: Observation['severity']): 'bad' | 'warn' | 'plain' {
  if (severity === 'fix') return 'bad'
  if (severity === 'watch') return 'warn'
  return 'plain'
}

function labelFor(severity: Observation['severity']): string {
  if (severity === 'fix') return 'fix'
  if (severity === 'watch') return 'watch'
  return 'note'
}

/**
 * Null for the kinds the app cannot carry out. Looping one bar and taking a
 * break are both things the learner does with the instrument; a button for
 * them promises the app will set something up, and pressing "Loop that bar"
 * started an ordinary take of the whole exercise. The advice itself is still
 * printed above, which is where it was doing the work.
 */
function actionLabel(kind: CoachFeedback['nextAction']['kind']): string | null {
  const labels: Record<CoachFeedback['nextAction']['kind'], string | null> = {
    repeat: 'Run it again',
    'slow-down': 'Slow down and go',
    'speed-up': 'Speed up and go',
    isolate: null,
    'switch-exercise': 'Back to the path',
    rest: null,
  }
  return labels[kind]
}
