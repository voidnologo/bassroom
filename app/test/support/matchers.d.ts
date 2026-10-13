/**
 * jest-dom's matchers are registered at runtime in `setup.ts`; this tells the
 * type checker about them.
 */
import 'vitest'
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers'

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- the shape comes entirely from the imported matchers
  interface Assertion<T = unknown> extends TestingLibraryMatchers<T, void> {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- same
  interface AsymmetricMatchersContaining extends TestingLibraryMatchers<unknown, void> {}
}
