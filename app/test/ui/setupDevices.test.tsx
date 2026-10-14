// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clear as clearStoredProgress } from 'idb-keyval'
import { App } from '../../src/ui/App'
import { useProgressStore } from '../../src/state/progressStore'
import { createSnapshot } from '../../src/progress/reducer'

/**
 * The input list used to be populated only once the engine was running, so the
 * first start of every session ran on the system default -- on a laptop, the
 * built-in microphone rather than the interface.
 */

const SCARLETT = {
  kind: 'audioinput',
  deviceId: 'scarlett-id',
  label: 'Scarlett Solo 4th Gen',
}

function stubDevices(devices: unknown[]): void {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { enumerateDevices: vi.fn(async () => devices) },
  })
}

beforeEach(async () => {
  await clearStoredProgress()
  useProgressStore.setState({
    snapshot: createSnapshot(new Date()),
    loaded: false,
    storageError: null,
  })
})

afterEach(() => {
  Reflect.deleteProperty(navigator, 'mediaDevices')
})

async function openSetup() {
  const user = userEvent.setup()
  render(<App />)
  await waitFor(() => expect(useProgressStore.getState().loaded).toBe(true))
  await user.click(screen.getByRole('button', { name: 'Setup' }))
  return user
}

describe('the input device list', () => {
  it('offers the interface before anything has been started', async () => {
    stubDevices([SCARLETT])
    await openSetup()
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Scarlett Solo 4th Gen' })).toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: 'Start listening' })).toBeInTheDocument()
  })

  it('says why the list is empty when the browser is still withholding labels', async () => {
    stubDevices([])
    await openSetup()
    await waitFor(() =>
      expect(screen.getByText(/once the browser has been allowed/i)).toBeInTheDocument(),
    )
  })

  it('drops the unnamed placeholder the browser returns before permission', async () => {
    stubDevices([{ kind: 'audioinput', deviceId: '', label: '' }])
    await openSetup()
    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument())
    const options = screen.getAllByRole('option').map((option) => option.textContent)
    expect(options).toEqual(['Default input'])
  })
})
