/**
 * YIN fundamental frequency estimation.
 *
 * de Cheveigne & Kawahara (2002), steps 1-5. Step 6 (best local estimate) is
 * omitted: it needs a longer look-around than a real-time window affords, and
 * the absolute-threshold pick already avoids the octave errors it would fix.
 */

export interface YinOptions {
  sampleRate: number
  /** Analysis frame length in samples. Must exceed 2x the longest period. */
  bufferSize: number
  /** Lowest detectable frequency; sets the longest period searched. */
  minFrequency: number
  /** Highest detectable frequency; sets the shortest period searched. */
  maxFrequency: number
  /**
   * Cumulative-mean-normalised difference below which a period is accepted.
   * Lower is stricter. 0.10-0.20 is the usual range; 0.15 is the paper's value.
   */
  threshold: number
}

export interface YinResult {
  frequency: number
  /** 0..1. Below about 0.8 the estimate is usually noise rather than a note. */
  clarity: number
  /** Estimated period in samples, after interpolation. */
  tau: number
}

export const DEFAULT_YIN_OPTIONS: Omit<YinOptions, 'sampleRate' | 'bufferSize'> = {
  // A little below the 41.2 Hz low E, so a badly flat string still reads.
  minFrequency: 36,
  // Above anything reachable in the first twelve frets of a 4-string.
  maxFrequency: 520,
  threshold: 0.15,
}

export class YinDetector {
  private readonly difference: Float32Array
  private readonly cumulative: Float32Array
  private readonly tauMin: number
  private readonly tauMax: number
  private readonly windowLength: number

  constructor(private readonly options: YinOptions) {
    const { sampleRate, bufferSize, minFrequency, maxFrequency } = options
    const longestPeriod = Math.ceil(sampleRate / minFrequency)

    // The frame must hold the longest period twice over: once for the window
    // and once for the lag it is compared against. Clamping tauMax to fit a
    // short buffer instead would silently raise the lowest detectable note,
    // which on a bass means quietly losing the open E string.
    if (bufferSize < longestPeriod * 2) {
      throw new Error(
        `bufferSize ${bufferSize} is too small for ${minFrequency} Hz at ${sampleRate} Hz; ` +
          `need at least ${longestPeriod * 2} samples`,
      )
    }

    this.tauMax = longestPeriod
    this.tauMin = Math.max(2, Math.floor(sampleRate / maxFrequency))
    this.windowLength = bufferSize - this.tauMax

    // Preallocated: this runs on the audio thread, where allocating per frame
    // invites a garbage collection pause that is audible as a dropout.
    this.difference = new Float32Array(this.tauMax + 1)
    this.cumulative = new Float32Array(this.tauMax + 1)
  }

  get frameSize(): number {
    return this.options.bufferSize
  }

  detect(frame: Float32Array): YinResult | null {
    if (frame.length < this.options.bufferSize) {
      throw new Error(`Frame must hold ${this.options.bufferSize} samples, got ${frame.length}`)
    }
    this.computeDifference(frame)
    this.normalizeDifference()

    const tauEstimate = this.pickPeriod()
    if (tauEstimate === null) return null

    const tau = parabolicMinimum(this.cumulative, tauEstimate, this.tauMax)
    const frequency = this.options.sampleRate / tau
    if (frequency < this.options.minFrequency || frequency > this.options.maxFrequency) return null

    return { frequency, tau, clarity: clamp01(1 - this.cumulative[tauEstimate]) }
  }

  /** Step 1-2: squared difference of the frame against itself at each lag. */
  private computeDifference(frame: Float32Array): void {
    const { difference, windowLength, tauMax } = this
    difference[0] = 0
    for (let tau = 1; tau <= tauMax; tau++) {
      let sum = 0
      for (let i = 0; i < windowLength; i++) {
        const delta = frame[i] - frame[i + tau]
        sum += delta * delta
      }
      difference[tau] = sum
    }
  }

  /** Step 3: cumulative mean normalisation, which flattens the trivial tau=0 dip. */
  private normalizeDifference(): void {
    const { difference, cumulative, tauMax } = this
    cumulative[0] = 1
    let runningSum = 0
    for (let tau = 1; tau <= tauMax; tau++) {
      runningSum += difference[tau]
      cumulative[tau] = runningSum > 0 ? (difference[tau] * tau) / runningSum : 1
    }
  }

  /**
   * Step 4: take the *first* lag that dips below the threshold, descending to
   * its local minimum, rather than the global minimum. Every periodic signal
   * also repeats at two and three times its period, and the cumulative mean
   * normalisation makes those longer lags score marginally better still, so
   * the global minimum is an octave-below answer more often than not.
   *
   * A sub-periodic check - preferring 2tau when it scores better - was tried
   * here and removed. See docs/audio-pipeline.md: against synthesised bass
   * tones it fired on correct detections and turned them into octave errors,
   * and the realistic bass case it was meant to fix, a note whose fundamental
   * is quieter than its second harmonic, is already resolved correctly because
   * the odd harmonics keep the waveform from repeating at half the period.
   */
  private pickPeriod(): number | null {
    const { cumulative, tauMin, tauMax, options } = this
    for (let tau = tauMin; tau <= tauMax; tau++) {
      if (cumulative[tau] >= options.threshold) continue
      let best = tau
      while (best + 1 <= tauMax && cumulative[best + 1] < cumulative[best]) best++
      return best
    }
    return null
  }
}

/**
 * Step 5: parabolic interpolation through the minimum and its neighbours.
 * Without it, period quantisation alone costs several cents in the upper range.
 */
export function parabolicMinimum(values: Float32Array, index: number, maxIndex: number): number {
  if (index <= 0 || index >= maxIndex) return index
  const previous = values[index - 1]
  const current = values[index]
  const next = values[index + 1]
  const denominator = 2 * (2 * current - next - previous)
  if (denominator === 0) return index
  return index + (next - previous) / denominator
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}
