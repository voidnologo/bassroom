import { get as idbGet, set as idbSet } from 'idb-keyval'
import { create } from 'zustand'
import type { Exercise } from '../music/types'
import {
  applyAttempt,
  createSnapshot,
  type AttemptInput,
  type AttemptResult,
} from '../progress/reducer'
import { PROGRESS_SCHEMA_VERSION, type ProgressSnapshot } from '../progress/types'

/**
 * The learner's progress, held in memory and mirrored to IndexedDB.
 *
 * All the rules live in `progress/reducer.ts`; this store only holds the result
 * and persists it. Writes are debounced because a take produces one update and
 * the browser has no reason to see three.
 */

const STORAGE_KEY = 'bassroom.progress.v1'
const WRITE_DEBOUNCE_MS = 400

interface ProgressStore {
  snapshot: ProgressSnapshot
  loaded: boolean
  /** Set when persistence failed, so the UI can warn instead of losing work silently. */
  storageError: string | null

  load: () => Promise<void>
  recordAttempt: (input: Omit<AttemptInput, 'now'>) => AttemptResult
  setLatencyMs: (latencyMs: number) => void
  setPreferredDevice: (deviceId: string | null) => void
  setDailyGoalMinutes: (minutes: number) => void
  replaceSnapshot: (snapshot: ProgressSnapshot) => void
  resetEverything: () => void
}

let writeTimer: ReturnType<typeof setTimeout> | null = null

function persist(snapshot: ProgressSnapshot, onError: (message: string) => void): void {
  if (writeTimer !== null) clearTimeout(writeTimer)
  writeTimer = setTimeout(() => {
    idbSet(STORAGE_KEY, snapshot).catch((error: unknown) => {
      onError(error instanceof Error ? error.message : String(error))
    })
  }, WRITE_DEBOUNCE_MS)
}

/** Accept a stored snapshot only if it is the shape this build understands. */
function isUsable(value: unknown): value is ProgressSnapshot {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as ProgressSnapshot
  return candidate.profile?.schemaVersion === PROGRESS_SCHEMA_VERSION
}

export const useProgressStore = create<ProgressStore>((set, getState) => {
  const save = (snapshot: ProgressSnapshot): void => {
    persist(snapshot, (message) => set({ storageError: message }))
  }

  const update = (change: (snapshot: ProgressSnapshot) => ProgressSnapshot): void => {
    const snapshot = change(getState().snapshot)
    set({ snapshot })
    save(snapshot)
  }

  return {
    snapshot: createSnapshot(new Date()),
    loaded: false,
    storageError: null,

    load: async () => {
      try {
        const stored = await idbGet(STORAGE_KEY)
        if (isUsable(stored)) set({ snapshot: stored })
      } catch (error) {
        set({ storageError: error instanceof Error ? error.message : String(error) })
      } finally {
        set({ loaded: true })
      }
    },

    recordAttempt: (input) => {
      const result = applyAttempt(getState().snapshot, { ...input, now: new Date() })
      set({ snapshot: result.snapshot })
      save(result.snapshot)
      return result
    },

    setLatencyMs: (latencyMs) =>
      update((snapshot) => ({
        ...snapshot,
        profile: { ...snapshot.profile, inputLatencyMs: latencyMs },
      })),

    setPreferredDevice: (deviceId) =>
      update((snapshot) => ({
        ...snapshot,
        profile: { ...snapshot.profile, preferredDeviceId: deviceId },
      })),

    setDailyGoalMinutes: (minutes) =>
      update((snapshot) => ({
        ...snapshot,
        profile: { ...snapshot.profile, dailyGoalMinutes: minutes },
      })),

    replaceSnapshot: (snapshot) => {
      set({ snapshot })
      save(snapshot)
    },

    resetEverything: () => {
      const fresh = createSnapshot(new Date())
      set({ snapshot: fresh, storageError: null })
      save(fresh)
    },
  }
})

/** Exercises the learner has a record for, for the badge rules and the plan. */
export function scaleExerciseIdsFrom(exercises: Exercise[]): string[] {
  return exercises
    .filter((item) => item.skills.includes('major-scale') || item.skills.includes('minor-scale'))
    .map((item) => item.id)
}
