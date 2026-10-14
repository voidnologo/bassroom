// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { clear as clearStoredProgress } from 'idb-keyval'
import { App } from '../../src/ui/App'
import { useProgressStore } from '../../src/state/progressStore'
import { createSnapshot } from '../../src/progress/reducer'

beforeEach(async () => {
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

function crumbs() {
  return screen.queryByRole('navigation', { name: 'Breadcrumb' })
}

describe('getting back', () => {
  it('offers no trail on a top-level screen, where there is nowhere to go back to', async () => {
    const user = await openApp()
    expect(crumbs()).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Songs' }))
    expect(crumbs()).toBeNull()
  })

  it('returns from practising a song to the song that was open, not the first one', async () => {
    const user = await openApp()
    await user.click(screen.getByRole('button', { name: 'Songs' }))
    await user.click(screen.getByRole('button', { name: 'Angel' }))
    await user.click(screen.getByRole('button', { name: /Angel — the pulse/ }))

    await waitFor(() => expect(crumbs()).not.toBeNull())
    const back = within(crumbs() as HTMLElement).getByRole('button', { name: /Back to Angel/ })
    await user.click(back)

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Songs' })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Angel' })).toHaveClass('btn-primary')
  })

  it('names the trail by what is being looked at, not by the screen', async () => {
    const user = await openApp()
    await user.click(screen.getByRole('button', { name: 'The path' }))
    await user.click(screen.getByRole('button', { name: /Find each string/ }))
    await waitFor(() => expect(crumbs()).not.toBeNull())
    const trail = within(crumbs() as HTMLElement)
      .getAllByRole('listitem')
      .map((item) => item.textContent)
    expect(trail).toEqual(['The path', 'Find each string'])
  })

  it('does not stack a history nobody walked when the sidebar is used', async () => {
    const user = await openApp()
    await user.click(screen.getByRole('button', { name: 'The path' }))
    await user.click(screen.getByRole('button', { name: 'Songs' }))
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    expect(crumbs()).toBeNull()
  })
})
