// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { clear as clearStoredProgress } from 'idb-keyval'
import { App } from '../../src/ui/App'
import { useProgressStore } from '../../src/state/progressStore'
import { createSnapshot } from '../../src/progress/reducer'

/**
 * Does it render at all, and does every screen survive being opened with an
 * empty progress store?
 *
 * This is the layer that had no coverage, and it is where a first-run crash
 * would live: an undefined lookup, an empty array indexed at zero, a hook that
 * assumes a take has happened.
 */

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

async function openApp() {
  const user = userEvent.setup()
  render(<App />)
  await waitFor(() => expect(useProgressStore.getState().loaded).toBe(true))
  return user
}

describe('first run', () => {
  it('renders without crashing', async () => {
    await openApp()
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('opens on today', async () => {
    await openApp()
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument()
  })

  it('offers a way to start practising', async () => {
    await openApp()
    expect(screen.getByRole('button', { name: /start practising/i })).toBeInTheDocument()
  })

  it('says the app is not listening yet', async () => {
    await openApp()
    expect(screen.getByText(/not listening/i)).toBeInTheDocument()
  })

  it('shows a daily goal of zero minutes rather than nothing', async () => {
    await openApp()
    const goal = screen.getByText('Daily goal').closest('.card')
    expect(within(goal as HTMLElement).getByText(/0/)).toBeInTheDocument()
  })

  it('explains the retention figure before there is one', async () => {
    await openApp()
    expect(screen.getByText(/retention check/i)).toBeInTheDocument()
  })

  it('offers something to practise even with no history', async () => {
    await openApp()
    const plan = screen.getByRole('heading', { name: 'Practise this' }).closest('.card')
    expect(within(plan as HTMLElement).getAllByRole('button').length).toBeGreaterThan(0)
  })
})

describe('navigation', () => {
  it.each([
    { label: 'The path', heading: 'The path' },
    { label: 'Songs', heading: 'Songs' },
    { label: 'Setup', heading: 'Setup' },
    { label: 'Settings', heading: 'Settings' },
    { label: 'Today', heading: 'Today' },
  ])('opens $label without crashing', async ({ label, heading }) => {
    const user = await openApp()
    await user.click(screen.getByRole('button', { name: label }))
    expect(screen.getByRole('heading', { name: heading, level: 1 })).toBeInTheDocument()
  })

  it('marks the open screen in the sidebar', async () => {
    const user = await openApp()
    await user.click(screen.getByRole('button', { name: 'Songs' }))
    expect(screen.getByRole('button', { name: 'Songs' })).toHaveAttribute('aria-current', 'page')
  })

  it('reaches practice from the daily plan', async () => {
    const user = await openApp()
    const plan = screen.getByRole('heading', { name: 'Practise this' }).closest('.card')
    const first = within(plan as HTMLElement).getAllByRole('button')[0]
    await user.click(first)
    expect(screen.getByText(/go to setup/i)).toBeInTheDocument()
  })
})

describe('the path', () => {
  it('lists every unit', async () => {
    const user = await openApp()
    await user.click(screen.getByRole('button', { name: 'The path' }))
    for (const unit of ['Foundations', 'Fundamentals', 'Playing music', 'The songs']) {
      expect(screen.getByRole('heading', { name: unit })).toBeInTheDocument()
    }
  })

  it('locks lessons whose prerequisites are unmet', async () => {
    const user = await openApp()
    await user.click(screen.getByRole('button', { name: 'The path' }))
    expect(screen.getAllByText('locked').length).toBeGreaterThan(0)
  })

  it('leaves the first lesson open', async () => {
    const user = await openApp()
    await user.click(screen.getByRole('button', { name: 'The path' }))
    const first = screen.getByRole('heading', { name: 'Get set up' }).closest('.card')
    expect(within(first as HTMLElement).queryByText('locked')).toBeNull()
  })
})

describe('songs', () => {
  it('shows both target songs', async () => {
    const user = await openApp()
    await user.click(screen.getByRole('button', { name: 'Songs' }))
    expect(screen.getByRole('button', { name: 'Angel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'This Is the Christ' })).toBeInTheDocument()
  })

  it('opens on the easier song, which is the one a beginner can finish', async () => {
    const user = await openApp()
    await user.click(screen.getByRole('button', { name: 'Songs' }))
    expect(screen.getByRole('heading', { name: 'Angel' })).toBeInTheDocument()
  })

  it('draws the chart for the song it opens on', async () => {
    const user = await openApp()
    await user.click(screen.getByRole('button', { name: 'Songs' }))
    expect(document.querySelectorAll('[data-bar]').length).toBeGreaterThan(0)
  })

  it('keeps the fixed-width tab available for printing', async () => {
    const user = await openApp()
    await user.click(screen.getByRole('button', { name: 'Songs' }))
    expect(document.querySelector('pre')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Printable' }))
    expect(document.querySelector('pre')?.textContent).toContain('G |')
  })

  it('switches song without crashing', async () => {
    const user = await openApp()
    await user.click(screen.getByRole('button', { name: 'Songs' }))
    await user.click(screen.getByRole('button', { name: 'This Is the Christ' }))
    expect(screen.getByRole('heading', { name: 'This Is the Christ' })).toBeInTheDocument()
  })

  it('switches arrangement without crashing', async () => {
    const user = await openApp()
    await user.click(screen.getByRole('button', { name: 'Songs' }))
    await user.click(screen.getByRole('button', { name: 'Angel' }))
    await user.click(screen.getByRole('button', { name: 'Full riff' }))
    expect(document.querySelectorAll('[data-bar]').length).toBeGreaterThan(0)
  })

  it('states where the notes came from', async () => {
    const user = await openApp()
    await user.click(screen.getByRole('button', { name: 'Songs' }))
    expect(
      screen.getByRole('heading', { name: /where these notes came from/i }),
    ).toBeInTheDocument()
  })
})

describe('settings', () => {
  it('changes the daily goal', async () => {
    const user = await openApp()
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.click(screen.getByRole('button', { name: '30 min' }))
    expect(useProgressStore.getState().snapshot.profile.dailyGoalMinutes).toBe(30)
  })

  it('asks before deleting progress', async () => {
    const user = await openApp()
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.click(screen.getByRole('button', { name: /reset progress/i }))
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument()
  })

  it('does not delete progress when the confirmation is cancelled', async () => {
    const user = await openApp()
    useProgressStore.setState((state) => ({
      snapshot: { ...state.snapshot, profile: { ...state.snapshot.profile, xp: 500 } },
    }))
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.click(screen.getByRole('button', { name: /reset progress/i }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(useProgressStore.getState().snapshot.profile.xp).toBe(500)
  })

  it('reports which coach is answering', async () => {
    const user = await openApp()
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await waitFor(() => expect(screen.getByText(/built-in coach|AI coach/i)).toBeInTheDocument())
  })
})

describe('setup', () => {
  it('offers to start listening', async () => {
    const user = await openApp()
    await user.click(screen.getByRole('button', { name: 'Setup' }))
    expect(screen.getByRole('button', { name: /start listening/i })).toBeInTheDocument()
  })

  it('tells the player the tuner needs the input running', async () => {
    const user = await openApp()
    await user.click(screen.getByRole('button', { name: 'Setup' }))
    expect(screen.getByText(/start listening to use the tuner/i)).toBeInTheDocument()
  })

  it('disables latency measurement until the input is running', async () => {
    const user = await openApp()
    await user.click(screen.getByRole('button', { name: 'Setup' }))
    expect(screen.getByRole('button', { name: /measure latency/i })).toBeDisabled()
  })
})
