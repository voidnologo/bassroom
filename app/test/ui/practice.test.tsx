// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { clear as clearStoredProgress } from 'idb-keyval'
import { App } from '../../src/ui/App'
import { useProgressStore } from '../../src/state/progressStore'
import { createSnapshot } from '../../src/progress/reducer'
import { parseNote } from '../../src/music/notes'
import { exerciseById } from '../../src/content/curriculum'
import { expandRepeats } from '../../src/engine/PracticeSession'
import type { Exercise } from '../../src/music/types'
import { FakeAudioEngine } from '../support/fakeEngine'
import { ALL_EXERCISES } from '../../src/content/curriculum'
import { createExerciseProgress } from '../../src/progress/reducer'
import type { ProgressSnapshot } from '../../src/progress/types'

/**
 * A whole take, from pressing start to the coach answering.
 *
 * This is the path that only runs when a bass is plugged in, so it is the one
 * most likely to break unnoticed.
 */

const WAIT = { timeout: 4000 }

beforeEach(async () => {
  // The store persists to IndexedDB, and fake-indexeddb keeps it between tests
  // in a file. Without this, `load()` restores the previous test's progress.
  await clearStoredProgress()
  useProgressStore.setState({
    snapshot: createSnapshot(new Date()),
    loaded: false,
    storageError: null,
  })
})

/** Every exercise starred, so a lesson behind a prerequisite can be opened. */
function withEverythingUnlocked(): ProgressSnapshot {
  const now = new Date()
  const snapshot = createSnapshot(now)
  for (const exercise of ALL_EXERCISES) {
    snapshot.exercises[exercise.id] = { ...createExerciseProgress(exercise, now), bestStars: 1 }
  }
  return snapshot
}

async function openPractice(exerciseId = 'open-strings-quarter', unlockAll = false) {
  const engine = new FakeAudioEngine('running')
  const user = userEvent.setup()
  if (unlockAll) useProgressStore.setState({ snapshot: withEverythingUnlocked() })
  render(<App engine={engine} />)
  await waitFor(() => expect(useProgressStore.getState().loaded).toBe(true))

  await user.click(screen.getByRole('button', { name: 'The path' }))
  const exercise = exerciseById(exerciseId)!
  await user.click(screen.getByRole('button', { name: new RegExp(exercise.title, 'i') }))
  return { engine, user, exercise }
}

/**
 * Play the exercise exactly as written, on the beat, then run the clock out.
 * Derived from the exercise rather than hard-coded, so this keeps working when
 * the content changes.
 */
async function playPerfectly(engine: FakeAudioEngine, exercise: Exercise) {
  const targets = expandRepeats(exercise)
  const lastBeat = targets[targets.length - 1].startBeat
  await act(async () => {
    engine.clock.tickTo(0)
    for (const target of targets) {
      engine.playNote({ time: engine.clock.bodyBeatToTime(target.startBeat), midi: target.midi })
    }
    engine.clock.tickTo(lastBeat + 4)
  })
}

