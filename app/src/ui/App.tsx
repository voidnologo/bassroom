import { useEffect, useState } from 'react'
import { AudioProvider, useAudio, type AudioProviderProps } from '../state/AudioProvider'
import { useProgressStore } from '../state/progressStore'
import { Dashboard } from './screens/Dashboard'
import { Path } from './screens/Path'
import { Practice } from './screens/Practice'
import { Settings } from './screens/Settings'
import { Setup } from './screens/Setup'
import { Songs } from './screens/Songs'
import { Pill } from './components/Indicators'

type ScreenId = 'today' | 'practice' | 'path' | 'songs' | 'tuner' | 'settings'

const NAV: Array<{ id: ScreenId; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'path', label: 'The path' },
  { id: 'songs', label: 'Songs' },
  { id: 'tuner', label: 'Setup' },
  { id: 'settings', label: 'Settings' },
]

export function App({ engine, coach }: Omit<AudioProviderProps, 'children'> = {}) {
  return (
    <AudioProvider engine={engine} coach={coach}>
      <Shell />
    </AudioProvider>
  )
}

function Shell() {
  const [screen, setScreen] = useState<ScreenId>('today')
  const [exerciseId, setExerciseId] = useState<string>('open-string-find')
  const load = useProgressStore((store) => store.load)
  const loaded = useProgressStore((store) => store.loaded)

  useEffect(() => {
    void load()
  }, [load])

  const navigate = (next: string, nextExerciseId?: string): void => {
    if (nextExerciseId) setExerciseId(nextExerciseId)
    setScreen(next as ScreenId)
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <strong>Bassroom</strong>
          <span>bass, from zero</span>
        </div>

        <nav className="nav" aria-label="Main">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={screen === item.id ? 'page' : undefined}
              onClick={() => navigate(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <EngineBadge />
      </aside>

      <main className="main">
        <div className="main-inner">
          {!loaded ? (
            <p className="muted">Loading your progress…</p>
          ) : (
            <Screen screen={screen} exerciseId={exerciseId} onNavigate={navigate} />
          )}
        </div>
      </main>
    </div>
  )
}

function Screen({
  screen,
  exerciseId,
  onNavigate,
}: {
  screen: ScreenId
  exerciseId: string
  onNavigate: (screen: string, exerciseId?: string) => void
}) {
  switch (screen) {
    case 'practice':
      return <Practice exerciseId={exerciseId} onNavigate={onNavigate} />
    case 'path':
      return <Path onNavigate={onNavigate} />
    case 'songs':
      return <Songs onNavigate={onNavigate} />
    case 'tuner':
      return <Setup />
    case 'settings':
      return <Settings />
    default:
      return <Dashboard onNavigate={onNavigate} />
  }
}

function EngineBadge() {
  const { state } = useAudio()
  const tone = state === 'running' ? 'good' : state === 'error' ? 'bad' : 'plain'
  const label = {
    idle: 'not listening',
    starting: 'starting',
    running: 'listening',
    error: 'input error',
  }[state]
  return (
    <div className="engine-badge" style={{ padding: '0 8px' }}>
      <Pill tone={tone}>{label}</Pill>
    </div>
  )
}
