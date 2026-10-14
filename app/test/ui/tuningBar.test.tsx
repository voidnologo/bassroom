// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TuningBar } from '../../src/ui/components/TuningBar'
import { IN_TUNE_CENTS } from '../../src/music/notes'

function fill(container: HTMLElement): HTMLElement {
  const found = container.querySelector('.tuning-fill')
  if (!(found instanceof HTMLElement)) throw new Error('no fill element rendered')
  return found
}

describe('TuningBar', () => {
  it('fills to the right of centre when the note is sharp', () => {
    const { container } = render(<TuningBar cents={25} />)
    expect(fill(container).style.left).toBe('50%')
    expect(fill(container).style.width).toBe('25%')
  })

  it('fills to the left of centre when the note is flat', () => {
    const { container } = render(<TuningBar cents={-25} />)
    expect(fill(container).style.left).toBe('25%')
    expect(fill(container).style.width).toBe('25%')
  })

  it('puts the same error on the same side whichever way it is signed', () => {
    const { container: sharp } = render(<TuningBar cents={30} />)
    const { container: flat } = render(<TuningBar cents={-30} />)
    expect(fill(sharp).style.width).toBe(fill(flat).style.width)
    expect(fill(sharp).style.left).not.toBe(fill(flat).style.left)
  })

  it('pins the fill at the end rather than running past it', () => {
    const { container } = render(<TuningBar cents={400} />)
    expect(fill(container).style.width).toBe('50%')
    expect(fill(container).style.left).toBe('50%')
  })

  it.each([0, IN_TUNE_CENTS, -IN_TUNE_CENTS])('reads as in tune at %d cents', (cents) => {
    render(<TuningBar cents={cents} />)
    expect(screen.getByText('in tune')).toBeInTheDocument()
  })

  it.each([
    [IN_TUNE_CENTS + 1, 'sharp'],
    [-(IN_TUNE_CENTS + 1), 'flat'],
  ])('names the direction at %d cents', (cents, label) => {
    render(<TuningBar cents={cents} />)
    expect(screen.getByText(label, { selector: '.tuning-state' })).toBeInTheDocument()
  })

  it('states the reading in words, so the bar is not colour alone', () => {
    render(<TuningBar cents={-18} />)
    expect(screen.getByRole('img')).toHaveAccessibleName('18 cents flat, out of 50')
  })

  it('says in tune rather than a cent count when it is close enough', () => {
    render(<TuningBar cents={2} />)
    expect(screen.getByRole('img')).toHaveAccessibleName('In tune')
  })
})