describe('the practice screen with the input running', () => {
  it('shows the exercise rather than the setup prompt', async () => {
    const { exercise } = await openPractice()
    expect(screen.getByRole('heading', { name: exercise.title, level: 1 })).toBeInTheDocument()
    expect(screen.queryByText(/go to setup/i)).toBeNull()
  })

  it('offers to start a take', async () => {
    await openPractice()
    expect(screen.getByRole('button', { name: /start take/i })).toBeInTheDocument()
  })

  it('starts in the count-in', async () => {
    const { user } = await openPractice()
    await user.click(screen.getByRole('button', { name: /start take/i }))
    expect(screen.getByText('counting in')).toBeInTheDocument()
  })

  it('turns the start button into a stop button', async () => {
    const { user } = await openPractice()
    await user.click(screen.getByRole('button', { name: /start take/i }))
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()
  })

  it('locks the tempo slider while a take is running', async () => {
    const { user } = await openPractice()
    await user.click(screen.getByRole('button', { name: /start take/i }))
    expect(screen.getByLabelText('Tempo')).toBeDisabled()
  })

  it('asks the player to read their own timing before showing the result', async () => {
    const { engine, user, exercise } = await openPractice()
    await user.click(screen.getByRole('button', { name: /start take/i }))
    await playPerfectly(engine, exercise)

    await waitFor(() => expect(screen.getByText(/how was your timing/i)).toBeInTheDocument(), WAIT)
    expect(screen.queryByRole('heading', { name: 'That take' })).toBeNull()
  })

  it('shows the result once the estimate is given', async () => {
    const { engine, user, exercise } = await openPractice()
    await user.click(screen.getByRole('button', { name: /start take/i }))
    await playPerfectly(engine, exercise)

    await waitFor(() => expect(screen.getByText(/how was your timing/i)).toBeInTheDocument(), WAIT)
    await user.click(screen.getByRole('button', { name: /on it/i }))
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'That take' })).toBeInTheDocument(),
    )
  })

  it('scores a note-perfect take at full marks', async () => {
    const { engine, user, exercise } = await openPractice()
    await user.click(screen.getByRole('button', { name: /start take/i }))
    await playPerfectly(engine, exercise)

    await waitFor(() => expect(screen.getByText(/how was your timing/i)).toBeInTheDocument(), WAIT)
    await user.click(screen.getByRole('button', { name: /on it/i }))

    const result = await screen.findByRole('heading', { name: 'That take' })
    const card = result.closest('.card') as HTMLElement
    expect(within(card).getByText('100')).toBeInTheDocument()
  })

  it('records the attempt against the learner progress', async () => {
    const { engine, user, exercise } = await openPractice()
    await user.click(screen.getByRole('button', { name: /start take/i }))
    await playPerfectly(engine, exercise)

    await waitFor(() => expect(screen.getByText(/how was your timing/i)).toBeInTheDocument(), WAIT)
    await user.click(screen.getByRole('button', { name: /on it/i }))

    await waitFor(() => {
      expect(useProgressStore.getState().snapshot.history).toHaveLength(1)
    })
    expect(useProgressStore.getState().snapshot.profile.xp).toBeGreaterThan(0)
  })

  it('answers with coaching', async () => {
    const { engine, user, exercise } = await openPractice()
    await user.click(screen.getByRole('button', { name: /start take/i }))
    await playPerfectly(engine, exercise)

    await waitFor(() => expect(screen.getByText(/how was your timing/i)).toBeInTheDocument(), WAIT)
    await user.click(screen.getByRole('button', { name: /on it/i }))

    await waitFor(
      () => expect(screen.getByRole('heading', { name: 'Coach' })).toBeInTheDocument(),
      WAIT,
    )
    expect(screen.getByText(/do this next/i)).toBeInTheDocument()
  })

  it('awards the first badge for a first take', async () => {
    const { engine, user, exercise } = await openPractice()
    await user.click(screen.getByRole('button', { name: /start take/i }))
    await playPerfectly(engine, exercise)

    await waitFor(() => expect(screen.getByText(/how was your timing/i)).toBeInTheDocument(), WAIT)
    await user.click(screen.getByRole('button', { name: /on it/i }))

    await waitFor(() => {
      expect(useProgressStore.getState().snapshot.profile.badges).toContain('first-note')
    })
  })

  it('disposes the beat clock when the take ends', async () => {
    const { engine, user, exercise } = await openPractice()
    await user.click(screen.getByRole('button', { name: /start take/i }))
    await playPerfectly(engine, exercise)

    await waitFor(() => expect(engine.clock.disposed).toBe(true), WAIT)
  })

  it('leaves nothing subscribed to the audio input after a take', async () => {
    const { engine, user, exercise } = await openPractice()
    await user.click(screen.getByRole('button', { name: /start take/i }))
    await playPerfectly(engine, exercise)

    await waitFor(() => expect(screen.getByText(/how was your timing/i)).toBeInTheDocument(), WAIT)
    // One listener remains: the live pitch readout, which is not part of a take.
    expect(engine.pitchListenerCount).toBe(1)
    expect(engine.onsetListenerCount).toBe(0)
  })

  it('can be stopped partway and still reports', async () => {
    const { engine, user } = await openPractice()
    await user.click(screen.getByRole('button', { name: /start take/i }))
    await act(async () => {
      engine.clock.tickTo(0)
      engine.playNote({ time: engine.clock.bodyBeatToTime(0), midi: parseNote('E1') })
    })
    await user.click(screen.getByRole('button', { name: 'Stop' }))
    await waitFor(() => expect(screen.getByText(/how was your timing/i)).toBeInTheDocument(), WAIT)
  })

  it('runs a second take without carrying the first one over', async () => {
    const { engine, user, exercise } = await openPractice()

    for (let take = 0; take < 2; take++) {
      await user.click(screen.getByRole('button', { name: /start take/i }))
      await playPerfectly(engine, exercise)
      await waitFor(
        () => expect(screen.getByText(/how was your timing/i)).toBeInTheDocument(),
        WAIT,
      )
      await user.click(screen.getByRole('button', { name: /on it/i }))
      await waitFor(
        () => expect(screen.getByRole('button', { name: /start take/i })).toBeInTheDocument(),
        WAIT,
      )
    }

    await waitFor(() => expect(useProgressStore.getState().snapshot.history).toHaveLength(2))
  })
})

