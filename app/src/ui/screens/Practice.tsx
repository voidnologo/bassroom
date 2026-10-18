import { useEffect, useMemo } from 'react'
import { ALL_EXERCISES, exerciseById } from '../../content/curriculum'
import {
  describePosition,
  fingerName,
  preferredPosition,
  type Position,
} from '../../music/fretboard'
import { countInBeatsOf, isTimed, musicEndBeat } from '../../music/meter'
import { noteName } from '../../music/notes'
import type { Exercise, TargetNote, TimedExercise } from '../../music/types'
import type { NextAction } from '../../coach/types'
import type { PerformanceScore, Verdict } from '../../engine/judge'
import { nextRungBpm, starRequirementText, starsFor, type Star } from '../../engine/tempoLadder'
import type { AttemptResult } from '../../progress/reducer'
import { progressFor } from '../../progress/reducer'
import type { ExerciseProgress } from '../../progress/types'
import { useProgressStore } from '../../state/progressStore'
import { useAudio } from '../../state/AudioProvider'
import { CoachPanel } from '../components/CoachPanel'
import { Fretboard, type FretboardProps } from '../components/Fretboard'
import { BeatDots, Meter, Pill, Stars, VerdictStrip } from '../components/Indicators'
import { NoteHighway } from '../components/NoteHighway'
import { EstimateOutcome, SelfEstimatePrompt } from '../components/SelfEstimate'
import { usePracticeTake, type TakeState } from '../hooks/usePracticeTake'
import { TabChart } from '../components/TabChart'
import { barsFromNotes } from '../../music/tab'
import { useOverride } from '../hooks/useOverride'
import type { Navigate } from '../navigation'

/**
 * The screen the learner spends their practice on: what to play, where it is on
 * the neck, whether it was right, and what to do next.
 */
