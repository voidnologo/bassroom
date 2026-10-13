import { describe, expect, it } from 'vitest'
import {
  MIN_CALIBRATION_TAPS,
  offsetFromNearestBeat,
  summarizeCalibration,
  type CalibrationSample,
} from '../../src/audio/latency'

function samples(offsetsMs: number[]): CalibrationSample[] {
  return offsetsMs.map((offsetMs) => ({ offsetSeconds: offsetMs / 1000 }))
}

describe('summarizeCalibration', () => {
  it('refuses to report a figure from too few taps', () => {
    expect(summarizeCalibration(samples([20, 22, 21])).quality).toBe('insufficient')
  })

  it('reports a steady offset as the measured latency', () => {
    const result = summarizeCalibration(samples(Array(12).fill(24)))
    expect(result.offsetMs).toBeCloseTo(24, 6)
    expect(result.quality).toBe('good')
  })

  it('is not pulled off by a single wild tap', () => {
    // The median exists for this: one fumbled tap must not shift the offset
    // that every later timing judgment is corrected by.
    const steady = summarizeCalibration(samples(Array(12).fill(24)))
    const withOutlier = summarizeCalibration(samples([...Array(11).fill(24), 900]))
    expect(Math.abs(withOutlier.offsetMs - steady.offsetMs)).toBeLessThan(2)
  })

  it('does not let an early tap cancel a late one', () => {
    // A mean would report zero for this player, which is a lie about a
    // real 40 ms spread.
    const result = summarizeCalibration(samples([-40, -40, -40, -40, 40, 40, 40, 40, 40, 40]))
    expect(result.offsetMs).not.toBeCloseTo(0, 1)
  })

  it('flags an inconsistent player rather than trusting the number', () => {
    expect(
      summarizeCalibration(samples([-90, 10, 70, -50, 100, -20, 60, 5, -80, 40])).quality,
    ).toBe('noisy')
  })

  it('reports how many taps were counted', () => {
    expect(summarizeCalibration(samples(Array(15).fill(10))).sampleCount).toBe(15)
  })

  it('needs at least the documented number of taps', () => {
    expect(summarizeCalibration(samples(Array(MIN_CALIBRATION_TAPS).fill(10))).quality).not.toBe(
      'insufficient',
    )
  })

  it('measures spread as the interquartile range', () => {
    expect(summarizeCalibration(samples(Array(12).fill(24))).spreadMs).toBeCloseTo(0, 6)
  })
})

describe('offsetFromNearestBeat', () => {
  it('reports zero for a tap exactly on a click', () => {
    expect(offsetFromNearestBeat(2, 0, 1)).toBeCloseTo(0, 6)
  })

  it('reports a positive offset for a late tap', () => {
    expect(offsetFromNearestBeat(2.05, 0, 1)).toBeCloseTo(0.05, 6)
  })

  it('reports a negative offset for an early tap', () => {
    expect(offsetFromNearestBeat(1.95, 0, 1)).toBeCloseTo(-0.05, 6)
  })

  it('attaches a tap to the nearer of two clicks', () => {
    expect(offsetFromNearestBeat(2.6, 0, 1)).toBeCloseTo(-0.4, 6)
  })

  it('accounts for a start time that is not zero', () => {
    expect(offsetFromNearestBeat(5.52, 0.5, 0.5)).toBeCloseTo(0.02, 6)
  })
})
