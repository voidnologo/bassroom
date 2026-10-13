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
 * a component tree that often would spend the frame budget on reconciliation
 * instead of on drawing.
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
  /** While false the canvas is painted once and the frame loop stays idle. */
  running: boolean
}

const LANE_PADDING = 26
const NOW_LINE_FRACTION = 0.22
const NOTE_HEIGHT = 22

/**
 * A canvas font is parsed as a standalone CSS shorthand with no element to
 * resolve against, so `var(--mono)` is silently discarded and the context keeps
 * its 10px default. The stack is written out for that reason.
 */
const MONO_STACK = "'JetBrains Mono', ui-monospace, Menlo, monospace"
const LANE_FONT = `600 12px ${MONO_STACK}`
const NOTE_FONT = `600 13px ${MONO_STACK}`

const VERDICT_COLOURS: Record<Verdict, string> = {
  perfect: '#46d39a',
  good: '#4cc2ff',
  early: '#f2c14e',
  late: '#f2c14e',
  'wrong-pitch': '#f2695c',
  missed: '#5c6a7e',
  extra: '#f2695c',
}

/**
 * Early and late share a colour, so they are separated by where the block sits
 * in its lane: a rushed note rides high, a dragged one low. Colour alone would
 * make the two most actionable verdicts indistinguishable.
 */
const VERDICT_LANE_OFFSET: Partial<Record<Verdict, number>> = {
  early: -7,
  late: 7,
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

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    let frame = 0
    let active = true

    const draw = (): void => {
      if (!active) return
      const size = fitToDisplay(canvas, context)
      paint(context, {
        ...size,
        notes,
        beat: beatRef.current,
        verdicts: verdictsRef.current,
        beatsPerBar,
        beatsAhead,
      })
      // Idle takes one paint, not sixty a second: the beat is not moving and
      // nothing on the canvas changes until a take starts.
      if (running) frame = requestAnimationFrame(draw)
    }

    frame = requestAnimationFrame(draw)
    return () => {
      active = false
      cancelAnimationFrame(frame)
    }
  }, [notes, beatRef, verdictsRef, beatsPerBar, beatsAhead, running])

  return (
    <canvas
      ref={canvasRef}
      className="highway"
      style={{ height }}
      role="img"
      aria-label={`${notes.length} notes on a scrolling timeline, one lane per string`}
    />
  )
}

/**
 * Size the backing store for the display. The dimensions are rounded because
 * `canvas.width` is an integer attribute: on a fractional device pixel ratio an
 * unrounded comparison never converges and the store is reallocated - and
 * cleared - on every frame.
 */
