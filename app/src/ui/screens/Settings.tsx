import { useEffect, useState } from 'react'
import { useAudio } from '../../state/AudioProvider'
import { useProgressStore } from '../../state/progressStore'
import { Pill } from '../components/Indicators'

/** Goals, the coach, and the learner's own data. */
export function Settings() {
  const { coach } = useAudio()
  const snapshot = useProgressStore((store) => store.snapshot)
  const setDailyGoalMinutes = useProgressStore((store) => store.setDailyGoalMinutes)
  const setLatencyMs = useProgressStore((store) => store.setLatencyMs)
  const resetEverything = useProgressStore((store) => store.resetEverything)
  const storageError = useProgressStore((store) => store.storageError)

  const [provider, setProvider] = useState('checking…')
  const [confirmingReset, setConfirmingReset] = useState(false)

  useEffect(() => {
    let cancelled = false
    void coach.describeActiveProvider().then((label) => {
      if (!cancelled) setProvider(label)
    })
    return () => {
      cancelled = true
    }
  }, [coach])

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
        </div>
      </div>

      {storageError && (
        <div className="banner banner-bad">
          Progress could not be saved: {storageError}. Export your data before closing the tab.
        </div>
      )}

      <div className="card">
        <h3>Daily goal</h3>
        <p className="small muted">
          Short enough to do on a bad day. Ten minutes every day beats an hour once a week, and it
          is the only practice pattern that survives a busy month.
        </p>
        <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
          {[5, 10, 15, 20, 30].map((minutes) => (
            <button
              key={minutes}
              type="button"
              className={
                snapshot.profile.dailyGoalMinutes === minutes
                  ? 'btn btn-primary btn-sm'
                  : 'btn btn-sm'
              }
              onClick={() => setDailyGoalMinutes(minutes)}
            >
              {minutes} min
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>Coach</h3>
        <div className="row wrap" style={{ gap: 10 }}>
          <Pill tone={provider.includes('AI') ? 'good' : 'plain'}>{provider}</Pill>
          <span className="small muted">
            Set <code className="mono">ANTHROPIC_API_KEY</code> before starting the coach server to
            use a model. Without one, the built-in rules do the work.
          </span>
        </div>
        {coach.lastModelError && (
          <p className="banner banner-warn small" style={{ marginTop: 12 }}>
            The model coach failed last time and the built-in rules answered instead:{' '}
            {coach.lastModelError}
          </p>
        )}
      </div>

      <div className="card">
        <h3>Input latency</h3>
        <p className="small muted">
          Measured on the setup screen. Change it by hand only if you know what you are correcting.
        </p>
        <div className="row" style={{ gap: 10, marginTop: 10 }}>
          <input
            type="number"
            aria-label="Input latency in milliseconds"
            value={Math.round(snapshot.profile.inputLatencyMs)}
            min={0}
            max={400}
            onChange={(event) => setLatencyMs(Number(event.target.value))}
            style={{ width: 110 }}
          />
          <span className="small faint">ms</span>
        </div>
      </div>

      <div className="card">
        <h3>Your data</h3>
        <p className="small muted">
          Progress lives in this browser. Takes are also appended to a file by the coach server, one
          line per take, which is the copy worth backing up.
        </p>
        <div className="row wrap" style={{ gap: 10, marginTop: 12 }}>
          <button type="button" className="btn btn-sm" onClick={() => downloadSnapshot(snapshot)}>
            Export progress
          </button>
          {confirmingReset ? (
            <>
              <span className="small">Delete all progress? This cannot be undone.</span>
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={() => {
                  resetEverything()
                  setConfirmingReset(false)
                }}
              >
                Yes, delete it
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setConfirmingReset(false)}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-sm btn-danger"
              onClick={() => setConfirmingReset(true)}
            >
              Reset progress
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function downloadSnapshot(snapshot: unknown): void {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `bassroom-progress-${new Date().toISOString().slice(0, 10)}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}