describe('a call-and-response exercise', () => {
  it('advances through prompts as notes are recognised', async () => {
    const { engine, user } = await openPractice('open-string-find')
    await user.click(screen.getByRole('button', { name: /start take/i }))

    await act(async () => {
      for (let i = 0; i < 4; i++) engine.emitPitch({ time: 1 + i * 0.02, midi: parseNote('E1') })
    })
    await waitFor(() =>
      expect(document.querySelector('.target-note .name')).toHaveTextContent('A1'),
    )
  })

  it('does not ask for a timing estimate, because there is no clock', async () => {
    const { engine, user } = await openPractice('open-string-find')
    await user.click(screen.getByRole('button', { name: /start take/i }))

    const prompts = ['E1', 'A1', 'D2', 'G2', 'A1', 'E1', 'G2', 'D2'].map(parseNote)
    await act(async () => {
      prompts.forEach((midi, index) => {
        for (let i = 0; i < 4; i++) engine.emitPitch({ time: index + i * 0.02, midi })
      })
    })

    await waitFor(
      () => expect(screen.getByRole('heading', { name: 'That take' })).toBeInTheDocument(),
      WAIT,
    )
    expect(screen.queryByText(/how was your timing/i)).toBeNull()
  })
})

describe('an exercise whose point is reading the notation', () => {
  it('shows the chart it is asking the learner to read', async () => {
    await openPractice('tab-open-strings', true)
    await waitFor(
      () => expect(screen.getByRole('heading', { name: 'The chart' })).toBeInTheDocument(),
      WAIT,
    )
    expect(document.querySelectorAll('[data-bar]')).toHaveLength(4)
  })

  it('draws a fret number for every note the exercise asks for', async () => {
    await openPractice('tab-read-angel', true)
    await waitFor(
      () => expect(screen.getByRole('heading', { name: 'The chart' })).toBeInTheDocument(),
      WAIT,
    )
    const exercise = exerciseById('tab-read-angel')!
    expect(document.querySelectorAll('[data-fret]')).toHaveLength(exercise.notes.length)
  })

  it('is left off an exercise that is not about reading', async () => {
    await openPractice('open-strings-quarter')
    await waitFor(
      () => expect(screen.getByRole('button', { name: /start take/i })).toBeInTheDocument(),
      WAIT,
    )
    expect(screen.queryByRole('heading', { name: 'The chart' })).toBeNull()
  })
})
