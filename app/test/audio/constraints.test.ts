import { describe, expect, it } from 'vitest'
import { describeUnwantedProcessing } from '../../src/audio/AudioEngine'

/**
 * Constraints passed to getUserMedia are requests, not commands: a browser that
 * does not honour one ignores it silently. The only way to know is to read the
 * settings back, which is what this checks (AU8).
 */
function streamReporting(settings: Record<string, boolean>): MediaStream {
  return {
    getAudioTracks: () => [{ getSettings: () => settings }],
  } as unknown as MediaStream
}

describe('describeUnwantedProcessing', () => {
  it('says nothing when the browser honoured every constraint', () => {
    const stream = streamReporting({
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    })
    expect(describeUnwantedProcessing(stream)).toBeNull()
  })

  it('says nothing when the browser does not report these settings at all', () => {
    expect(describeUnwantedProcessing(streamReporting({}))).toBeNull()
  })

  it.each([
    { setting: 'noiseSuppression', name: 'noise suppression' },
    { setting: 'echoCancellation', name: 'echo cancellation' },
    { setting: 'autoGainControl', name: 'automatic gain control' },
  ])('names $name when it came back on', ({ setting, name }) => {
    const message = describeUnwantedProcessing(streamReporting({ [setting]: true }))
    expect(message).toContain(name)
  })

  it('names every one that came back on, not just the first', () => {
    const message = describeUnwantedProcessing(
      streamReporting({ echoCancellation: true, noiseSuppression: true, autoGainControl: true }),
    )
    expect(message).toContain('echo cancellation')
    expect(message).toContain('noise suppression')
    expect(message).toContain('automatic gain control')
  })

  it('says what to do about it', () => {
    const message = describeUnwantedProcessing(streamReporting({ noiseSuppression: true }))
    expect(message).toMatch(/different (input|browser)/)
  })

  it('says nothing for a stream with no audio track', () => {
    const empty = { getAudioTracks: () => [] } as unknown as MediaStream
    expect(describeUnwantedProcessing(empty)).toBeNull()
  })
})
