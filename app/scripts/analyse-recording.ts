/**
 * Measure a real recording of the instrument against the onset detector.
 *
 * The detector's constants were first chosen against synthesised plucks, and a
 * synthesised pluck carries far more energy above a few hundred hertz than a
 * bass through a real interface does. This reads a take recorded by
 * `scripts/record-take.sh` and reports what the signal actually contains, so a
 * threshold can be chosen against the instrument rather than a model of it.
 *
 * Usage: npx vite-node scripts/analyse-recording.ts -- <file.wav>
 */
import { readFileSync } from 'node:fs'
import { Biquad, highpassCoefficients } from '../src/audio/dsp/biquad'
import { DEFAULT_ONSET_OPTIONS, OnsetDetector } from '../src/audio/dsp/onset'

interface Recording {
  samples: Float32Array
  sampleRate: number
}

/** Read a mono 32-bit float WAV, walking the chunk list rather than assuming it. */
function readWav(path: string): Recording {
  const buffer = readFileSync(path)
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`${path} is not a RIFF/WAVE file`)
  }
  let offset = 12
  let sampleRate = 0
  let channels = 1
  let bits = 32
  let format = 3
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4)
    const size = buffer.readUInt32LE(offset + 4)
    const body = offset + 8
    if (id === 'fmt ') {
      format = buffer.readUInt16LE(body)
      channels = buffer.readUInt16LE(body + 2)
      sampleRate = buffer.readUInt32LE(body + 4)
      bits = buffer.readUInt16LE(body + 14)
    }
    if (id === 'data') {
      if (format !== 3 || bits !== 32) {
        throw new Error(`expected 32-bit float samples, got format ${format} at ${bits} bits`)
      }
      const count = Math.floor(size / 4 / channels)
      const samples = new Float32Array(count)
      for (let i = 0; i < count; i++) samples[i] = buffer.readFloatLE(body + i * channels * 4)
      return { samples, sampleRate }
    }
    offset = body + size + (size % 2)
  }
  throw new Error(`${path} has no data chunk`)
}

/** Spreading a multi-million sample array into Math.max overflows the stack. */
function maxOf(values: Float32Array, from = 0, to = values.length): number {
  let largest = 0
  for (let i = from; i < to; i++) if (values[i] > largest) largest = values[i]
  return largest
}

function envelope(signal: Float32Array, tauSeconds: number, rate: number): Float32Array {
  const coefficient = Math.exp(-1 / (tauSeconds * rate))
  const out = new Float32Array(signal.length)
  let energy = 0
  for (let i = 0; i < signal.length; i++) {
    const power = signal[i] * signal[i]
    energy = power + coefficient * (energy - power)
    out[i] = Math.sqrt(energy)
  }
  return out
}

function highpassed(signal: Float32Array, cutoffHz: number, rate: number): Float32Array {
  const filter = new Biquad(highpassCoefficients(rate, cutoffHz, Math.SQRT1_2))
  const out = new Float32Array(signal.length)
  for (let i = 0; i < signal.length; i++) out[i] = filter.process(signal[i])
  return out
}

const db = (amplitude: number): string =>
  amplitude <= 0 ? '-inf' : (20 * Math.log10(amplitude)).toFixed(1)

interface Pluck {
  /** Sample index where the attack begins. */
  foot: number
  /** Sample index of the envelope peak. */
  peak: number
}

/** Walk back from a peak while the envelope is still rising into it. */
function footOf(signal: Float32Array, peak: number, rate: number): number {
  const limit = Math.max(0, peak - Math.round(0.08 * rate))
  let foot = peak
  while (foot > limit && signal[foot - 1] < signal[foot]) foot--
  return foot
}

/**
 * Where the plucks are, independent of the detector being judged.
 *
 * A pluck is a rise: the envelope climbs sharply over a few tens of
 * milliseconds, where a ringing string only ever falls. Looking for the rise
 * rather than for a peak is what separates a new note from the beating between
 * a sounding note's partials, which produces peaks of its own.
 */
function findPlucks(signal: Float32Array, rate: number, floor: number): Pluck[] {
  const look = Math.round(0.04 * rate)
  const minGap = Math.round(0.12 * rate)
  const plucks: Pluck[] = []
  let index = look
  while (index < signal.length) {
    const rose = signal[index] > floor && signal[index] > signal[index - look] * RISE_FOR_A_PLUCK
    if (!rose) {
      index++
      continue
    }
    const foot = footOf(signal, index, rate)
    let peak = index
    const end = Math.min(signal.length, index + minGap)
    for (let i = index; i < end; i++) if (signal[i] > signal[peak]) peak = i
    plucks.push({ foot, peak })
    index = peak + minGap
  }
  return plucks
}

/** A deliberate attack climbs by at least this much over the look-back window. */
const RISE_FOR_A_PLUCK = 2

