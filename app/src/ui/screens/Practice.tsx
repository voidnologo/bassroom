import { useEffect, useMemo, useState } from 'react'
import { ALL_EXERCISES, exerciseById } from '../../content/curriculum'
import { describePosition, preferredPosition, type Position } from '../../music/fretboard'
import { noteName } from '../../music/notes'
import type { Exercise, TargetNote } from '../../music/types'
import type { PerformanceScore, Verdict } from '../../engine/judge'
import { starRequirementText, starsFor, type Star } from '../../engine/tempoLadder'
import type { AttemptResult } from '../../progress/reducer'
import { progressFor } from '../../progress/reducer'
import type { ExerciseProgress } from '../../progress/types'
import { useProgressStore } from '../../state/progressStore'
import { useAudio } from '../../state/AudioProvider'
import { CoachPanel } from '../components/CoachPanel'
import { Fretboard } from '../components/Fretboard'
import { BeatDots, Meter, Pill, Stars, VerdictStrip } from '../components/Indicators'
import { NoteHighway } from '../components/NoteHighway'
import { usePracticeTake, type TakeState } from '../hooks/usePracticeTake'

/**
 * The screen the learner spends their practice on: what to play, where it is on
 * the neck, whether it was right, and what to do next.
 */
export function Practice({
  exerciseId,
  onNavigate,
}: {
  exerciseId: string
  onNavigate: (screen: string, exerciseId?: string) => void
}) {
  const exercise = exerciseById(exerciseId) ?? ALL_EXERCISES[0]
  const snapshot = useProgressStore((store) => store.snapshot)
  const { state: engineState } = useAudio()

  const progress = useMemo(() => progressFor(snapshot, exercise, new Date()), [snapshot, exercise])
  const [bpm, setBpm] = useState(progress.ladder.currentBpm)
  useEffect(() => setBpm(progress.ladder.currentBpm), [exercise.id, progress.ladder.currentBpm])

  const { take, targets, beatRef, verdictsRef, start, stop, ready } = usePracticeTake(exercise, bpm)

  if (!ready) return <NotListening state={engineState} onNavigate={onNavigate} />

  const handleCoachAction = (action: { bpm?: number; kind: string }): void => {
    if (action.bpm) setBpm(action.bpm)
    if (action.kind === 'switch-exercise') onNavigate('path')
    else start()
  }

  return (
    <div className="stack" style={{ gap: 18 }}>
      <Header exercise={exercise} progress={progress} />

      <Stage
        exercise={exercise}
        take={take}
        targets={targets}
        beatRef={beatRef}
        verdictsRef={verdictsRef}
        bpm={bpm}
        onBpm={setBpm}
        onStart={start}
        onStop={stop}
      />

      {take.lastResult && take.lastAttempt && (
        <Result
          exercise={exercise}
          bpm={take.lastResult.bpm}
          score={take.lastResult.score}
          verdicts={take.lastResult.judgments.map((judgment) => judgment.verdict)}
          attempt={take.lastAttempt}
        />
      )}

      <CoachPanel
        feedback={take.feedback}
        pending={take.coachPending}
        onAct={(feedback) => handleCoachAction(feedback.nextAction)}
      />

      <Tips tips={exercise.tips} />
    </div>
  )
}

function Header({ exercise, progress }: { exercise: Exercise; progress: ExerciseProgress }) {
  return (
    <div className="page-head">
      <div>
        <h1>{exercise.title}</h1>
        <p>{exercise.instructions}</p>
      </div>
      <div className="stack" style={{ alignItems: 'flex-end', gap: 6 }}>
        <Stars value={progress.bestStars} />
        <span className="tiny faint">
          Next: {starRequirementText(nextStar(progress.bestStars))}
        </span>
      </div>
    </div>
  )
}

interface StageProps {
  exercise: Exercise
  take: TakeState
  targets: TargetNote[]
  beatRef: React.MutableRefObject<number>
  verdictsRef: React.MutableRefObject<Map<number, Verdict>>
  bpm: number
  onBpm: (bpm: number) => void
  onStart: () => void
  onStop: () => void
}

const RUNNING_PHASES = new Set(['count-in', 'playing', 'judging'])

/** Call and response advances note by note; a play-along follows the clock. */
function currentPrompt(props: StageProps): TargetNote | undefined {
  const { exercise, take, targets, beatRef } = props
  if (exercise.mode === 'call-response') return targets[take.promptIndex]
  return nextTarget(targets, beatRef.current)
}

function Stage(props: StageProps) {
  const { exercise, take, targets, beatRef, verdictsRef } = props
  const running = RUNNING_PHASES.has(take.phase)
  const prompt = currentPrompt(props)
  const position = positionOf(prompt)

  return (
    <div className="practice-stage stack" style={{ gap: 16 }}>
      <div className="row-between wrap">
        <div className="target-note">
          <span className="name">{prompt ? noteName(prompt.midi) : '—'}</span>
          <span className="where">{whereText(position, prompt)}</span>
        </div>
        <div className="stack" style={{ alignItems: 'flex-end', gap: 6 }}>
          <BeatDots beatsPerBar={exercise.timeSignature[0]} current={take.beatInBar} />
          <span className="tiny faint mono">{hearingText(take)}</span>
        </div>
      </div>

      <Fretboard
        target={position}
        finger={prompt?.finger ?? null}
        detectedMidi={take.heard?.midi ?? null}
        detectedCents={take.heard?.cents ?? 0}
        fretCount={fretWindowFor(targets)}
      />

      {exercise.mode !== 'call-response' && (
        <NoteHighway
          notes={targets}
          beatRef={beatRef}
          verdictsRef={verdictsRef}
          beatsPerBar={exercise.timeSignature[0]}
          running={running}
        />
      )}

      <TransportBar {...props} running={running} />
    </div>
  )
}