function fitToDisplay(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
): { width: number; height: number } {
  const ratio = window.devicePixelRatio || 1
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  const backingWidth = Math.round(width * ratio)
  const backingHeight = Math.round(height * ratio)

  if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
    canvas.width = backingWidth
    canvas.height = backingHeight
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

/** Geometry shared by every layer of one frame. */
interface Geometry {
  nowX: number
  pixelsPerBeat: number
  yOf: (string: number) => number
}

function paint(context: CanvasRenderingContext2D, options: PaintOptions): void {
  const { width, height } = options
  if (width === 0 || height === 0) return

  context.clearRect(0, 0, width, height)
  context.fillStyle = '#0a0d12'
  context.fillRect(0, 0, width, height)

  const nowX = width * NOW_LINE_FRACTION
  const laneHeight = (height - LANE_PADDING * 2) / (STANDARD_TUNING.length - 1)
  const geometry: Geometry = {
    nowX,
    pixelsPerBeat: (width - nowX) / options.beatsAhead,
    yOf: (string) => height - LANE_PADDING - string * laneHeight,
  }

  drawLanes(context, options, geometry)
  drawBarLines(context, options, geometry)
  drawNotes(context, options, geometry)
  drawNowLine(context, options, geometry)
}

function drawLanes(
  context: CanvasRenderingContext2D,
  options: PaintOptions,
  geometry: Geometry,
): void {
  context.font = LANE_FONT
  context.textAlign = 'left'
  for (let string = 0; string < STANDARD_TUNING.length; string++) {
    const y = geometry.yOf(string)
    context.strokeStyle = '#1d242e'
    context.lineWidth = 1
    context.beginPath()
    context.moveTo(30, y)
    context.lineTo(options.width, y)
    context.stroke()

    context.fillStyle = '#6b7a90'
    context.fillText(STRING_LABELS[string], 10, y + 4)
  }
}

function drawBarLines(
  context: CanvasRenderingContext2D,
  options: PaintOptions,
  geometry: Geometry,
): void {
  const { beat, beatsPerBar, beatsAhead, height, width } = options
  const firstBar = Math.floor(beat / beatsPerBar) - 1
  const lastBar = Math.ceil((beat + beatsAhead) / beatsPerBar)

  context.strokeStyle = '#232c38'
  context.lineWidth = 1
  for (let bar = firstBar; bar <= lastBar; bar++) {
    const x = geometry.nowX + (bar * beatsPerBar - beat) * geometry.pixelsPerBeat
    if (x < 0 || x > width) continue
    context.beginPath()
    context.moveTo(x, 8)
    context.lineTo(x, height - 8)
    context.stroke()
  }
}

function drawNotes(
  context: CanvasRenderingContext2D,
  options: PaintOptions,
  geometry: Geometry,
): void {
  const { notes, beat, beatsAhead, verdicts } = options
  context.font = NOTE_FONT
  context.textAlign = 'center'

  notes.forEach((note, index) => {
    const offset = note.startBeat - beat
    if (offset < -2 || offset > beatsAhead + 1) return

    const verdict = verdicts.get(index)
    const x = geometry.nowX + offset * geometry.pixelsPerBeat
    const noteWidth = Math.max(16, note.durationBeats * geometry.pixelsPerBeat - 3)
    const lane = note.position ? note.position.string : 0
    const y =
      geometry.yOf(lane) - NOTE_HEIGHT / 2 + (verdict ? (VERDICT_LANE_OFFSET[verdict] ?? 0) : 0)

    context.fillStyle = verdict ? VERDICT_COLOURS[verdict] : '#2f6f93'
    traceRoundedRect(context, { x, y, width: noteWidth, height: NOTE_HEIGHT })
    context.fill()

    // A note arriving at the now-line gets an outline, so the moment to play it
    // is marked by shape as well as by position.
    if (Math.abs(offset) < 0.12) {
      context.strokeStyle = '#e7edf5'
      context.lineWidth = 2
      context.stroke()
    }

    context.fillStyle = verdict ? '#0a0d12' : '#eaf4fb'
    const label = note.position ? String(note.position.fret) : pitchClassName(note.midi)
    context.fillText(label, x + noteWidth / 2, y + NOTE_HEIGHT - 7)
  })
  context.textAlign = 'left'
}

function drawNowLine(
  context: CanvasRenderingContext2D,
  options: PaintOptions,
  geometry: Geometry,
): void {
  context.strokeStyle = options.beat < 0 ? '#f2c14e' : '#4cc2ff'
  context.lineWidth = 2
  context.beginPath()
  context.moveTo(geometry.nowX, 4)
  context.lineTo(geometry.nowX, options.height - 4)
  context.stroke()
}

const CORNER_RADIUS = 5

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

function traceRoundedRect(context: CanvasRenderingContext2D, rect: Rect): void {
  const { x, y, width, height } = rect
  context.beginPath()
  context.moveTo(x + CORNER_RADIUS, y)
  context.arcTo(x + width, y, x + width, y + height, CORNER_RADIUS)
  context.arcTo(x + width, y + height, x, y + height, CORNER_RADIUS)
  context.arcTo(x, y + height, x, y, CORNER_RADIUS)
  context.arcTo(x, y, x + width, y, CORNER_RADIUS)
  context.closePath()
}
