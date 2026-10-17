import { Biquad, highpassCoefficients } from './biquad'

/**
 * Envelope-based note onset detection for plucked strings.
 *
 * The attack test runs on a high-passed copy of the signal. A bass string that
 * is still ringing is close to a pure low fundamental, while a pluck is
 * broadband and its upper partials decay far faster than the fundamental, so
 * above a few hundred Hz an attack stands out from a sustain by several times
 * rather than by a few tens of percent. Measured on synthesised plucks an
 * eighth note apart at 44 bpm, the worst attack on an open string rises 1.3x
 * over the ringing level in the raw signal and 5x once high-passed. Without
 * the high-pass a string played at an even strength cannot clear any threshold
 * that finger noise does not also clear.
 *
 * The attack is then found by comparing a fast envelope against a slower
 * reference envelope. Both details matter:
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
  /** Cutoff of the high-pass the attack test runs on. */
  attackHighpassHz: number
  /** How long an attack is followed before its level is reported. */
  attackHoldMs: number
}

export const DEFAULT_ONSET_OPTIONS: Omit<OnsetOptions, 'sampleRate'> = {
  fastWindowSeconds: 0.005,
  referenceRiseSeconds: 0.25,
  // Long enough to ride over the beating between a string's upper partials,
  // which swings the high-passed envelope by more than an attack does. The
  // reference can afford to fall this slowly because what it is now following
  // is the high-passed signal, where a sounding string leaves little behind.
  referenceFallSeconds: 0.15,
  riseRatio: 1.6,
  floorDb: -52,
  // 70 ms is shorter than any gap a player produces deliberately: sixteenth
  // notes at 200 bpm are 75 ms apart.
  refractoryMs: 70,
  // Above the fundamental of every note on a 4-string bass up to the twelfth
  // fret of the G string, which is 392 Hz, so a sustaining string contributes
  // almost nothing to the attack test.
  attackHighpassHz: 700,
  // The fast envelope needs a few milliseconds to reach the peak of an attack.
  // Reporting the level at the moment the threshold was crossed instead gave
  // the first note of a take the level of the noise gate.
  attackHoldMs: 12,
}

export interface DetectedOnset {
  /** Absolute time of the attack, accurate to the sample. */
  time: number
  /** Fast-envelope amplitude at the attack, 0..1. */
  level: number
  /**
   * How far the high-passed fast envelope exceeded the reference when the
   * threshold was crossed. Detection fires on the first sample that clears the
   * threshold, so this sits just above the configured `riseRatio` for every
   * attack out of a sounding string; it is the crossing value, not the margin
   * the attack had.
   */
  riseRatio: number
}

export class OnsetDetector {
  /** Fast envelope of the raw signal: how loud the string actually is. */
  private levelEnergy = 0
  /** Fast envelope of the high-passed signal, which the attack test uses. */
  private attackEnergy = 0
  private referenceEnergy = 0
  private readonly highpass: Biquad
  private readonly fastCoefficient: number
  private readonly riseCoefficient: number
  private readonly fallCoefficient: number
  private readonly floorEnergy: number
  private readonly refractorySeconds: number
  private readonly holdSeconds: number
  private readonly ratioEnergyThreshold: number
  private readonly sampleInterval: number
  private lastOnsetTime = Number.NEGATIVE_INFINITY

  // An attack being followed for its peak level. Kept as separate fields so
  // that nothing is allocated per sample.
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
    this.highpass = new Biquad(
      highpassCoefficients(sampleRate, options.attackHighpassHz, Math.SQRT1_2),
    )

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
      const sample = block[i]
      const emphasised = this.highpass.process(sample)
      const settling = time - this.lastOnsetTime <= this.refractorySeconds
      this.advanceEnvelopes(sample * sample, emphasised * emphasised, settling)
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
    this.heldPeakEnergy = Math.max(this.heldPeakEnergy, this.levelEnergy)
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
    this.heldPeakEnergy = this.levelEnergy
  }

  reset(): void {
    this.levelEnergy = 0
    this.attackEnergy = 0
    this.referenceEnergy = 0
    this.lastOnsetTime = Number.NEGATIVE_INFINITY
    this.holding = false
    this.highpass.reset()
  }

  /**
   * While a note is settling - the refractory window just after an attack - the
   * reference snaps up to the fast envelope instead of easing toward it. The
   * fast envelope keeps climbing for several milliseconds after the threshold
   * is crossed, so without this the reference stays seeded at the low crossing
   * value and the same note fires a second time the moment the window expires.
   */
  private advanceEnvelopes(power: number, attackPower: number, settling: boolean): void {
    this.levelEnergy = power + this.fastCoefficient * (this.levelEnergy - power)
    this.attackEnergy = attackPower + this.fastCoefficient * (this.attackEnergy - attackPower)
    if (settling) {
      this.referenceEnergy = Math.max(this.referenceEnergy, this.attackEnergy)
      return
    }
    const coefficient =
      this.attackEnergy > this.referenceEnergy ? this.riseCoefficient : this.fallCoefficient
    this.referenceEnergy =
      this.attackEnergy + coefficient * (this.referenceEnergy - this.attackEnergy)
  }

  /**
   * Infinity when the reference envelope is silent, which is a real attack out
   * of nothing rather than a division to hide.
   */
  private measuredRiseRatio(): number {
    if (this.referenceEnergy <= 0) return Infinity
    return Math.sqrt(this.attackEnergy / this.referenceEnergy)
  }

  /**
   * The floor is read from the raw signal, so a note is gated on how loud the
   * string is rather than on how much of it survived the high-pass.
   */
  private isAttack(): boolean {
    if (this.levelEnergy <= this.floorEnergy) return false
    return this.attackEnergy > this.referenceEnergy * this.ratioEnergyThreshold
  }
}

/** Per-sample coefficient for a one-pole smoother with the given time constant. */
function smoothingCoefficient(timeConstantSeconds: number, sampleRate: number): number {
  return Math.exp(-1 / (timeConstantSeconds * sampleRate))
}