function TransportBar({
  exercise,
  bpm,
  onBpm,
  running,
  take,
  onStart,
  onStop,
}: StageProps & { running: boolean }) {
  const percentOfTarget = Math.round((bpm / exercise.targetBpm) * 100)
  return (
    <div className="row-between wrap" style={{ gap: 18 }}>
      <div className="row" style={{ gap: 12 }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={running ? onStop : onStart}
          style={{ minWidth: 130 }}
        >
          {running ? 'Stop' : 'Start take'}
        </button>
        <Pill tone={take.phase === 'count-in' ? 'warn' : 'plain'}>{phaseLabel(take.phase)}</Pill>
      </div>

      <div className="stack" style={{ flex: 1, minWidth: 260, gap: 4 }}>
        <div className="row-between tiny muted">
          <label htmlFor="tempo">Tempo</label>
          <span className="mono">
            {bpm} bpm · {percentOfTarget}% of {exercise.targetBpm}
          </span>
        </div>
        <input
          id="tempo"
          type="range"
          min={exercise.floorBpm}
          max={Math.round(exercise.targetBpm * 1.1)}
          value={bpm}
          disabled={running}
          onChange={(event) => onBpm(Number(event.target.value))}
        />
      </div>
    </div>
  )
}

function Result({
  exercise,
  bpm,
  score,
  verdicts,
  attempt,
}: {
  exercise: Exercise
  bpm: number
  score: PerformanceScore
  verdicts: Verdict[]
  attempt: AttemptResult
}) {
  return (
    <div className="card">
      <div className="row-between wrap" style={{ marginBottom: 14 }}>
        <h3 style={{ margin: 0 }}>That take</h3>
        <div className="row" style={{ gap: 14 }}>
          <Stars value={starsFor(score, bpm, exercise.targetBpm)} />
          <Pill tone="good">+{attempt.xp.total} XP</Pill>
          {attempt.newBadges.map((badge) => (
            <Pill key={badge} tone="warn">
              new badge
            </Pill>
          ))}
        </div>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 14 }}>
        <Stat label="Overall" value={String(score.overall)} suffix="/100" />
        <Stat label="Right notes" value={`${Math.round(score.pitchAccuracy * 100)}%`} />
        <Stat label="In time" value={`${Math.round(score.timingAccuracy * 100)}%`} />
        <Stat label="Average" value={signed(score.meanTimingErrorMs)} suffix="ms" />
        <Stat label="Steadiness" value={`±${Math.round(score.timingSpreadMs)}`} suffix="ms" />
        <Stat
          label="Missed"
          value={String(score.missedNotes)}
          suffix={`of ${score.totalTargets}`}
        />
      </div>

      <VerdictStrip verdicts={verdicts} />
      <p className="small muted" style={{ marginTop: 12 }}>
        {attempt.ladder.message}
      </p>
      <Meter fraction={score.overall / 100} good={score.overall >= 90} />
    </div>
  )
}

function Tips({ tips }: { tips?: string[] }) {
  if (!tips || tips.length === 0) return null
  return (
    <div className="card">
      <h3>Technique</h3>
      <ul className="clean small muted">
        {tips.map((tip) => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>
    </div>
  )
}

function Stat({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="stat">
      <span className="stat-value">
        {value}
        {suffix && <span className="small faint"> {suffix}</span>}
      </span>
      <span className="stat-label">{label}</span>
    </div>
  )
}

function NotListening({
  state,
  onNavigate,
}: {
  state: string
  onNavigate: (screen: string) => void
}) {
  return (
    <div className="card">
      <h3>Not listening yet</h3>
      <p className="muted">
        The app has to hear the bass before it can judge anything. Connect the interface and start
        the input on the setup screen.
      </p>
      <p className="small faint mono">engine: {state}</p>
      <button type="button" className="btn btn-primary" onClick={() => onNavigate('tuner')}>
        Go to setup
      </button>
    </div>
  )
}

const PHASE_LABELS: Record<string, string> = {
  idle: 'ready',
  'count-in': 'counting in',
  playing: 'playing',
  judging: 'judging',
  finished: 'done',
}

function phaseLabel(phase: string): string {
  return PHASE_LABELS[phase] ?? phase
}

function positionOf(prompt: TargetNote | undefined): Position | null {
  if (!prompt) return null
  return prompt.position ?? preferredPosition(prompt.midi)
}

function whereText(position: Position | null, prompt: TargetNote | undefined): string {
  if (!position) return 'ready'
  const finger = prompt?.finger ? ` · finger ${prompt.finger}` : ''
  return `${describePosition(position)}${finger}`
}

function hearingText(take: TakeState): string {
  const midi = take.heard?.midi
  return midi === null || midi === undefined ? 'listening' : `hearing ${noteName(midi)}`
}

function signed(value: number): string {
  return `${value > 0 ? '+' : ''}${Math.round(value)}`
}

function nextStar(current: Star): Star {
  return Math.min(3, current + 1) as Star
}

/** The next note due, to keep the fretboard one step ahead of the player. */
function nextTarget(targets: TargetNote[], beat: number): TargetNote | undefined {
  return targets.find((note) => note.startBeat >= beat - 0.2) ?? targets[0]
}

/** Enough frets to cover the exercise, with a little room on either side. */
function fretWindowFor(targets: TargetNote[]): number {
  const frets = targets.map((note) => note.position?.fret ?? 0)
  return Math.min(16, Math.max(7, Math.max(...frets, 0) + 2))
}
