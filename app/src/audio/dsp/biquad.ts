/** Second-order IIR sections, used here to build anti-alias and rumble filters. */

export interface BiquadCoefficients {
  b0: number
  b1: number
  b2: number
  a1: number
  a2: number
}

/** Q values that make a cascade of biquads a Butterworth response. */
const BUTTERWORTH_Q: Record<number, number[]> = {
  2: [Math.SQRT1_2],
  4: [0.541196, 1.306563],
  6: [0.517638, 0.707107, 1.931852],
}

export function lowpassCoefficients(
  sampleRate: number,
  cutoffHz: number,
  q: number,
): BiquadCoefficients {
  const w0 = (2 * Math.PI * cutoffHz) / sampleRate
  const cosW0 = Math.cos(w0)
  const alpha = Math.sin(w0) / (2 * q)
  const a0 = 1 + alpha
  const b0 = (1 - cosW0) / 2 / a0
  return {
    b0,
    b1: (1 - cosW0) / a0,
    b2: b0,
    a1: (-2 * cosW0) / a0,
    a2: (1 - alpha) / a0,
  }
}

export function highpassCoefficients(
  sampleRate: number,
  cutoffHz: number,
  q: number,
): BiquadCoefficients {
  const w0 = (2 * Math.PI * cutoffHz) / sampleRate
  const cosW0 = Math.cos(w0)
  const alpha = Math.sin(w0) / (2 * q)
  const a0 = 1 + alpha
  const b0 = (1 + cosW0) / 2 / a0
  return {
    b0,
    b1: -(1 + cosW0) / a0,
    b2: b0,
    a1: (-2 * cosW0) / a0,
    a2: (1 - alpha) / a0,
  }
}

/** Transposed direct form II: two state variables, no delay line to shift. */
export class Biquad {
  private z1 = 0
  private z2 = 0

  constructor(private readonly coefficients: BiquadCoefficients) {}

  process(input: number): number {
    const { b0, b1, b2, a1, a2 } = this.coefficients
    const output = b0 * input + this.z1
    this.z1 = b1 * input - a1 * output + this.z2
    this.z2 = b2 * input - a2 * output
    return output
  }

  reset(): void {
    this.z1 = 0
    this.z2 = 0
  }
}

/** A cascade of biquads applied in series, exposed as a single filter. */
export class FilterChain {
  constructor(private readonly stages: Biquad[]) {}

  static butterworthLowpass(sampleRate: number, cutoffHz: number, order = 4): FilterChain {
    const qs = BUTTERWORTH_Q[order]
    if (!qs) throw new Error(`Unsupported Butterworth order: ${order}`)
    return new FilterChain(qs.map((q) => new Biquad(lowpassCoefficients(sampleRate, cutoffHz, q))))
  }

  static butterworthHighpass(sampleRate: number, cutoffHz: number, order = 2): FilterChain {
    const qs = BUTTERWORTH_Q[order]
    if (!qs) throw new Error(`Unsupported Butterworth order: ${order}`)
    return new FilterChain(qs.map((q) => new Biquad(highpassCoefficients(sampleRate, cutoffHz, q))))
  }

  process(input: number): number {
    let value = input
    for (const stage of this.stages) value = stage.process(value)
    return value
  }

  reset(): void {
    for (const stage of this.stages) stage.reset()
  }
}
