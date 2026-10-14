import { useEffect } from 'react'

/**
 * Moves a playhead across a rendered tab chart, in step with the take.
 *
 * The beat arrives about 47 times a second. Pushing it through React state
 * would re-render the whole chart on every frame (RC3), so the beat stays in a
 * ref and this writes the two attributes that change straight to the DOM.
 *
 * Each note element carries its own absolute start and end beat, so the loop
 * does not need the music, only the clock.
 */

interface Marked {
  element: HTMLElement
  startBeat: number
  endBeat: number
}

export function useTabPlayhead(
  root: React.RefObject<HTMLElement>,
  beatRef: React.MutableRefObject<number> | undefined,
  running: boolean,
): void {
  useEffect(() => {
    const container = root.current
    if (!container || !beatRef) return

    const notes = readNotes(container)
    if (notes.length === 0) return

    if (!running) {
      clear(notes)
      return
    }

    let frame = 0
    const draw = (): void => {
      paint(notes, beatRef.current)
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frame)
      clear(notes)
    }
  }, [root, beatRef, running])
}

function readNotes(container: HTMLElement): Marked[] {
  return [...container.querySelectorAll<HTMLElement>('[data-start-beat]')].map((element) => ({
    element,
    startBeat: Number(element.dataset.startBeat),
    endBeat: Number(element.dataset.endBeat),
  }))
}

/**
 * `--played` is how far into the note the clock is, which fills the line that
 * shows how long it is held. Writing it only for the note being played keeps
 * this to a couple of DOM writes a frame rather than one per note.
 */
function paint(notes: Marked[], beat: number): void {
  for (const note of notes) {
    const state = stateOf(note, beat)
    if (note.element.dataset.state !== state) note.element.dataset.state = state
    if (state === 'playing') {
      const through = (beat - note.startBeat) / Math.max(0.001, note.endBeat - note.startBeat)
      note.element.style.setProperty('--played', clamp01(through).toFixed(3))
    } else if (note.element.style.getPropertyValue('--played') !== '') {
      note.element.style.removeProperty('--played')
    }
  }
}

function stateOf(note: Marked, beat: number): string {
  if (beat >= note.endBeat) return 'played'
  if (beat >= note.startBeat) return 'playing'
  return 'ahead'
}

function clear(notes: Marked[]): void {
  for (const note of notes) {
    delete note.element.dataset.state
    note.element.style.removeProperty('--played')
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}
