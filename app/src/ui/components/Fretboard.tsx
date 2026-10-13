import { useMemo } from 'react'
import {
  DOUBLE_DOT_FRETS,
  SINGLE_DOT_FRETS,
  STANDARD_TUNING,
  STRING_LABELS,
  positionsFor,
  type Position,
} from '../../music/fretboard'
import { noteName, pitchClassName } from '../../music/notes'

/**
 * The neck, drawn as the player sees it: thickest string at the bottom.
 *
 * Frets are evenly spaced rather than scaled like a real neck. Real spacing
 * compresses the upper frets to a few pixels each, and this diagram is read from
 * a few feet away by someone holding an instrument.
 */

export interface FretboardProps {
  /** Where the exercise wants the next note played. */
  target?: Position | null
  /** Fretting finger to suggest, drawn inside the target marker. */
  finger?: 1 | 2 | 3 | 4 | null
  detectedMidi?: number | null
  detectedCents?: number
  firstFret?: number
  fretCount?: number
  showNoteNames?: boolean
}

const VIEW_WIDTH = 920
const VIEW_HEIGHT = 230
const NUT_X = 56
const TOP = 34
const BOTTOM = VIEW_HEIGHT - 42

/** Geometry shared by every layer, computed once per render. */
interface Layout {
  firstFret: number
  fretCount: number
  fretWidth: number
  laneHeight: number
  xOf: (fret: number) => number
  yOf: (string: number) => number
  frets: number[]
}

function useLayout(firstFret: number, fretCount: number): Layout {
  return useMemo(() => {
    const laneHeight = (BOTTOM - TOP) / (STANDARD_TUNING.length - 1)
    const fretWidth = (VIEW_WIDTH - NUT_X - 24) / fretCount
    return {
      firstFret,
      fretCount,
      fretWidth,
      laneHeight,
      // Fret 0 sits on the nut rather than in a fret space.
      xOf: (fret) => (fret === 0 ? NUT_X - 18 : NUT_X + (fret - firstFret - 0.5) * fretWidth),
      yOf: (string) => BOTTOM - string * laneHeight,
      frets: Array.from({ length: fretCount + 1 }, (_, index) => firstFret + index),
    }
  }, [firstFret, fretCount])
}

/**
 * Defaults are resolved in one place rather than as seven parameter defaults,
 * which each count as a branch and push the component past its budget for no
 * gain in clarity.
 */
function withDefaults(props: FretboardProps): Required<FretboardProps> {
  return {
    target: props.target ?? null,
    finger: props.finger ?? null,
    detectedMidi: props.detectedMidi ?? null,
    detectedCents: props.detectedCents ?? 0,
    firstFret: props.firstFret ?? 0,
    fretCount: props.fretCount ?? 12,
    showNoteNames: props.showNoteNames ?? false,
  }
}

export function Fretboard(props: FretboardProps) {
  const { target, finger, detectedMidi, detectedCents, firstFret, fretCount, showNoteNames } =
    withDefaults(props)
  const layout = useLayout(firstFret, fretCount)
  const detectedPositions = useMemo(
    () => (detectedMidi === null ? [] : positionsFor(detectedMidi)),
    [detectedMidi],
  )
  const isRight = detectedMidi !== null && target !== null && detectedMidi === midiOf(target)

  return (
    <svg
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      width="100%"
      role="img"
      aria-label={describe(target, detectedMidi)}
    >
      <rect
        x={NUT_X}
        y={TOP - 14}
        width={VIEW_WIDTH - NUT_X - 24}
        height={BOTTOM - TOP + 28}
        rx="4"
        fill="var(--fretboard)"
      />
      <FretLines layout={layout} />
      <InlayDots layout={layout} />
      <Strings layout={layout} />
      {showNoteNames && <NoteNames layout={layout} />}
      <HeardPositions positions={detectedPositions} layout={layout} correct={isRight} />
      {target && <TargetMarker target={target} finger={finger} layout={layout} correct={isRight} />}
      {detectedMidi !== null && (
        <text x={VIEW_WIDTH - 24} y={18} className="heard-label">
          {noteName(detectedMidi)} {formatCents(detectedCents)}
        </text>
      )}
      <FretboardStyles />
    </svg>
  )
}

function FretLines({ layout }: { layout: Layout }) {
  return (
    <>
      {layout.frets.map((fret, index) => {
        const isNut = index === 0 && layout.firstFret === 0
        const x = NUT_X + index * layout.fretWidth
        return (
          <g key={fret}>
            <line
              x1={x}
              y1={TOP - 14}
              x2={x}
              y2={BOTTOM + 14}
              stroke={isNut ? '#d8dee8' : 'var(--border-strong)'}
              strokeWidth={isNut ? 5 : 2}
            />
            {index > 0 && (
              <text x={x - layout.fretWidth / 2} y={VIEW_HEIGHT - 12} className="fret-number">
                {fret}
              </text>
            )}
          </g>
        )
      })}
    </>
  )
}

