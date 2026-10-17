import { useEffect, useRef } from 'react'
import { STANDARD_TUNING, STRING_LABELS } from '../../music/fretboard'
import { pitchClassName } from '../../music/notes'
import { barPositionAt, type MeterChange } from '../../music/meter'
import type { TargetNote, TimeSignature } from '../../music/types'
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
  meterChanges?: MeterChange[]
  /** Beats of count-in, drawn as a countdown running into the start line. */
  countInBeats: number
  /**
   * Body beat the written music ends on. Passed rather than read from `notes`
   * because a retention check hides the notes and still has to show the end.
   */
  endBeat: number
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
 * The playhead, matching `--playhead` in the stylesheet. A canvas cannot read
 * a custom property, so the value is repeated here and the two have to move
 * together.
 */
const PLAYHEAD = '#ff9542'

/**
 * A canvas font is parsed as a standalone CSS shorthand with no element to
 * resolve against, so `var(--mono)` is silently discarded and the context keeps
 * its 10px default. The stack is written out for that reason.
 */
/** `--good` and `--bad` in the stylesheet; a canvas cannot read a custom property. */
const START_LINE = '#46d39a'
const END_LINE = '#f2695c'

const COUNT_IN_TICK = '#2a3340'
const COUNT_IN_TEXT = '#5c6a7e'

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
  meterChanges,
  countInBeats,
  endBeat,
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
        meterChanges,
        countInBeats,
        endBeat,
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
  }, [
    notes,
    beatRef,
    verdictsRef,
    beatsPerBar,
    meterChanges,
    countInBeats,
    endBeat,
    beatsAhead,
    running,
  ])

  return (
    <canvas
      ref={canvasRef}
      className="highway"
      style={{ height }}
      role="img"
      aria-label={`${notes.length} notes on a scrolling timeline, one lane per string, marked where the music starts and ends`}
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
  meterChanges?: MeterChange[]
  countInBeats: number
  endBeat: number
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
  drawCountIn(context, options, geometry)
  drawBounds(context, options, geometry)
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
  const { beat, beatsPerBar, meterChanges, beatsAhead, height, width } = options
  const signature: TimeSignature = [beatsPerBar, 4]

  context.strokeStyle = '#232c38'
  context.lineWidth = 1
  // Walked beat by beat rather than divided, because the bar length can change
  // partway through the music.
  for (
    let candidate = Math.floor(beat) - beatsPerBar;
    candidate <= beat + beatsAhead;
    candidate++
  ) {
    if (candidate < 0) continue
    if (barPositionAt(candidate, signature, meterChanges).beatInBar !== 1) continue
    const x = geometry.nowX + (candidate - beat) * geometry.pixelsPerBeat
    if (x < 0 || x > width) continue
    context.beginPath()
    context.moveTo(x, 8)
    context.lineTo(x, height - 8)
    context.stroke()
  }
}

/**
 * The count-in beats still to come. A tick is dropped once it reaches the
 * now-line, so the countdown burns down to where the music starts.
 */
export function visibleCountInBeats(
  countInBeats: number,
  beat: number,
  beatsAhead: number,
): number[] {
  const ticks: number[] = []
  for (let tick = -countInBeats; tick < 0; tick++) {
    if (tick >= beat && tick <= beat + beatsAhead) ticks.push(tick)
  }
  return ticks
}

function drawCountIn(
  context: CanvasRenderingContext2D,
  options: PaintOptions,
  geometry: Geometry,
): void {
  const { beat, beatsAhead, countInBeats, height, width } = options
  context.font = LANE_FONT
  context.textAlign = 'center'
  for (const tick of visibleCountInBeats(countInBeats, beat, beatsAhead)) {
    const x = geometry.nowX + (tick - beat) * geometry.pixelsPerBeat
    if (x >= 0 && x <= width) drawCountInTick(context, { x, count: -tick, height })
  }
  context.textAlign = 'left'
}

function drawCountInTick(
  context: CanvasRenderingContext2D,
  spec: { x: number; count: number; height: number },
): void {
  const { x, count, height } = spec
  context.strokeStyle = COUNT_IN_TICK
  context.lineWidth = 1
  context.beginPath()
  context.moveTo(x, 24)
  context.lineTo(x, height - 24)
  context.stroke()

  context.fillStyle = COUNT_IN_TEXT
  context.fillText(String(count), x, 16)
}

