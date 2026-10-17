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
import { Breadcrumbs } from './components/Breadcrumbs'
import { SCREEN_TITLES, samePlace, type Navigate, type Place, type ScreenId } from './navigation'
import { exerciseById } from '../content/curriculum'
import { songById } from '../content/songs'

const NAV: Array<{ id: ScreenId; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'path', label: 'The path' },
  { id: 'songs', label: 'Songs' },
  { id: 'setup', label: 'Setup' },
  { id: 'settings', label: 'Settings' },
]

const HOME: Place = { screen: 'today' }

/** What a place is called in the trail: the thing being looked at, not the screen type. */
function labelFor(place: Place): string {
  if (place.screen === 'practice' && place.exerciseId) {
    return exerciseById(place.exerciseId)?.title ?? SCREEN_TITLES.practice
  }
  if (place.screen === 'songs' && place.songId) {
    return songById(place.songId)?.title ?? SCREEN_TITLES.songs
  }
  return SCREEN_TITLES[place.screen]
}

export function App({ engine, coach }: Omit<AudioProviderProps, 'children'> = {}) {
  return (
    <AudioProvider engine={engine} coach={coach}>
      <Shell />
    </AudioProvider>
  )
}

function Shell() {
  const [trail, setTrail] = useState<Place[]>([HOME])
  const load = useProgressStore((store) => store.load)
  const loaded = useProgressStore((store) => store.loaded)
  const here = trail[trail.length - 1]

  useEffect(() => {
    void load()
  }, [load])

  const navigate: Navigate = (screen, options) => {
    const next: Place = { screen, ...options }
    setTrail((current) => {
      if (samePlace(current[current.length - 1], next)) return current
      // A sidebar destination starts the trail again rather than extending it:
      // nobody walked through the screens they skipped past, and a crumb back
      // to Today duplicates the sidebar entry sitting beside it.
      if (NAV.some((item) => item.id === next.screen)) return [next]
      const existing = current.findIndex((place) => samePlace(place, next))
      return existing === -1 ? [...current, next] : current.slice(0, existing + 1)
    })
  }

  const goTo = (index: number): void => setTrail((current) => current.slice(0, index + 1))

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-mark" src="/icon.svg" alt="" width="30" height="30" />
          <div className="brand-words">
            <strong>Bassroom</strong>
            <span>bass, from zero</span>
          </div>
        </div>

        <nav className="nav" aria-label="Main">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={here.screen === item.id ? 'page' : undefined}
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
            <>
              <Breadcrumbs trail={trail} labelFor={labelFor} onGo={goTo} />
              <Screen place={here} onNavigate={navigate} />
            </>
          )}
        </div>
      </main>
    </div>
  )
}

function Screen({ place, onNavigate }: { place: Place; onNavigate: Navigate }) {
  switch (place.screen) {
    case 'practice':
      return (
        <Practice exerciseId={place.exerciseId ?? 'open-string-find'} onNavigate={onNavigate} />
      )
    case 'path':
      return <Path onNavigate={onNavigate} />
    case 'songs':
      return <Songs onNavigate={onNavigate} songId={place.songId} />
    case 'setup':
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
