/**
 * Input latency calibration.
 *
 * Timing feedback is only honest if the app knows how long a note takes to get
 * from the string to the detector. The browser reports part of that, but the
 * interface's own buffer and driver path are invisible to it, so the learner
 * plays along with the metronome once and the median offset is measured.
 *
 * The median is used rather than the mean because an early miss and a late miss
 * on the same tap would otherwise cancel each other out.
 */

export interface CalibrationSample {
  /** Measured onset time minus the nearest click time, in seconds. */
  offsetSeconds: number
}

export interface CalibrationResult {
  offsetMs: number
  spreadMs: number
  sampleCount: number
  quality: 'good' | 'noisy' | 'insufficient'
}

export const MIN_CALIBRATION_TAPS = 8

export function summarizeCalibration(samples: CalibrationSample[]): CalibrationResult {
  if (samples.length < MIN_CALIBRATION_TAPS) {
    return { offsetMs: 0, spreadMs: 0, sampleCount: samples.length, quality: 'insufficient' }
  }

  const offsets = samples.map((sample) => sample.offsetSeconds * 1000).sort((a, b) => a - b)
  const offsetMs = median(offsets)
  // Interquartile range: a player who is simply inconsistent produces a wide
  // spread, and that is worth telling them about rather than silently baking a
  // meaningless number into every future timing judgment.
  const spreadMs = percentile(offsets, 0.75) - percentile(offsets, 0.25)

  return {
    offsetMs,
    spreadMs,
    sampleCount: samples.length,
    quality: spreadMs <= 45 ? 'good' : 'noisy',
  }
}

/** Nearest click to an onset, assuming clicks every `period` seconds from `start`. */
export function offsetFromNearestBeat(onsetTime: number, start: number, period: number): number {
  const beats = (onsetTime - start) / period
  return (beats - Math.round(beats)) * period
}

function median(sorted: number[]): number {
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0
  const position = (sorted.length - 1) * fraction
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
}
