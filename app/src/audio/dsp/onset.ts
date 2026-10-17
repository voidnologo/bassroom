/**
 * Envelope-based note onset detection for plucked strings.
 *
 * An attack is found by comparing a fast envelope against a slower reference
 * envelope. Both details matter:
 *
 *   - The reference is *asymmetric*: it falls quickly and rises slowly. A
 *     symmetric average lags behind a decaying note and so sits well above the
 *     true level, which eats the margin the ratio test depends on. Two plucks
 *     of equal strength half a second apart were missed entirely that way.
 *
 *   - Comparing against a recent reference, rather than an absolute threshold,
 *     is what lets a re-pluck be detected on top of a note that is still
 *     ringing instead of only finding silence-to-note transitions.
 *
 * Onsets are detected on the full-rate signal, separately from pitch, because
 * timing judgments need millisecond resolution and must not wait for a pitch
 * analysis window to fill.
 */

export interface OnsetOptions {
  sampleRate: number
  /** Attack-following time constant, in seconds. */
  fastWindowSeconds: number
  /** Reference rise time constant: long, so an attack barely moves it. */
  referenceRiseSeconds: number
  /** Reference fall time constant: short, so it tracks a decaying note. */
  referenceFallSeconds: number
  /** How far the fast envelope must exceed the reference to count as an attack. */
  riseRatio: number
  /** Absolute gate in dBFS, so hum and hiss can never register as a note. */
  floorDb: number
  /** Shortest gap two deliberate plucks can have, in milliseconds. */
  refractoryMs: number
}

export const DEFAULT_ONSET_OPTIONS: Omit<OnsetOptions, 'sampleRate'> = {
  fastWindowSeconds: 0.005,
  referenceRiseSeconds: 0.25,
  referenceFallSeconds: 0.05,
  riseRatio: 1.8,
  floorDb: -52,
  // 70 ms is shorter than any gap a player produces deliberately: sixteenth
  // notes at 200 bpm are 75 ms apart.
  refractoryMs: 70,
}

export interface DetectedOnset {
  /** Absolute time of the attack, accurate to the sample. */
  time: number
  /** Fast-envelope amplitude at the attack, 0..1. */
  level: number
  /**
   * How far the fast envelope exceeded the reference, in amplitude, at the
   * moment this fired. Directly comparable to the `riseRatio` option: a value
   * barely above it is an attack that nearly went unheard, which is what says
   * whether the threshold is in the right place on a real instrument.
   */
  riseRatio: number
}

export class OnsetDetector {
  private fastEnergy = 0
  private referenceEnergy = 0
  private readonly fastCoefficient: number
  private readonly riseCoefficient: number
  private readonly fallCoefficient: number
  private readonly floorEnergy: number
  private readonly refractorySeconds: number
  private readonly ratioEnergyThreshold: number
  private readonly sampleInterval: number
  private lastOnsetTime = Number.NEGATIVE_INFINITY

  constructor(options: OnsetOptions) {
    const { sampleRate, floorDb, refractoryMs, riseRatio } = options
    this.sampleInterval = 1 / sampleRate
    this.fastCoefficient = smoothingCoefficient(options.fastWindowSeconds, sampleRate)
    this.riseCoefficient = smoothingCoefficient(options.referenceRiseSeconds, sampleRate)
    this.fallCoefficient = smoothingCoefficient(options.referenceFallSeconds, sampleRate)

    // Everything is compared in the energy domain to keep a square root out of
    // the per-sample path; the ratio is squared to match.
    this.floorEnergy = (10 ** (floorDb / 20)) ** 2
    this.ratioEnergyThreshold = riseRatio ** 2
    this.refractorySeconds = refractoryMs / 1000
  }

  /**
   * Feed one block of samples. `blockStartTime` is the absolute time of
   * `block[0]`; onsets are reported with sample-accurate timestamps derived
   * from it. A callback is used so no result array is allocated per block.
   */
  process(
    block: Float32Array,
    blockStartTime: number,
    onOnset: (onset: DetectedOnset) => void,
    /** How much of `block` is valid; defaults to all of it. */
    length = block.length,
  ): void {
    for (let i = 0; i < length; i++) {
      const time = blockStartTime + i * this.sampleInterval
      const settling = time - this.lastOnsetTime <= this.refractorySeconds
      this.advanceEnvelopes(block[i] * block[i], settling)
      if (settling || !this.isAttack()) continue
      this.lastOnsetTime = time
      onOnset({ time, level: Math.sqrt(this.fastEnergy), riseRatio: this.measuredRiseRatio() })
    }
  }

  reset(): void {
    this.fastEnergy = 0
    this.referenceEnergy = 0
    this.lastOnsetTime = Number.NEGATIVE_INFINITY
  }

  /**
   * While a note is settling - the refractory window just after an attack - the
   * reference snaps up to the fast envelope instead of easing toward it. The
   * fast envelope keeps climbing for several milliseconds after the threshold
   * is crossed, so without this the reference stays seeded at the low crossing
   * value and the same note fires a second time the moment the window expires.
   */
  private advanceEnvelopes(power: number, settling: boolean): void {
    this.fastEnergy = power + this.fastCoefficient * (this.fastEnergy - power)
    if (settling) {
      this.referenceEnergy = Math.max(this.referenceEnergy, this.fastEnergy)
      return
    }
    const coefficient =
      this.fastEnergy > this.referenceEnergy ? this.riseCoefficient : this.fallCoefficient
    this.referenceEnergy = this.fastEnergy + coefficient * (this.referenceEnergy - this.fastEnergy)
  }

  /**
   * Infinity when the reference envelope is silent, which is a real attack out
   * of nothing rather than a division to hide.
   */
  private measuredRiseRatio(): number {
    if (this.referenceEnergy <= 0) return Infinity
    return Math.sqrt(this.fastEnergy / this.referenceEnergy)
  }

  private isAttack(): boolean {
    if (this.fastEnergy <= this.floorEnergy) return false
    return this.fastEnergy > this.referenceEnergy * this.ratioEnergyThreshold
  }
}

/** Per-sample coefficient for a one-pole smoother with the given time constant. */
function smoothingCoefficient(timeConstantSeconds: number, sampleRate: number): number {
  return Math.exp(-1 / (timeConstantSeconds * sampleRate))
}
