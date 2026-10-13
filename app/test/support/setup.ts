/**
 * Shared test setup.
 *
 * Only the pieces a browser provides and Node does not, and only when a test
 * has asked for jsdom. Nothing here changes behaviour for the pure tests.
 */
import { afterEach, expect, vi } from 'vitest'

const isBrowserLike = typeof window !== 'undefined'

if (isBrowserLike) {
  const matchers = await import('@testing-library/jest-dom/matchers')
  expect.extend(matchers.default ?? matchers)

  const { cleanup } = await import('@testing-library/react')
  afterEach(cleanup)

  // jsdom implements neither of these, and the note highway drives its drawing
  // from requestAnimationFrame.
  if (!window.requestAnimationFrame) {
    window.requestAnimationFrame = (callback) =>
      window.setTimeout(() => callback(performance.now()), 16)
    window.cancelAnimationFrame = (handle) => window.clearTimeout(handle)
  }

  // jsdom's getContext exists but throws without the optional `canvas`
  // package. A recording stub is better than null here: it means the highway's
  // drawing code actually runs in tests rather than being skipped.
  HTMLCanvasElement.prototype.getContext = function getContext(
    this: HTMLCanvasElement,
    kind: string,
  ) {
    return kind === '2d' ? (createRecordingContext() as unknown as CanvasRenderingContext2D) : null
  } as HTMLCanvasElement['getContext']

  if (!window.URL.createObjectURL) {
    window.URL.createObjectURL = vi.fn(() => 'blob:test')
    window.URL.revokeObjectURL = vi.fn()
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

/** A 2D context that records nothing and throws nowhere. */
function createRecordingContext() {
  const noop = (): void => {}
  return {
    canvas: null,
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    textAlign: 'left',
    setTransform: noop,
    clearRect: noop,
    fillRect: noop,
    fillText: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    arcTo: noop,
    stroke: noop,
    fill: noop,
    save: noop,
    restore: noop,
    measureText: () => ({ width: 0 }),
  }
}
