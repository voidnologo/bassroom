import { FilterChain } from './biquad'

/**
 * Anti-alias lowpass followed by sample dropping.
 *
 * Decimating before pitch analysis is what makes real-time YIN affordable: the
 * difference function costs O(window x tauMax), and both shrink linearly with
 * the sample rate. Bass fundamentals stop around 400 Hz, so there is a great
 * deal of bandwidth to give up before anything useful is lost.
 */
export class Decimator {
  private readonly filter: FilterChain
  private phase = 0

  constructor(
    sampleRate: number,
    public readonly factor: number,
  ) {
    if (factor < 1 || !Number.isInteger(factor)) {
      throw new Error(`Decimation factor must be a positive integer, got ${factor}`)
    }
    this.outputRate = sampleRate / factor
    // 18% of the output rate, well below the new Nyquist. A cutoff just under
    // Nyquist would leave only ~25 dB of rejection an octave up, where a
    // 24 dB/octave rolloff has barely started; placing it this low gives over
    // 45 dB. Nothing is lost: period estimation on a bass needs the fundamental
    // and its first few partials, all of which are below 2 kHz.
    this.filter = FilterChain.butterworthLowpass(sampleRate, this.outputRate * 0.18, 4)
  }

  readonly outputRate: number

  /** Returns the decimated sample, or null when this input sample is dropped. */
  process(sample: number): number | null {
    const filtered = this.filter.process(sample)
    if (++this.phase < this.factor) return null
    this.phase = 0
    return filtered
  }

  reset(): void {
    this.filter.reset()
    this.phase = 0
  }
}
