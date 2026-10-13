import { describe, expect, it } from 'vitest'
import { RingBuffer } from '../../src/audio/dsp/ringBuffer'

describe('RingBuffer', () => {
  it('is not full before enough samples have arrived', () => {
    const buffer = new RingBuffer(4)
    buffer.push(1)
    expect(buffer.isFull).toBe(false)
  })

  it('becomes full at exactly its capacity', () => {
    const buffer = new RingBuffer(4)
    for (const value of [1, 2, 3, 4]) buffer.push(value)
    expect(buffer.isFull).toBe(true)
  })

  it('reads back in chronological order once full', () => {
    const buffer = new RingBuffer(4)
    for (const value of [1, 2, 3, 4]) buffer.push(value)
    const target = new Float32Array(4)
    buffer.copyInto(target)
    expect(Array.from(target)).toEqual([1, 2, 3, 4])
  })

  it('drops the oldest sample when it wraps', () => {
    const buffer = new RingBuffer(4)
    for (const value of [1, 2, 3, 4, 5, 6]) buffer.push(value)
    const target = new Float32Array(4)
    buffer.copyInto(target)
    expect(Array.from(target)).toEqual([3, 4, 5, 6])
  })

  it('pads with leading zeros while partially filled', () => {
    const buffer = new RingBuffer(4)
    buffer.push(7)
    buffer.push(8)
    const target = new Float32Array(4)
    buffer.copyInto(target)
    expect(Array.from(target)).toEqual([7, 8, 0, 0])
  })

  it('refuses a target smaller than its capacity', () => {
    const buffer = new RingBuffer(4)
    expect(() => buffer.copyInto(new Float32Array(2))).toThrow(/too small/)
  })

  it('clears its contents on reset', () => {
    const buffer = new RingBuffer(2)
    buffer.push(1)
    buffer.push(2)
    buffer.reset()
    expect(buffer.isFull).toBe(false)
    const target = new Float32Array(2)
    buffer.copyInto(target)
    expect(Array.from(target)).toEqual([0, 0])
  })
})
