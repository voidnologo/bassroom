/**
 * Real-time monophonic pitch + onset detection for bass guitar.
 *
 * Plain JavaScript on purpose: AudioWorklet modules are fetched and compiled by
 * the browser's audio thread, so they bypass the bundler entirely. Keeping this
 * file in public/ means it is served verbatim in both dev and production.
 *
 * Pipeline, and why each stage is here:
 *
 *   1. Anti-alias lowpass + decimate by 4 (48 kHz -> 12 kHz).
 *      Bass fundamentals top out near 400 Hz, so 12 kHz is plenty of bandwidth.
 *      The YIN difference function costs O(window x tauMax), and both of those
 *      shrink with the sample rate, which is what makes the whole thing
 *      affordable on the audio thread.
 *
 *   2. YIN pitch detection over a 128 ms window.
 *      The low E string is 41 Hz, a 24 ms period. YIN needs at least two full
 *      periods in the window to find one, and is far more stable with four, so
 *      the window cannot be made much shorter without losing the bottom string.
 *
 *   3. Envelope-based onset detection on the *undecimated* signal.
 *      Onsets drive timing judgments, so they need millisecond resolution; they
 *      are detected independently of pitch and reported the moment they happen,
 *      rather than waiting for the pitch window to fill.
 */

const DEFAULTS = {
  decimation: 4,
  bufferSize: 1536, // decimated samples held for analysis (~128 ms at 12 kHz)
  hopSize: 256, // decimated samples between analyses (~21 ms)
  minFrequency: 36, // a little below low E so a badly flat string still reads
  maxFrequency: 520, // ~C5, above anything on a 4-string's first 12 frets
  yinThreshold: 0.15,
  onsetRiseRatio: 2.0, // short-term energy must exceed this multiple of recent energy
  onsetFloorDb: -52, // absolute gate so hum and hiss never register as a note
  onsetRefractoryMs: 70, // shortest gap two deliberate plucks can have
}

/** Second-order Butterworth lowpass, used in cascade as the anti-alias filter. */
class Biquad {
  constructor(sampleRateHz, cutoffHz, q) {
    const w0 = (2 * Math.PI * cutoffHz) / sampleRateHz
    const cosW0 = Math.cos(w0)
    const alpha = Math.sin(w0) / (2 * q)
    const a0 = 1 + alpha
    this.b0 = ((1 - cosW0) / 2) / a0
    this.b1 = (1 - cosW0) / a0
    this.b2 = this.b0
    this.a1 = (-2 * cosW0) / a0
    this.a2 = (1 - alpha) / a0
    this.z1 = 0
    this.z2 = 0
  }

  process(x) {
    // Transposed direct form II: two state variables, no delay line to shift.
    const y = this.b0 * x + this.z1
    this.z1 = this.b1 * x - this.a1 * y + this.z2
    this.z2 = this.b2 * x - this.a2 * y
    return y
  }
}

class PitchProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()
    const config = { ...DEFAULTS, ...(options.processorOptions || {}) }
    this.config = config

    this.decimatedRate = sampleRate / config.decimation

    // Two cascaded biquads give 24 dB/octave above the cutoff, which puts
    // everything near the decimated Nyquist (1.5 kHz) far enough down that
    // aliasing does not reach the levels YIN would mistake for signal.
    const cutoff = Math.min(this.decimatedRate * 0.4, sampleRate * 0.45)
    this.lowpass = [new Biquad(sampleRate, cutoff, 0.5412), new Biquad(sampleRate, cutoff, 1.3066)]

    this.tauMax = Math.min(
      Math.floor(this.decimatedRate / config.minFrequency),
      Math.floor(config.bufferSize / 2),
    )
    this.tauMin = Math.max(2, Math.floor(this.decimatedRate / config.maxFrequency))
    this.windowLength = config.bufferSize - this.tauMax

    this.ring = new Float32Array(config.bufferSize)
    this.ringWrite = 0
    this.ringFilled = 0
    this.decimationPhase = 0
    this.samplesSinceHop = 0

    this.frame = new Float32Array(config.bufferSize)
    this.difference = new Float32Array(this.tauMax + 1)
    this.cumulative = new Float32Array(this.tauMax + 1)

    // Onset state. Short window reacts to the pluck; long window represents
    // whatever was already ringing, so the ratio between them finds re-plucks
    // on top of a sustaining note instead of only finding silence-to-note.
    this.shortEnergy = 0
    this.longEnergy = 0
    this.shortCoeff = Math.exp(-1 / (0.006 * sampleRate)) // ~6 ms
    this.longCoeff = Math.exp(-1 / (0.120 * sampleRate)) // ~120 ms
    this.onsetFloor = Math.pow(10, config.onsetFloorDb / 20)
    this.lastOnsetTime = -1
    this.armed = true

    this.running = true
    this.port.onmessage = (event) => {
      if (event.data && event.data.type === 'stop') this.running = false
      if (event.data && event.data.type === 'config') {
        Object.assign(this.config, event.data.config || {})
      }
    }
  }

  /** YIN steps 1-3: squared difference, cumulative mean normalisation, pick. */
  detectPitch(frame) {
    const { tauMin, tauMax, windowLength, difference, cumulative } = this
    const threshold = this.config.yinThreshold

    difference[0] = 0
    for (let tau = 1; tau <= tauMax; tau++) {
      let sum = 0
      for (let i = 0; i < windowLength; i++) {
        const delta = frame[i] - frame[i + tau]
        sum += delta * delta
      }
      difference[tau] = sum
    }

    cumulative[0] = 1
    let runningSum = 0
    for (let tau = 1; tau <= tauMax; tau++) {
      runningSum += difference[tau]
      cumulative[tau] = runningSum > 0 ? (difference[tau] * tau) / runningSum : 1
    }

    // Absolute-threshold pick: take the *first* dip below the threshold rather
    // than the deepest one. The deepest dip is often at twice the true period,
    // which is exactly how octave errors creep in on the low strings.
    let tauEstimate = -1
    for (let tau = tauMin; tau <= tauMax; tau++) {
      if (cumulative[tau] < threshold) {
        while (tau + 1 <= tauMax && cumulative[tau + 1] < cumulative[tau]) tau++
        tauEstimate = tau
        break
      }
    }
    if (tauEstimate === -1) return null

    // Parabolic interpolation around the minimum recovers sub-sample period
    // precision; without it, quantisation alone costs several cents up high.
    const refined = this.interpolate(cumulative, tauEstimate, tauMax)
    const frequency = this.decimatedRate / refined
    if (frequency < this.config.minFrequency || frequency > this.config.maxFrequency) return null

    return { frequency, clarity: Math.max(0, Math.min(1, 1 - cumulative[tauEstimate])) }
  }

  interpolate(values, tau, tauMax) {
    if (tau <= 0 || tau >= tauMax) return tau
    const prev = values[tau - 1]
    const here = values[tau]
    const next = values[tau + 1]
    const denominator = 2 * (2 * here - next - prev)
    if (denominator === 0) return tau
    return tau + (next - prev) / denominator
  }

  copyRingIntoFrame() {
    const { ring, ringWrite, frame } = this
    const size = ring.length
    const start = ringWrite // oldest sample, since the ring is full by now
    for (let i = 0; i < size; i++) frame[i] = ring[(start + i) % size]
  }

  trackOnsets(channel) {
    const { shortCoeff, longCoeff, config } = this
    const refractory = config.onsetRefractoryMs / 1000
    for (let i = 0; i < channel.length; i++) {
      const power = channel[i] * channel[i]
      this.shortEnergy = power + shortCoeff * (this.shortEnergy - power)
      this.longEnergy = power + longCoeff * (this.longEnergy - power)

      const shortAmplitude = Math.sqrt(this.shortEnergy)
      const longAmplitude = Math.sqrt(this.longEnergy)
      const loudEnough = shortAmplitude > this.onsetFloor
      const rising = shortAmplitude > longAmplitude * config.onsetRiseRatio

      // currentTime advances per 128-sample quantum, so add the within-quantum
      // offset to keep onset timestamps accurate to the sample.
      const time = currentTime + i / sampleRate

      if (this.armed && loudEnough && rising && time - this.lastOnsetTime > refractory) {
        this.lastOnsetTime = time
        this.armed = false
        this.port.postMessage({ type: 'onset', time, level: shortAmplitude })
      } else if (!this.armed && shortAmplitude < longAmplitude * 1.1) {
        this.armed = true
      }
    }
  }

  process(inputs) {
    if (!this.running) return false
    const input = inputs[0]
    if (!input || input.length === 0) return true
    const channel = input[0]
    if (!channel) return true

    this.trackOnsets(channel)

    const { config, ring } = this
    for (let i = 0; i < channel.length; i++) {
      let sample = channel[i]
      for (const filter of this.lowpass) sample = filter.process(sample)

      if (++this.decimationPhase >= config.decimation) {
        this.decimationPhase = 0
        ring[this.ringWrite] = sample
        this.ringWrite = (this.ringWrite + 1) % ring.length
        if (this.ringFilled < ring.length) this.ringFilled++
        this.samplesSinceHop++
      }
    }

    if (this.ringFilled >= ring.length && this.samplesSinceHop >= config.hopSize) {
      this.samplesSinceHop = 0
      this.copyRingIntoFrame()

      let sumSquares = 0
      for (let i = 0; i < this.frame.length; i++) sumSquares += this.frame[i] * this.frame[i]
      const rms = Math.sqrt(sumSquares / this.frame.length)

      const result = rms > this.onsetFloor * 0.5 ? this.detectPitch(this.frame) : null
      this.port.postMessage({
        type: 'pitch',
        time: currentTime,
        rms,
        frequency: result ? result.frequency : 0,
        clarity: result ? result.clarity : 0,
      })
    }

    return true
  }
}

registerProcessor('pitch-processor', PitchProcessor)
