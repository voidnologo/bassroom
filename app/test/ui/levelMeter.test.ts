import { describe, expect, it } from 'vitest'
import { barFraction, verdictForPeak } from '../../src/ui/components/LevelMeter'

describe('verdictForPeak', () => {
  it.each([
    ['nothing heard', null, 'silent'],
    ['near the detector floor', -45, 'too-quiet'],
    ['quiet but usable', -24, 'could-be-louder'],
    ['where a loudest attack wants to sit', -12, 'good'],
    ['little headroom left', -3, 'hot'],
    ['squaring off the peak', -0.5, 'clipping'],
  ] as [string, number | null, string][])('calls %s %s', (_name, peakDb, expected) => {
    expect(verdictForPeak(peakDb).verdict).toBe(expected)
  })

  it('tells a quiet signal to go up and a hot one to come down', () => {
    expect(verdictForPeak(-45).advice).toMatch(/up/i)
    expect(verdictForPeak(-0.5).advice).toMatch(/down/i)
  })

  /**
   * The take that lost six plucks peaked around -32 dBFS and the one that lost
   * none peaked around -4, so the advice has to separate those two.
   */
  it('separates the level that lost plucks from the level that did not', () => {
    expect(verdictForPeak(-32).verdict).toBe('too-quiet')
    expect(verdictForPeak(-4.3).verdict).not.toBe('too-quiet')
  })
})

describe('barFraction', () => {
  it('is empty at the bottom of the scale and full at nothing-left', () => {
    expect(barFraction(-60)).toBe(0)
    expect(barFraction(0)).toBe(1)
  })

  it('rises with the level', () => {
    expect(barFraction(-12)).toBeGreaterThan(barFraction(-30))
  })

  it('does not run off the end of the bar', () => {
    expect(barFraction(6)).toBe(1)
    expect(barFraction(-200)).toBe(0)
  })
})