/** Where the music starts and where it ends, in the same space as the notes. */
function drawBounds(
  context: CanvasRenderingContext2D,
  options: PaintOptions,
  geometry: Geometry,
): void {
  const { beat, endBeat, height, width } = options
  const xOf = (target: number): number => geometry.nowX + (target - beat) * geometry.pixelsPerBeat
  drawBound(context, { x: xOf(0), label: 'start', colour: START_LINE, height, width })
  drawBound(context, { x: xOf(endBeat), label: 'end', colour: END_LINE, height, width })
}

interface BoundSpec {
  x: number
  label: string
  colour: string
  height: number
  width: number
}

function drawBound(context: CanvasRenderingContext2D, spec: BoundSpec): void {
  const { x, label, colour, height, width } = spec
  if (x < 0 || x > width) return

  context.strokeStyle = colour
  context.lineWidth = 2
  context.beginPath()
  context.moveTo(x, 6)
  context.lineTo(x, height - 6)
  context.stroke()

  context.font = LANE_FONT
  context.textAlign = 'center'
  context.fillStyle = colour
  context.fillText(label, x, height - 8)
  context.textAlign = 'left'
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
    drawNote(context, geometry, { note, offset, beat, verdict: verdicts.get(index) })
  })
  context.textAlign = 'left'
}

interface NoteSpec {
  note: TargetNote
  /** Beats until the note reaches the now-line; negative once it has passed. */
  offset: number
  beat: number
  verdict: Verdict | undefined
}

function drawNote(context: CanvasRenderingContext2D, geometry: Geometry, spec: NoteSpec): void {
  const { note, offset, beat, verdict } = spec
  const x = geometry.nowX + offset * geometry.pixelsPerBeat
  const width = Math.max(16, note.durationBeats * geometry.pixelsPerBeat - 3)
  const lane = note.position ? note.position.string : 0
  const y = geometry.yOf(lane) - NOTE_HEIGHT / 2 + laneOffsetFor(verdict)
  const rect = { x, y, width, height: NOTE_HEIGHT }

  context.fillStyle = verdict ? VERDICT_COLOURS[verdict] : '#2f6f93'
  traceRoundedRect(context, rect)
  context.fill()

  const playing = isUnderTheLine(note, beat, verdict)
  if (playing) fillPassed(context, rect, geometry.nowX)

  // No outline on the arriving note. It fired within 0.12 beats of the line
  // while the fill and the chart below both change exactly on the beat, so it
  // read as the two displays ticking at different moments.

  // One colour for the whole of a note's life on screen, so the only thing
  // that changes as it crosses the line is the fill behind it. A verdict only
  // arrives once the take is over, so this cannot flip mid-note.
  context.fillStyle = verdict ? '#0a0d12' : '#eaf4fb'
  const label = note.position ? String(note.position.fret) : pitchClassName(note.midi)
  context.fillText(label, x + width / 2, y + NOTE_HEIGHT - 7)
}

function laneOffsetFor(verdict: Verdict | undefined): number {
  return verdict ? (VERDICT_LANE_OFFSET[verdict] ?? 0) : 0
}

/** A note is under the line from its start until its written length is up. */
export function isUnderTheLine(
  note: TargetNote,
  beat: number,
  verdict: Verdict | undefined,
): boolean {
  if (verdict) return false
  return beat >= note.startBeat && beat < note.startBeat + note.durationBeats
}

/** How much of a note lies left of the now-line, and so has been played. */
export function passedWidth(x: number, width: number, nowX: number): number {
  return Math.max(0, Math.min(nowX, x + width) - x)
}

/**
 * Fills the part of a note that has already gone past the now-line. The
 * boundary is the line itself, so this shows where the note actually is rather
 * than being an animation timed to look like it.
 */
function fillPassed(
  context: CanvasRenderingContext2D,
  rect: { x: number; y: number; width: number; height: number },
  nowX: number,
): void {
  const passed = passedWidth(rect.x, rect.width, nowX)
  if (passed <= 0) return
  context.save()
  traceRoundedRect(context, rect)
  context.clip()
  context.fillStyle = PLAYHEAD
  context.fillRect(rect.x, rect.y, passed, rect.height)
  context.restore()
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
