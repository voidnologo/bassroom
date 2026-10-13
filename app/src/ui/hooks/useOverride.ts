import { useState } from 'react'

/**
 * A value the learner has chosen, falling back to the app's own answer and
 * forgetting the choice when the subject changes.
 *
 * Mirroring the app's answer into state instead means every recomputation of
 * that answer overwrites the choice: finishing a take moves the tempo ladder,
 * which would replace the tempo the learner had just set on the slider.
 */
export function useOverride<T>(subject: string, fallback: T): [T, (value: T) => void] {
  const [chosen, setChosen] = useState<{ subject: string; value: T } | null>(null)
  const value = chosen !== null && chosen.subject === subject ? chosen.value : fallback
  return [value, (next: T) => setChosen({ subject, value: next })]
}