function runDetector(
  recording: Recording,
  overrides: Partial<typeof DEFAULT_ONSET_OPTIONS>,
): number[] {
  const detector = new OnsetDetector({
    sampleRate: recording.sampleRate,
    ...DEFAULT_ONSET_OPTIONS,
    ...overrides,
  })
  const times: number[] = []
  const QUANTUM = 128
  for (let i = 0; i < recording.samples.length; i += QUANTUM) {
    const length = Math.min(QUANTUM, recording.samples.length - i)
    detector.process(
      recording.samples.subarray(i, i + length),
      i / recording.sampleRate,
      (onset) => times.push(onset.time),
      length,
    )
  }
  return times
}

function reportLevels(recording: Recording, slow: Float32Array): { peak: number; noise: number } {
  const { sampleRate, samples } = recording
  const peak = maxOf(slow)
  const half = Math.round(0.5 * sampleRate)
  let noise = Infinity
  for (let i = 0; i + half < slow.length; i += half) {
    noise = Math.min(noise, maxOf(slow, i, i + half))
  }
  console.log(`  ${(samples.length / sampleRate).toFixed(1)} s at ${sampleRate} Hz`)
  console.log(`  loudest attack        ${db(peak)} dBFS`)
  console.log(`  quietest half-second  ${db(noise)} dBFS   <- the noise floor`)
  console.log(`  detector floor        ${DEFAULT_ONSET_OPTIONS.floorDb} dBFS\n`)
  return { peak, noise }
}

function reportContrast(recording: Recording, plucks: Pluck[]): void {
  const { samples, sampleRate } = recording
  console.log('  Attack peak over the level at the foot of the attack:')
  console.log('  cutoff       worst   median     best')
  for (const cutoff of [0, 150, 300, 500, 700, 1000]) {
    const signal = cutoff === 0 ? samples : highpassed(samples, cutoff, sampleRate)
    const fast = envelope(signal, 0.005, sampleRate)
    const ratios: number[] = []
    for (const pluck of plucks) {
      const before = fast[pluck.foot]
      const to = Math.min(fast.length, pluck.peak + Math.round(0.01 * sampleRate))
      if (before > 0) ratios.push(maxOf(fast, pluck.foot, to) / before)
    }
    ratios.sort((a, b) => a - b)
    const label = cutoff === 0 ? 'raw' : `${cutoff} Hz`
    console.log(
      `  ${label.padEnd(9)} ${ratios[0].toFixed(2).padStart(7)}x ${ratios[ratios.length >> 1]
        .toFixed(2)
        .padStart(7)}x ${ratios[ratios.length - 1].toFixed(2).padStart(7)}x`,
    )
  }
}

const SETTINGS: [string, Partial<typeof DEFAULT_ONSET_OPTIONS>][] = [
  ['shipped (1.8)', {}],
  ['1.6', { riseRatio: 1.6 }],
  ['1.4', { riseRatio: 1.4 }],
  ['1.25', { riseRatio: 1.25 }],
  ['1.4, fall 150ms', { riseRatio: 1.4, referenceFallSeconds: 0.15 }],
  ['1.25, fall 150ms', { riseRatio: 1.25, referenceFallSeconds: 0.15 }],
  ['1.25, fall 300ms', { riseRatio: 1.25, referenceFallSeconds: 0.3 }],
  ['1.15, fall 150ms', { riseRatio: 1.15, referenceFallSeconds: 0.15 }],
]

function reportDetector(recording: Recording, plucks: Pluck[]): void {
  const expected = plucks.map((pluck) => pluck.foot / recording.sampleRate)
  console.log(`\n  Detector against those ${plucks.length} plucks (a hit lands within 40 ms):`)
  console.log('  setting                  hit   missed   spurious')
  for (const [label, overrides] of SETTINGS) {
    const found = runDetector(recording, overrides)
    const spare = new Set(found)
    let hit = 0
    for (const time of expected) {
      const match = found.find((at) => spare.has(at) && Math.abs(at - time) <= 0.04)
      if (match === undefined) continue
      spare.delete(match)
      hit++
    }
    console.log(
      `  ${label.padEnd(23)} ${String(hit).padStart(3)} ${String(plucks.length - hit).padStart(8)} ${String(
        spare.size,
      ).padStart(10)}`,
    )
  }
}

function main(): void {
  const path = process.argv[process.argv.length - 1]
  const recording = readWav(path)
  console.log(`${path}`)
  const slow = envelope(recording.samples, 0.02, recording.sampleRate)
  const { peak, noise } = reportLevels(recording, slow)

  const plucks = findPlucks(slow, recording.sampleRate, Math.max(peak * 0.04, noise * 3))
  const times = plucks.map((pluck) => pluck.foot / recording.sampleRate)
  const gaps = times
    .slice(1)
    .map((time, i) => time - times[i])
    .sort((a, b) => a - b)
  console.log(`  plucks found: ${plucks.length}`)
  console.log(
    `  gap between them: median ${(gaps[gaps.length >> 1] * 1000).toFixed(0)} ms, shortest ${(
      gaps[0] * 1000
    ).toFixed(0)} ms, longest ${(gaps[gaps.length - 1] * 1000).toFixed(0)} ms\n`,
  )

  reportContrast(recording, plucks)
  reportDetector(recording, plucks)
}

main()
