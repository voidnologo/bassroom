// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { act, render } from '@testing-library/react'
import { useRef } from 'react'
import { TabChart } from '../../src/ui/components/TabChart'
import { barsFromNotes } from '../../src/music/tab'
import { steady } from '../../src/content/authoring'

const FOUR_FOUR = [4, 4] as const

/** Four quarter notes, so beat N is note N. */
const BARS = barsFromNotes(steady(['A3', 'A3', 'A3', 'A3']), FOUR_FOUR)

function Harness({ beat, running }: { beat: number; running: boolean }) {
  const beatRef = useRef(beat)
  beatRef.current = beat
  return <TabChart bars={BARS} timeSignature={FOUR_FOUR} beatRef={beatRef} running={running} />
}

function states(container: HTMLElement): Array<string | undefined> {
  return [...container.querySelectorAll<HTMLElement>('[data-start-beat]')].map(
    (el) => el.dataset.state,
  )
}

/** The playhead runs on animation frames, so one has to be delivered. */
async function advance(): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(32)
  })
}

afterEach(() => vi.useRealTimers())

describe('the tab playhead', () => {
  it('marks nothing until a take is running', () => {
    const { container } = render(<Harness beat={2.5} running={false} />)
    expect(states(container)).toEqual([undefined, undefined, undefined, undefined])
  })

  it('marks the note under the clock as playing, and the ones before it as played', async () => {
    vi.useFakeTimers()
    const { container } = render(<Harness beat={2.5} running={true} />)
    await advance()
    expect(states(container)).toEqual(['played', 'played', 'playing', 'ahead'])
  })

  it('fills the held-note line by how far into the note the clock is', async () => {
    vi.useFakeTimers()
    const { container } = render(<Harness beat={2.25} running={true} />)
    await advance()
    const playing = container.querySelector<HTMLElement>('[data-state="playing"]')
    expect(playing?.style.getPropertyValue('--played')).toBe('0.250')
  })

  it('leaves every note ahead of a take that has not reached the body', async () => {
    vi.useFakeTimers()
    const { container } = render(<Harness beat={-2} running={true} />)
    await advance()
    expect(states(container)).toEqual(['ahead', 'ahead', 'ahead', 'ahead'])
  })

  it('clears the marks when the take stops, so a finished chart is not left lit', async () => {
    vi.useFakeTimers()
    const { container, rerender } = render(<Harness beat={2.5} running={true} />)
    await advance()
    rerender(<Harness beat={2.5} running={false} />)
    await advance()
    expect(states(container)).toEqual([undefined, undefined, undefined, undefined])
  })
})
