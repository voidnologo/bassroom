import { ALL_EXERCISES, LESSONS, lessonById } from '../../content/curriculum'
import { badgeById, levelFor } from '../../progress/gamification'
import {
  buildDailyPlan,
  minutesPracticedOn,
  retentionScore,
  selfEstimateAccuracy,
  type DailyPlanItem,
} from '../../progress/reducer'
import { useProgressStore } from '../../state/progressStore'
import type { ProgressSnapshot } from '../../progress/types'
import { LevelBar, Meter, Pill, Stars, tempoText } from '../components/Indicators'
import type { Navigate } from '../navigation'

/** Where a session starts: what to play today, and what has been earned so far. */
export function Dashboard({ onNavigate }: { onNavigate: Navigate }) {
  const snapshot = useProgressStore((store) => store.snapshot)
  const today = new Date()

  const unlocked = unlockedExercises(snapshot.exercises)
  const plan = buildDailyPlan(snapshot, unlocked, today)
  const minutes = minutesPracticedOn(snapshot.history, today)
  const goal = snapshot.profile.dailyGoalMinutes

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="page-head">
        <div>
          <h1>Today</h1>
          <p>
            {plan.length === 0
              ? 'Nothing is waiting. Pick anything from the path.'
              : 'Reviews first, then what is already underway, then one new thing.'}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => onNavigate('practice', { exerciseId: plan[0]?.exercise.id })}
        >
          {minutes > 0 ? 'Keep going' : 'Start practising'}
        </button>
      </div>

      <div className="grid grid-3">
        <div className="card stack">
          <span className="stat-label">Daily goal</span>
          <span className="stat-value">
            {minutes}
            <span className="small faint"> / {goal} min</span>
          </span>
          <Meter fraction={minutes / goal} good={minutes >= goal} />
        </div>

        <div className="card stack">
          <span className="stat-label">Streak</span>
          <span className="stat-value">
            {snapshot.profile.streak.current}
            <span className="small faint"> days</span>
          </span>
          <span className="tiny faint">
            Longest {snapshot.profile.streak.longest} · {snapshot.profile.streak.freezes} missed
            days covered
          </span>
        </div>

        <div className="card stack">
          <span className="stat-label">Level</span>
          <span className="stat-value">{levelFor(snapshot.profile.xp)}</span>
          <LevelBar xp={snapshot.profile.xp} />
        </div>
      </div>

      <Retention snapshot={snapshot} today={today} />

      <div className="card">
        <h3>Practise this</h3>
        {plan.length === 0 ? (
          <p className="muted small">Nothing due. Anything on the path is fair game.</p>
        ) : (
          <ul className="clean">
            {plan.map((item) => (
              <PlanRow key={item.exercise.id} item={item} onNavigate={onNavigate} />
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h3>Where you are</h3>
          <ul className="clean">
            {LESSONS.slice(0, 5).map((lesson) => {
              const done = lesson.exerciseIds.filter(
                (id) => (snapshot.exercises[id]?.bestStars ?? 0) > 0,
              ).length
              return (
                <li key={lesson.id} className="stack" style={{ gap: 4 }}>
                  <div className="row-between small">
                    <span>{lesson.title}</span>
                    <span className="faint mono tiny">
                      {done}/{lesson.exerciseIds.length}
                    </span>
                  </div>
                  <Meter
                    fraction={
                      lesson.exerciseIds.length === 0 ? 1 : done / lesson.exerciseIds.length
                    }
                  />
                </li>
              )
            })}
          </ul>
          <button
            type="button"
            className="btn btn-sm"
            style={{ marginTop: 14 }}
            onClick={() => onNavigate('path')}
          >
            See the whole path
          </button>
        </div>

        <div className="card">
          <h3>Earned</h3>
          {snapshot.profile.badges.length === 0 ? (
            <p className="muted small">Finish a take and the first one appears.</p>
          ) : (
            <div className="row wrap" style={{ gap: 8 }}>
              {snapshot.profile.badges.map((id) => {
                const badge = badgeById(id)
                return badge ? (
                  <Pill key={id} tone="warn">
                    <span title={badge.description}>{badge.name}</span>
                  </Pill>
                ) : null
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * The figure worth trusting, and the one the app reports as progress.
 *
 * Accuracy measured with the highway scrolling, the fretboard marked and the
 * live note on screen is inflated by exactly that help. A retention check is
 * the same music with all of it switched off.
 */
function Retention({ snapshot, today }: { snapshot: ProgressSnapshot; today: Date }) {
  const score = retentionScore(snapshot.history, today)
  const reading = selfEstimateAccuracy(snapshot.history)

  return (
    <div className="card">
      <div className="row-between wrap" style={{ gap: 16 }}>
        <div className="stat">
          <span className="stat-value">
            {score === null ? <span className="faint">not yet</span> : score}
          </span>
          <span className="stat-label">Retention, last 14 days</span>
        </div>
        <div className="stat">
          <span className="stat-value">
            {reading === null ? (
              <span className="faint">not yet</span>
            ) : (
              `${Math.round(reading * 100)}%`
            )}
          </span>
          <span className="stat-label">Reading your own timing</span>
        </div>
        <p className="small muted" style={{ flex: 1, minWidth: 260, margin: 0 }}>
          {score === null
            ? 'Tick "retention check" on a take to play it with every cue hidden. That score is the one worth watching, because it is what you can do without the app helping.'
            : 'Scored from takes played with the cues hidden. In-practice accuracy is flattered by the help on screen; this is not.'}
        </p>
      </div>
    </div>
  )
}

function PlanRow({ item, onNavigate }: { item: DailyPlanItem; onNavigate: Navigate }) {
  const snapshot = useProgressStore((store) => store.snapshot)
  const stars = snapshot.exercises[item.exercise.id]?.bestStars ?? 0

  return (
    <li>
      <button
        type="button"
        className="list-item"
        onClick={() => onNavigate('practice', { exerciseId: item.exercise.id })}
      >
        <span className="stack" style={{ gap: 2 }}>
          <span>{item.exercise.title}</span>
          <span className="tiny faint">{reasonText(item)}</span>
        </span>
        <span className="row" style={{ gap: 12 }}>
          <Stars value={stars} label={false} />
          <span className="tiny faint mono">{tempoText(item.exercise)}</span>
        </span>
      </button>
    </li>
  )
}

function reasonText(item: DailyPlanItem): string {
  if (item.reason === 'due-review') {
    return item.overdueDays > 0 ? `Review, ${item.overdueDays} days overdue` : 'Review, due today'
  }
  if (item.reason === 'in-progress') return 'Already started'
  return 'New'
}

/**
 * A lesson opens once everything it requires has at least one star, so the plan
 * never offers something the learner has no grounding for.
 */
function unlockedExercises(exercises: Record<string, { bestStars: number }>) {
  const starred = (id: string): boolean => (exercises[id]?.bestStars ?? 0) > 0
  const open = new Set<string>()

  for (const lesson of LESSONS) {
    const ready = lesson.requires.every((id) => {
      const required = lessonById(id)
      return required ? required.exerciseIds.every(starred) : true
    })
    if (ready) lesson.exerciseIds.forEach((id) => open.add(id))
  }

  return ALL_EXERCISES.filter((exercise) => open.has(exercise.id))
}