export function Practice({ exerciseId, onNavigate }: { exerciseId: string; onNavigate: Navigate }) {
  const exercise = exerciseById(exerciseId) ?? ALL_EXERCISES[0]
  const snapshot = useProgressStore((store) => store.snapshot)
  const { state: engineState } = useAudio()

  const progress = useMemo(() => progressFor(snapshot, exercise, new Date()), [snapshot, exercise])
  const [bpm, setBpm] = useOverride<number | null>(exercise.id, progress.ladder?.currentBpm ?? null)

  const [isProbe, setIsProbe] = useOverride(exercise.id, false)

  const { take, targets, beatRef, verdictsRef, start, stop, submitEstimate, ready } =
    usePracticeTake(exercise, bpm, { isProbe, askForEstimate: exercise.mode === 'play-along' })
  const running = RUNNING_PHASES.has(take.phase)

  useTakeShortcut(running, start, stop)

  if (!ready) return <NotListening state={engineState} onNavigate={onNavigate} />

  /** A speed-up with no tempo of its own takes the ladder's next rung. */
  const tempoFor = (action: NextAction): number | null => {
    if (action.bpm !== undefined) return action.bpm
    if (action.kind !== 'speed-up' || !isTimed(exercise) || bpm === null) return bpm
    return Math.min(exercise.targetBpm, nextRungBpm(bpm))
  }

  /** Only the kinds that mean "go again" start a take. */
  const handleCoachAction = (action: NextAction): void => {
    if (action.kind === 'switch-exercise') {
      onNavigate('path')
      return
    }
    if (action.kind === 'rest' || action.kind === 'isolate') return
    // Passed into the take rather than set and read back: a state update does
    // not land before the next line, so the take would run at the tempo the
    // coach had just told the learner to leave.
    const nextBpm = tempoFor(action)
    setBpm(nextBpm)
    start(nextBpm)
  }

  return (
    <div className="stack" style={{ gap: 18 }}>
      <Header exercise={exercise} progress={progress} />

      {take.awaitingEstimate ? (
        <SelfEstimatePrompt onAnswer={submitEstimate} />
      ) : (
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
          isProbe={isProbe}
          onProbe={setIsProbe}
        />
      )}

      {!take.awaitingEstimate && take.lastResult && take.lastAttempt && (
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
          Next: {starRequirementText(nextStar(progress.bestStars), exercise)}
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
  bpm: number | null
  onBpm: (bpm: number) => void
  onStart: (atBpm?: number | null) => void
  onStop: () => void
  isProbe: boolean
  onProbe: (isProbe: boolean) => void
}

const RUNNING_PHASES = new Set(['count-in', 'playing', 'judging'])

/** Call and response advances note by note; a play-along follows the clock. */
function currentPrompt(props: StageProps): TargetNote | undefined {
  const { exercise, take, targets } = props
  const index = exercise.mode === 'call-response' ? take.promptIndex : take.targetIndex
  return targets[index] ?? targets[0]
}

function Stage(props: StageProps) {
  const { exercise, take, targets, beatRef, verdictsRef, isProbe } = props
  const running = RUNNING_PHASES.has(take.phase)
  const prompt = currentPrompt(props)
  const position = positionOf(prompt)
  // During a probe every live cue is withheld, including where the note is.
  const showCues = !isProbe || !running

  return (
    <div className="practice-stage stack" style={{ gap: 16 }}>
      <NowPlaying
        prompt={prompt}
        position={position}
        showCues={showCues}
        take={take}
        exercise={exercise}
        promptCount={targets.length}
      />

      <TransportBar {...props} running={running} />

      <Fretboard {...fretboardPropsFor({ prompt, position, showCues, take, targets })} />

      {/* Flush against the highway rather than below the fold: the two are one
          display, and a glance down to the chart should not cross the page. */}
      <div className="stack" style={{ gap: 0 }}>
        {exercise.mode !== 'call-response' && (
          // Kept mounted during a retention check and fed an empty note list, so
          // the block does not vanish and shift everything below it mid count-in.
          <NoteHighway
            notes={showCues ? targets : []}
            beatRef={beatRef}
            verdictsRef={verdictsRef}
            beatsPerBar={exercise.timeSignature[0]}
            meterChanges={exercise.meterChanges}
            countInBeats={countInBeatsOf(exercise)}
            endBeat={musicEndBeat(targets)}
            running={running}
          />
        )}
        <FollowTheChart
          exercise={exercise}
          targets={targets}
          beatRef={beatRef}
          running={running}
          showCues={showCues}
        />
      </div>
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
  isProbe,
  onProbe,
}: StageProps & { running: boolean }) {
  return (
    <div className="row-between wrap" style={{ gap: 18 }}>
      <div className="row" style={{ gap: 12 }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => (running ? onStop() : onStart())}
          style={{ minWidth: 130 }}
        >
          {running ? 'Stop' : 'Start take'}
        </button>
        <span className="tiny faint">space</span>
        <Pill className="pill-phase" tone={take.phase === 'count-in' ? 'warn' : 'plain'}>
          {phaseLabel(take.phase)}
        </Pill>
        <ProbeToggle checked={isProbe} disabled={running} onChange={onProbe} />
      </div>

      {/* A drill the learner is never asked to play faster has no tempo to set,
          and a slider that changes nothing they are judged on is a wrong cue. */}
      {isTimed(exercise) && bpm !== null && (
        <TempoControl exercise={exercise} bpm={bpm} onBpm={onBpm} disabled={running} />
      )}
    </div>
  )
}

function TempoControl({
  exercise,
  bpm,
  onBpm,
  disabled,
}: {
  exercise: TimedExercise
  bpm: number
  onBpm: (bpm: number) => void
  disabled: boolean
}) {
  const percentOfTarget = Math.round((bpm / exercise.targetBpm) * 100)
  return (
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
        disabled={disabled}
        onChange={(event) => onBpm(Number(event.target.value))}
      />
    </div>
  )
}

/** Everything the neck diagram shows, with the probe case resolved in one place. */
function fretboardPropsFor(options: {
  prompt: TargetNote | undefined
  position: Position | null
  showCues: boolean
  take: TakeState
  targets: TargetNote[]
}): FretboardProps {
  const { prompt, position, showCues, take, targets } = options
  if (!showCues) return { target: null, detectedMidi: null, fretCount: fretWindowFor(targets) }
  return {
    target: position,
    finger: prompt?.finger ?? null,
    detectedMidi: take.heard?.midi ?? null,
    detectedCents: take.heard?.cents ?? 0,
    fretCount: fretWindowFor(targets),
  }
}

function NowPlaying({
  prompt,
  position,
  showCues,
  take,
  exercise,
  promptCount,
}: {
  prompt: TargetNote | undefined
  position: Position | null
  showCues: boolean
  take: TakeState
  exercise: Exercise
  promptCount: number
}) {
  return (
    <div className="row-between wrap">
      <div className="target-note">
        <span className="name">{prompt && showCues ? noteName(prompt.midi) : '—'}</span>
        <span className="where">{showCues ? whereText(position, prompt) : 'retention check'}</span>
      </div>
      <div className="stack" style={{ alignItems: 'flex-end', gap: 6 }}>
        <Pace take={take} exercise={exercise} promptCount={promptCount} />
        <span className="tiny faint mono">{hearingText(take)}</span>
      </div>
    </div>
  )
}

/**
 * Beat dots are a metronome readout. A drill with no metronome has nothing to
 * put in them, and four dots with one lit read as progress through a take that
 * is eight prompts long. What is true there is how many prompts are left.
 */
function Pace({
  take,
  exercise,
  promptCount,
}: {
  take: TakeState
  exercise: Exercise
  promptCount: number
}) {
  if (isTimed(exercise)) {
    return <BeatDots beatsPerBar={exercise.timeSignature[0]} current={take.beatInBar} />
  }
  return (
    <span className="tiny faint mono">
      note {Math.min(take.promptIndex + 1, promptCount)} of {promptCount}
    </span>
  )
}

function ProbeToggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean
  disabled: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="row tiny muted" style={{ gap: 6, cursor: disabled ? 'default' : 'pointer' }}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span title="Play with every cue hidden. This is the score worth trusting.">
        Retention check
      </span>
    </label>
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
  bpm: number | null
  score: PerformanceScore
  verdicts: Verdict[]
  attempt: AttemptResult
}) {
  const timed = isTimed(exercise)
  return (
    <div className="card">
      <div className="row-between wrap" style={{ marginBottom: 14 }}>
        <h3 style={{ margin: 0 }}>That take</h3>
        <div className="row" style={{ gap: 14 }}>
          {attempt.attempt.isProbe && <Pill tone="good">retention check</Pill>}
          <Stars value={starsFor(score, bpm, exercise)} />
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
        <TimingStats score={score} />
        <Stat
          label="Missed"
          value={String(score.missedNotes)}
          suffix={`of ${score.totalTargets}`}
        />
      </div>

      <VerdictStrip verdicts={verdicts} timed={timed} />
      <EstimateOutcome
        guess={attempt.attempt.selfEstimate}
        wasRight={attempt.attempt.estimateWasRight}
      />
      {attempt.ladder && (
        <p className="small muted" style={{ marginTop: 12 }}>
          {attempt.ladder.message}
        </p>
      )}
      <Meter fraction={score.overall / 100} good={score.overall >= 90} />
    </div>
  )
}

/**
 * Nothing at all for a take with no clock. The three figures are null together
 * there, because its notes are recorded at the beat they were asked for and
 * each one would read back the recording rather than anything the learner did.
 */
function TimingStats({ score }: { score: PerformanceScore }) {
  const { timingAccuracy, meanTimingErrorMs, timingSpreadMs } = score
  if (timingAccuracy === null || meanTimingErrorMs === null || timingSpreadMs === null) return null
  return (
    <>
      <Stat label="In time" value={`${Math.round(timingAccuracy * 100)}%`} />
      <Stat label="Average" value={signed(meanTimingErrorMs)} suffix="ms" />
      <Stat label="Steadiness" value={`±${Math.round(timingSpreadMs)}`} suffix="ms" />
    </>
  )
}

/**
 * The chart, with the note being played now marked on it.
 *
 * Sits directly under the highway, close enough to read without looking away
 * from it. The highway shows what is coming; this shows where you are in the
 * music as written, which is what a reader follows.
 */
function FollowTheChart({
  exercise,
  targets,
  beatRef,
  running,
  showCues,
}: {
  exercise: Exercise
  /** Expanded, so a repeated exercise charts every pass the take plays. */
  targets: TargetNote[]
  beatRef: React.MutableRefObject<number>
  running: boolean
  showCues: boolean
}): JSX.Element | null {
  const bars = barsFromNotes(targets, exercise.timeSignature, exercise.meterChanges)
  if (bars.length === 0) return null

  // The chart is a cue like any other. A retention check measures what is
  // played without help, and leaving the music on screen is help.
  if (!showCues) {
    return (
      <p className="small muted chart-hidden">
        Chart hidden for the retention check. It comes back when the take ends.
      </p>
    )
  }

  return (
    <div className="chart-under-highway" aria-label="The chart">
      <TabChart
        bars={bars}
        timeSignature={exercise.timeSignature}
        beatRef={beatRef}
        running={running}
      />
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

function NotListening({ state, onNavigate }: { state: string; onNavigate: Navigate }) {
  return (
    <div className="card">
      <h3>Not listening yet</h3>
      <p className="muted">
        The app has to hear the bass before it can judge anything. Connect the interface and start
        the input on the setup screen.
      </p>
      <p className="small faint mono">engine: {state}</p>
      <button type="button" className="btn btn-primary" onClick={() => onNavigate('setup')}>
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
  const finger = prompt?.finger ? ` · ${fingerName(prompt.finger)} finger` : ''
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

/** Enough frets to cover the exercise, with a little room on either side. */
function fretWindowFor(targets: TargetNote[]): number {
  const frets = targets.map((note) => note.position?.fret ?? 0)
  return Math.min(16, Math.max(7, Math.max(...frets, 0) + 2))
}

/**
 * Space starts and stops a take.
 *
 * The count-in is all the time there is to get both hands back on the
 * instrument, and a player holding a bass has one hand free at most, so
 * reaching for a mouse to start is the wrong shape.
 */
function useTakeShortcut(running: boolean, start: () => void, stop: () => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.code !== 'Space' || event.repeat) return
      const target = event.target as HTMLElement | null
      // Leave the key alone when it belongs to whatever has focus.
      if (target && /^(INPUT|TEXTAREA|BUTTON|SELECT|SUMMARY)$/.test(target.tagName)) return
      event.preventDefault()
      if (running) stop()
      else start()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [running, start, stop])
}
