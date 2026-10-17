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
  /** How long an attack is followed before its level is reported. */
  attackHoldMs: number
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
  // The fast envelope needs a few milliseconds to reach the peak of an attack.
  // Reporting the level at the threshold crossing instead gave the first note
  // of a take the level of the noise gate, which is the figure the coach's
  // comparison of loudest to quietest attack is built from.
  attackHoldMs: 12,
}

export interface DetectedOnset {
  /** Absolute time of the attack, accurate to the sample. */
  time: number
  /** Peak fast-envelope amplitude of the attack, 0..1. */
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
  private readonly holdSeconds: number
  private readonly ratioEnergyThreshold: number
  private readonly sampleInterval: number
  private lastOnsetTime = Number.NEGATIVE_INFINITY

  // An attack being followed for its peak. Separate fields rather than an
  // object, so nothing is allocated per sample.
  private holding = false
  private heldTime = 0
  private heldRiseRatio = 0
  private heldPeakEnergy = 0

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
    this.holdSeconds = options.attackHoldMs / 1000
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
      if (this.holding) this.followAttack(time, onOnset)
      if (settling || !this.isAttack()) continue
      this.lastOnsetTime = time
      this.startHolding(time)
    }
  }

  /**
   * The refractory window is longer than the hold, so an attack always reports
   * before the next one can begin.
   */
  private followAttack(time: number, onOnset: (onset: DetectedOnset) => void): void {
    this.heldPeakEnergy = Math.max(this.heldPeakEnergy, this.fastEnergy)
    if (time - this.heldTime < this.holdSeconds) return
    this.holding = false
    onOnset({
      time: this.heldTime,
      level: Math.sqrt(this.heldPeakEnergy),
      riseRatio: this.heldRiseRatio,
    })
  }

  private startHolding(time: number): void {
    this.holding = true
    this.heldTime = time
    this.heldRiseRatio = this.measuredRiseRatio()
    this.heldPeakEnergy = this.fastEnergy
  }

  reset(): void {
    this.fastEnergy = 0
    this.referenceEnergy = 0
    this.lastOnsetTime = Number.NEGATIVE_INFINITY
    this.holding = false
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
