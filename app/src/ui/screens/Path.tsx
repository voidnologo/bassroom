import { LESSONS, UNITS, exerciseById, lessonById } from '../../content/curriculum'
import type { Lesson } from '../../music/types'
import { useProgressStore } from '../../state/progressStore'
import { Meter, Pill, Stars, tempoText } from '../components/Indicators'
import type { Navigate } from '../navigation'

/** The whole curriculum, in order, with what is open and what is not. */
export function Path({ onNavigate }: { onNavigate: Navigate }) {
  const exercises = useProgressStore((store) => store.snapshot.exercises)
  const starsOf = (id: string): number => exercises[id]?.bestStars ?? 0
  const isOpen = (lesson: Lesson): boolean =>
    lesson.requires.every((id) => {
      const required = lessonById(id)
      return required ? required.exerciseIds.every((exerciseId) => starsOf(exerciseId) > 0) : true
    })

  return (
    <div className="stack" style={{ gap: 22 }}>
      <div className="page-head">
        <div>
          <h1>The path</h1>
          <p>
            Each unit adds one demand at a time. Material from both songs appears as early as it can
            be played, so the work is always visibly going somewhere.
          </p>
        </div>
      </div>

      {UNITS.map((unit) => (
        <section key={unit.id}>
          <h2>{unit.title}</h2>
          <p className="muted small" style={{ marginBottom: 12 }}>
            {unit.description}
          </p>
          <div className="stack" style={{ gap: 12 }}>
            {unit.lessonIds.map((lessonId) => {
              const lesson = LESSONS.find((candidate) => candidate.id === lessonId)
              if (!lesson) return null
              return (
                <LessonCard
                  key={lesson.id}
                  lesson={lesson}
                  open={isOpen(lesson)}
                  starsOf={starsOf}
                  onNavigate={onNavigate}
                />
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

function LessonCard({
  lesson,
  open,
  starsOf,
  onNavigate,
}: {
  lesson: Lesson
  open: boolean
  starsOf: (id: string) => number
  onNavigate: Navigate
}) {
  const started = lesson.exerciseIds.filter((id) => starsOf(id) > 0).length
  const readingOnly = lesson.exerciseIds.length === 0
  const fraction = readingOnly ? 0 : started / lesson.exerciseIds.length

  return (
    <div className="card" style={{ opacity: open ? 1 : 0.72 }}>
      <div className="row-between wrap" style={{ marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>{lesson.title}</h3>
        <div className="row" style={{ gap: 10 }}>
          {!open && <Pill>locked</Pill>}
          <span className="tiny faint mono">
            {readingOnly ? 'nothing to play' : `${started}/${lesson.exerciseIds.length}`} · ~
            {lesson.estimatedMinutes} min
          </span>
        </div>
      </div>

      <p className="small muted">{lesson.summary}</p>
      {/* A lesson with nothing to play showed a full bar, which read as done
          before anything had happened. */}
      {!readingOnly && <Meter fraction={fraction} good={fraction === 1} />}

      <details style={{ marginTop: 12 }}>
        <summary className="small muted" style={{ cursor: 'pointer' }}>
          What this lesson is about
        </summary>
        <ul className="clean small muted" style={{ marginTop: 10 }}>
          {lesson.briefing.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details>

      {lesson.exerciseIds.length > 0 && (
        <ul className="clean" style={{ marginTop: 14 }}>
          {lesson.exerciseIds.map((id) => {
            const exercise = exerciseById(id)
            if (!exercise) return null
            return (
              <li key={id}>
                <button
                  type="button"
                  className="list-item"
                  disabled={!open}
                  data-locked={!open}
                  onClick={() => onNavigate('practice', { exerciseId: id })}
                >
                  <span className="stack" style={{ gap: 2 }}>
                    <span>{exercise.title}</span>
                    <span className="tiny faint">
                      {tempoText(exercise)} · {exercise.skills.join(', ')}
                    </span>
                  </span>
                  <Stars value={starsOf(id) as 0 | 1 | 2 | 3} label={false} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