function InlayDots({ layout }: { layout: Layout }) {
  const middle = (TOP + BOTTOM) / 2
  return (
    <>
      {layout.frets.slice(1).flatMap((fret, index) => {
        const offsets = offsetsFor(fret, layout.laneHeight)
        const x = NUT_X + (index + 0.5) * layout.fretWidth
        return offsets.map((offset) => (
          <circle key={`${fret}-${offset}`} cx={x} cy={middle + offset} r="6" fill="#4a382c" />
        ))
      })}
    </>
  )
}

function Strings({ layout }: { layout: Layout }) {
  return (
    <>
      {STANDARD_TUNING.map((_, string) => (
        <g key={string}>
          <line
            x1={NUT_X}
            y1={layout.yOf(string)}
            x2={VIEW_WIDTH - 24}
            y2={layout.yOf(string)}
            stroke="var(--string)"
            strokeWidth={1.2 + (STANDARD_TUNING.length - 1 - string) * 0.9}
          />
          <text x={NUT_X - 40} y={layout.yOf(string) + 5} className="string-label">
            {STRING_LABELS[string]}
          </text>
        </g>
      ))}
    </>
  )
}

function NoteNames({ layout }: { layout: Layout }) {
  return (
    <>
      {layout.frets.flatMap((fret) =>
        STANDARD_TUNING.map((open, string) => (
          <text
            key={`${string}-${fret}`}
            x={layout.xOf(fret)}
            y={layout.yOf(string) - 7}
            className="fret-note-name"
          >
            {pitchClassName(open + fret)}
          </text>
        )),
      )}
    </>
  )
}

function HeardPositions({
  positions,
  layout,
  correct,
}: {
  positions: Position[]
  layout: Layout
  correct: boolean
}) {
  return (
    <>
      {positions.map((position) => (
        <circle
          key={`heard-${position.string}-${position.fret}`}
          cx={layout.xOf(position.fret)}
          cy={layout.yOf(position.string)}
          r="13"
          fill="none"
          stroke={correct ? 'var(--good)' : 'var(--bad)'}
          strokeWidth="2"
          strokeDasharray="3 3"
        />
      ))}
    </>
  )
}

function TargetMarker({
  target,
  finger,
  layout,
  correct,
}: {
  target: Position
  finger: 1 | 2 | 3 | 4 | null
  layout: Layout
  correct: boolean
}) {
  return (
    <g>
      <circle
        cx={layout.xOf(target.fret)}
        cy={layout.yOf(target.string)}
        r="17"
        fill={correct ? 'var(--good)' : 'var(--accent)'}
        stroke="#06121a"
        strokeWidth="2"
      />
      <text x={layout.xOf(target.fret)} y={layout.yOf(target.string) + 6} className="target-marker">
        {finger ?? (target.fret === 0 ? '0' : '')}
      </text>
    </g>
  )
}

function FretboardStyles() {
  return (
    <style>{`
      .fret-number { fill: var(--text-faint); font-size: 12px; text-anchor: middle; font-family: var(--mono); }
      .string-label { fill: var(--text-muted); font-size: 14px; font-weight: 600; text-anchor: middle; }
      .fret-note-name { fill: #7a6a5c; font-size: 10px; text-anchor: middle; font-family: var(--mono); }
      .target-marker { fill: #06121a; font-size: 15px; font-weight: 700; text-anchor: middle; }
      .heard-label { fill: var(--text-muted); font-size: 13px; text-anchor: end; font-family: var(--mono); }
    `}</style>
  )
}

function offsetsFor(fret: number, laneHeight: number): number[] {
  if (DOUBLE_DOT_FRETS.includes(fret)) return [-laneHeight * 0.7, laneHeight * 0.7]
  if (SINGLE_DOT_FRETS.includes(fret)) return [0]
  return []
}

function midiOf(position: Position): number {
  return STANDARD_TUNING[position.string] + position.fret
}

function formatCents(cents: number): string {
  if (Math.abs(cents) < 5) return 'in tune'
  return `${cents > 0 ? '+' : ''}${Math.round(cents)}c`
}

function describe(target: Position | null, detectedMidi: number | null): string {
  const wanted = target
    ? `Play ${STRING_LABELS[target.string]} string${target.fret === 0 ? ' open' : `, fret ${target.fret}`}.`
    : 'Bass fretboard.'
  const heard = detectedMidi === null ? 'Nothing heard.' : `Hearing ${noteName(detectedMidi)}.`
  return `${wanted} ${heard}`
}
