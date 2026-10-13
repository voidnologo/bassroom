// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { useOverride } from '../../src/ui/hooks/useOverride'

function Subject({ subject, fallback }: { subject: string; fallback: number }) {
  const [value, choose] = useOverride(subject, fallback)
  return (
    <button type="button" onClick={() => choose(value + 1)}>
      {value}
    </button>
  )
}

function Harness() {
  const [subject, setSubject] = useState('a')
  const [fallback, setFallback] = useState(40)
  return (
    <>
      <Subject subject={subject} fallback={fallback} />
      <button type="button" onClick={() => setFallback(70)}>
        move the fallback
      </button>
      <button type="button" onClick={() => setSubject('b')}>
        change subject
      </button>
    </>
  )
}

describe('useOverride', () => {
  it('reports the fallback until something is chosen', () => {
    render(<Harness />)
    expect(screen.getByRole('button', { name: '40' })).toBeInTheDocument()
  })

  it('keeps the chosen value when the fallback moves underneath it', async () => {
    render(<Harness />)
    await act(async () => screen.getByRole('button', { name: '40' }).click())
    await act(async () => screen.getByRole('button', { name: 'move the fallback' }).click())
    expect(screen.getByRole('button', { name: '41' })).toBeInTheDocument()
  })

  it('forgets the choice once the subject changes', async () => {
    render(<Harness />)
    await act(async () => screen.getByRole('button', { name: '40' }).click())
    await act(async () => screen.getByRole('button', { name: 'change subject' }).click())
    expect(screen.getByRole('button', { name: '40' })).toBeInTheDocument()
  })
})
