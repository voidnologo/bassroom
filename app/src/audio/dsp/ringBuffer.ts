/**
 * Fixed-size circular buffer of samples with an oldest-first read.
 *
 * Allocation-free after construction, because this runs on the audio thread
 * where a garbage collection pause is an audible dropout.
 */
export class RingBuffer {
  private readonly data: Float32Array
  private writeIndex = 0
  private written = 0

  constructor(public readonly size: number) {
    this.data = new Float32Array(size)
  }

  push(sample: number): void {
    this.data[this.writeIndex] = sample
    this.writeIndex = (this.writeIndex + 1) % this.size
    if (this.written < this.size) this.written++
  }

  get isFull(): boolean {
    return this.written >= this.size
  }

  /** Copy the buffer into `target` in chronological order. */
  copyInto(target: Float32Array): void {
    if (target.length < this.size) {
      throw new Error(`Target too small: need ${this.size}, got ${target.length}`)
    }
    const start = this.isFull ? this.writeIndex : 0
    for (let i = 0; i < this.size; i++) target[i] = this.data[(start + i) % this.size]
  }

  reset(): void {
    this.data.fill(0)
    this.writeIndex = 0
    this.written = 0
  }
}
