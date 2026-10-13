import { describe, expect, it } from 'vitest'
import {
  DiagnosticsRecorder,
  MAX_RECORDED_FRAMES,
  type FrameSample,
} from '../../src/audio/diagnostics'
import type { OnsetEvent, PitchFrame } from '../../src/audio/contracts'

const NOW = new Date('2026-10-13T19:00:00Z')

function frame(overrides: Partial<PitchFrame> = {}): PitchFrame {
  return {
    time: 1.234567,
    windowSeconds: 0.128,
    frequency: 41.203456,
    clarity: 0.876543,
    rms: 0.012345,
    midi: 28,
    cents: -3.456,
    ...overrides,
  }
}

function onset(overrides: Partial<OnsetEvent> = {}): OnsetEvent {
  return { time: 2.5, level: 0.4, riseRatio: 3.25, ...overrides }
}

function take(recorder: DiagnosticsRecorder) {
  return recorder.build({ kind: 'take', now: NOW })
}

describe('DiagnosticsRecorder', () => {
  it('keeps the clarity behind each frame, which the take telemetry never sees', () => {
    const recorder = new DiagnosticsRecorder()
    recorder.addFrame(frame({ clarity: 0.42 }))
    expect(take(recorder).frames[0].clarity).toBe(0.42)
  })

  it('rounds a frame enough to halve the body without losing a cent', () => {
    const recorder = new DiagnosticsRecorder()
    recorder.addFrame(frame())
    const recorded: FrameSample = take(recorder).frames[0]
    expect(recorded.frequency).toBe(41.2)
    expect(recorded.cents).toBe(-3.5)
    expect(recorded.clarity).toBe(0.877)
  })

  it('records the rise ratio an onset cleared, for tuning the threshold', () => {
    const recorder = new DiagnosticsRecorder()
    recorder.addOnset(onset({ riseRatio: 2.125 }))
    expect(take(recorder).onsets[0].riseRatio).toBe(2.13)
  })

  it('writes an attack out of silence as -1, because JSON has no Infinity', () => {
    const recorder = new DiagnosticsRecorder()
    recorder.addOnset(onset({ riseRatio: Infinity }))
    expect(take(recorder).onsets[0].riseRatio).toBe(-1)
  })

  it('stops buffering at the cap rather than growing until the post is refused', () => {
    const recorder = new DiagnosticsRecorder()
    for (let i = 0; i <= MAX_RECORDED_FRAMES; i++) recorder.addFrame(frame({ time: i }))
    const record = take(recorder)
    expect(record.frames).toHaveLength(MAX_RECORDED_FRAMES)
    expect(record.framesDropped).toBe(1)
  })

  it('ties the record to the take telemetry it belongs beside', () => {
    const recorder = new DiagnosticsRecorder()
    const record = recorder.build({ kind: 'take', now: NOW, takeId: 'abc', exerciseId: 'pulse' })
    expect(record.takeId).toBe('abc')
    expect(record.exerciseId).toBe('pulse')
  })

  it('carries the individual calibration taps, which the app otherwise discards', () => {
    const recorder = new DiagnosticsRecorder()
    const record = recorder.build({
      kind: 'calibration',
      now: NOW,
      calibration: { tapOffsetsMs: [21, 24, 23], offsetMs: 23, spreadMs: 2, quality: 'good' },
    })
    expect(record.calibration?.tapOffsetsMs).toEqual([21, 24, 23])
  })

  it('forgets everything on reset, so one take cannot leak into the next', () => {
    const recorder = new DiagnosticsRecorder()
    recorder.addFrame(frame())
    recorder.addOnset(onset())
    recorder.reset()
    const record = take(recorder)
    expect(record.frames).toHaveLength(0)
    expect(record.onsets).toHaveLength(0)
  })
})
