import { del as idbDel, get as idbGet, set as idbSet } from 'idb-keyval'
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
 * and persists it.
 */

/**
 * The schema version is part of the key, so a future version lands beside the
 * old record rather than on top of it. A bump that overwrote the old value
 * would destroy every learner's history the first time they changed a setting.
 */
export const storageKeyFor = (version: number): string => `bassroom.progress.v${version}`
const STORAGE_KEY = storageKeyFor(PROGRESS_SCHEMA_VERSION)

const WRITE_DEBOUNCE_MS = 400
/** Other tabs are told about a write so they do not overwrite it. */
const SYNC_CHANNEL = 'bassroom.progress'

interface ProgressStore {
  snapshot: ProgressSnapshot
  loaded: boolean
  /** Set when persistence failed, so the UI can warn instead of losing work silently. */
  storageError: string | null

  load: () => Promise<void>
  recordAttempt: (input: Omit<AttemptInput, 'now'>) => AttemptResult
  setLatencyMs: (latencyMs: number) => void
  setDiagnosticsEnabled: (enabled: boolean) => void
  setPreferredDevice: (deviceId: string | null) => void
  setDailyGoalMinutes: (minutes: number) => void
  resetEverything: () => void
}

/**
 * A snapshot is only usable if the parts the app indexes into are really there.
 * A truncated or half-written record keeps its version field and then throws on
 * the first `history.filter`, white-screening the dashboard with no way back.
 */
export function isUsableSnapshot(value: unknown): value is ProgressSnapshot {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<ProgressSnapshot>
  if (candidate.profile?.schemaVersion !== PROGRESS_SCHEMA_VERSION) return false
  if (!Array.isArray(candidate.history)) return false
  if (typeof candidate.exercises !== 'object' || candidate.exercises === null) return false
  return typeof candidate.profile.xp === 'number' && Number.isFinite(candidate.profile.xp)
}

interface Persistence {
  save: (snapshot: ProgressSnapshot) => void
  onRemoteChange: (listener: (snapshot: ProgressSnapshot) => void) => void
}

/**
 * Debounced writes, a flush when the tab goes away, and a channel telling other
 * tabs what landed.
 *
 * The flush matters: a take finished in the last fraction of a second has
 * already been shown to the learner as XP, and a debounce that loses it is a
 * lie. The channel matters because two tabs each hold their own copy, and
 * without it whichever writes last silently erases the other's practice.
 */
function createPersistence(
  onStatus: (status: { storageError: string | null }) => void,
  latest: () => ProgressSnapshot,
): Persistence {
  let writeTimer: ReturnType<typeof setTimeout> | null = null
  const channel = openChannel()

  const write = async (snapshot: ProgressSnapshot): Promise<void> => {
    try {
      await idbSet(STORAGE_KEY, snapshot)
      channel?.postMessage(snapshot)
      onStatus({ storageError: null })
    } catch (error) {
      onStatus({
        storageError: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const flush = (): void => {
    if (writeTimer === null) return
    clearTimeout(writeTimer)
    writeTimer = null
    void write(latest())
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flush)
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush()
    })
  }

  return {
    save: (snapshot) => {
      if (writeTimer !== null) clearTimeout(writeTimer)
      writeTimer = setTimeout(() => {
        writeTimer = null
        void write(snapshot)
      }, WRITE_DEBOUNCE_MS)
    },
    onRemoteChange: (listener) => {
      channel?.addEventListener('message', (event) => {
        const incoming = (event as MessageEvent).data
        if (isUsableSnapshot(incoming)) listener(incoming)
      })
    },
  }
}

export const useProgressStore = create<ProgressStore>((set, getState) => {
  const persistence = createPersistence(set, () => getState().snapshot)
  const save = persistence.save
  persistence.onRemoteChange((snapshot) => set({ snapshot }))

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
        if (stored === undefined) return
        if (isUsableSnapshot(stored)) {
          set({ snapshot: stored })
          return
        }
        // Found something and could not use it. Say so rather than presenting a
        // blank profile that looks like a first run.
        set({
          storageError:
            'Your saved progress could not be read and has been set aside. Starting fresh.',
        })
        await idbDel(STORAGE_KEY)
      } catch (error) {
        set({
          storageError: error instanceof Error ? error.message : String(error),
        })
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

    setDiagnosticsEnabled: (enabled) =>
      update((snapshot) => ({
        ...snapshot,
        profile: { ...snapshot.profile, diagnosticsEnabled: enabled },
      })),

    setLatencyMs: (latencyMs) =>
      update((snapshot) => ({
        ...snapshot,
        profile: { ...snapshot.profile, inputLatencyMs: clampLatency(latencyMs) },
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

    resetEverything: () => {
      const fresh = createSnapshot(new Date())
      set({ snapshot: fresh, storageError: null })
      save(fresh)
    },
  }
})

/** Guards the one field a text input can turn into NaN. */
export function clampLatency(latencyMs: number): number {
  if (!Number.isFinite(latencyMs)) return 0
  return Math.min(400, Math.max(0, latencyMs))
}

function openChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null
  try {
    return new BroadcastChannel(SYNC_CHANNEL)
  } catch {
    return null
  }
}

/** Exercises the learner has a record for, for the badge rules and the plan. */
export function scaleExerciseIdsFrom(exercises: Exercise[]): string[] {
  return exercises
    .filter((item) => item.skills.includes('major-scale') || item.skills.includes('minor-scale'))
    .map((item) => item.id)
}
