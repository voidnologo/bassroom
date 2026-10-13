import { useEffect, useRef } from 'react'
import { STANDARD_TUNING, STRING_LABELS } from '../../music/fretboard'
import { pitchClassName } from '../../music/notes'
import type { TargetNote } from '../../music/types'
import type { Verdict } from '../../engine/judge'

/**
 * Notes approaching a now-line, one lane per string.
 *
 * Drawn on a canvas and fed the current beat through a ref rather than React
 * state: the beat advances with the audio clock at frame rate, and re-rendering
 * a component tree that often would spend the whole frame budget on
 * reconciliation instead of on drawing.
 */

export interface NoteHighwayProps {
  notes: TargetNote[]
  /** Live position in body beats. Negative during the count-in. */
  beatRef: React.MutableRefObject<number>
  /** Verdicts by note index, filled in as the take is judged. */
  verdictsRef: React.MutableRefObject<Map<number, Verdict>>
  beatsPerBar: number
  /** How much music is visible ahead of the now-line. */
  beatsAhead?: number
  height?: number
  running: boolean
}

const LANE_PADDING = 26
const NOW_LINE_FRACTION = 0.22
const NOTE_HEIGHT = 20

const VERDICT_COLOURS: Record<Verdict, string> = {
  perfect: '#46d39a',
  good: '#4cc2ff',
  early: '#f2c14e',
  late: '#f2c14e',
  'wrong-pitch': '#f2695c',
  missed: '#5c6a7e',
  extra: '#f2695c',
}

export function NoteHighway({
  notes,
  beatRef,
  verdictsRef,
  beatsPerBar,
  beatsAhead = 8,
  height = 190,
  running,
}: NoteHighwayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const context = canvas.getContext('2d')
    if (!context) return

    const draw = (): void => {
      const { width, height: cssHeight } = fitToDisplay(canvas, context)
      paint(context, {
        width,
        height: cssHeight,
        notes,
        beat: beatRef.current,
        verdicts: verdictsRef.current,
        beatsPerBar,
        beatsAhead,
      })
      frameRef.current = requestAnimationFrame(draw)
    }

    frameRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frameRef.current)
  }, [notes, beatRef, verdictsRef, beatsPerBar, beatsAhead, running])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height, display: 'block', borderRadius: 'var(--radius)' }}
      role="img"
      aria-label={`${notes.length} notes on a scrolling timeline, one lane per string`}
    />
  )
}

/** Size the backing store for the display, so the drawing is not blurry. */
function fitToDisplay(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
): { width: number; height: number } {
  const ratio = window.devicePixelRatio || 1
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
    canvas.width = width * ratio
    canvas.height = height * ratio
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  return { width, height }
}

interface PaintOptions {
  width: number
  height: number
  notes: TargetNote[]
  beat: number
  verdicts: Map<number, Verdict>
  beatsPerBar: number
  beatsAhead: number
}

function paint(context: CanvasRenderingContext2D, options: PaintOptions): void {
  const { width, height, beat, beatsAhead } = options
  context.clearRect(0, 0, width, height)
  context.fillStyle = '#0a0d12'
  context.fillRect(0, 0, width, height)

  const nowX = width * NOW_LINE_FRACTION
  const pixelsPerBeat = (width - nowX) / beatsAhead
  const laneHeight = (height - LANE_PADDING * 2) / (STANDARD_TUNING.length - 1)
  const yOf = (string: number): number => height - LANE_PADDING - string * laneHeight

  drawLanes(context, { width, yOf, laneHeight })
  drawBarLines(context, { ...options, nowX, pixelsPerBeat })
  drawNotes(context, { ...options, nowX, pixelsPerBeat, yOf })
  drawNowLine(context, { height, nowX, beat })
}

function drawLanes(
  context: CanvasRenderingContext2D,
  options: { width: number; yOf: (string: number) => number; laneHeight: number },
): void {
  context.font = '600 11px var(--mono, monospace)'
  for (let string = 0; string < STANDARD_TUNING.length; string++) {
    const y = options.yOf(string)
    context.strokeStyle = '#1d242e'
    context.lineWidth = 1
    context.beginPath()
    context.moveTo(30, y)
    context.lineTo(options.width, y)
    context.stroke()

    context.fillStyle = '#5c6a7e'
    context.fillText(STRING_LABELS[string], 10, y + 4)
  }
}

function drawBarLines(
  context: CanvasRenderingContext2D,
  options: PaintOptions & { nowX: number; pixelsPerBeat: number },
): void {
  const { beat, beatsPerBar, beatsAhead, nowX, pixelsPerBeat, height } = options
  const firstBar = Math.floor(beat / beatsPerBar) - 1
  const lastBar = Math.ceil((beat + beatsAhead) / beatsPerBar)

  context.strokeStyle = '#232c38'
  context.lineWidth = 1
  for (let bar = firstBar; bar <= lastBar; bar++) {
    const x = nowX + (bar * beatsPerBar - beat) * pixelsPerBeat
    if (x < 0 || x > options.width) continue
    context.beginPath()
    context.moveTo(x, 8)
    context.lineTo(x, height - 8)
    context.stroke()
  }
}

function drawNotes(
  context: CanvasRenderingContext2D,
  options: PaintOptions & { nowX: number; pixelsPerBeat: number; yOf: (s: number) => number },
): void {
  const { notes, beat, beatsAhead, nowX, pixelsPerBeat, yOf, verdicts } = options
  context.font = '600 12px var(--mono, monospace)'
  context.textAlign = 'center'

  notes.forEach((note, index) => {
    const offset = note.startBeat - beat
    if (offset < -2 || offset > beatsAhead + 1) return

    const x = nowX + offset * pixelsPerBeat
    const noteWidth = Math.max(14, note.durationBeats * pixelsPerBeat - 3)
    const string = note.position?.string ?? 0
    const y = yOf(string) - NOTE_HEIGHT / 2

    const verdict = verdicts.get(index)
    context.fillStyle = verdict ? VERDICT_COLOURS[verdict] : '#2f6f93'
    roundedRect(context, { x, y, width: noteWidth, height: NOTE_HEIGHT, radius: 5 })
    context.fill()

    // A note arriving at the now-line gets an outline, so the moment to play it
    // is marked by shape as well as by position.
    if (Math.abs(offset) < 0.12) {
      context.strokeStyle = '#e7edf5'
      context.lineWidth = 2
      context.stroke()
    }

    context.fillStyle = '#eaf4fb'
    const label = note.position ? String(note.position.fret) : pitchClassName(note.midi)
    context.fillText(label, x + noteWidth / 2, y + NOTE_HEIGHT - 6)
  })
  context.textAlign = 'left'
}

function drawNowLine(
  context: CanvasRenderingContext2D,
  options: { height: number; nowX: number; beat: number },
): void {
  const { height, nowX, beat } = options
  context.strokeStyle = beat < 0 ? '#f2c14e' : '#4cc2ff'
  context.lineWidth = 2
  context.beginPath()
  context.moveTo(nowX, 4)
  context.lineTo(nowX, height - 4)
  context.stroke()
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
  radius: number
}

function roundedRect(context: CanvasRenderingContext2D, rect: Rect): void {
  const { x, y, width, height, radius } = rect
  context.beginPath()
  context.moveTo(x + radius, y)
  context.arcTo(x + width, y, x + width, y + height, radius)
  context.arcTo(x + width, y + height, x, y + height, radius)
  context.arcTo(x, y + height, x, y, radius)
  context.arcTo(x, y, x + width, y, radius)
  context.closePath()
}
