import { useState } from 'react'
import { SONGS } from '../../content/songs'
import { resolveSignatures } from '../../content/authoring'
import { SONG_EXERCISE_SPECS, exerciseId } from '../../content/songExercises'
import { renderTab } from '../../music/tab'
import type { SongChart } from '../../music/types'
import { useProgressStore } from '../../state/progressStore'
import { Pill, Stars } from '../components/Indicators'
import { TabChart } from '../components/TabChart'
import type { Navigate } from '../navigation'

/** The two target songs: their tab, their arrangements, and where they came from. */
export function Songs({ onNavigate, songId }: { onNavigate: Navigate; songId?: string }) {
  // Which song is open lives in the navigation trail rather than in this
  // component, so coming back from practising one lands on it again.
  const openSongId = songId ?? SONGS[0].id

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="page-head">
        <div>
          <h1>Songs</h1>
          <p>
            Every arrangement here is playable in the app, and the tab is drawn from the same notes.
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {SONGS.map((song) => (
            <button
              key={song.id}
              type="button"
              className={song.id === openSongId ? 'btn btn-primary btn-sm' : 'btn btn-sm'}
              onClick={() => onNavigate('songs', { songId: song.id })}
            >
              {song.title}
            </button>
          ))}
        </div>
      </div>

      {SONGS.filter((song) => song.id === openSongId).map((song) => (
        <SongDetail key={song.id} song={song} onNavigate={onNavigate} />
      ))}
    </div>
  )
}

function SongDetail({ song, onNavigate }: { song: SongChart; onNavigate: Navigate }) {
  const exercises = useProgressStore((store) => store.snapshot.exercises)
  const [arrangementId, setArrangementId] = useState(song.arrangements[0].id)
  const [layout, setLayout] = useState<'screen' | 'print'>('screen')
  const arrangement =
    song.arrangements.find((candidate) => candidate.id === arrangementId) ?? song.arrangements[0]
  if (!arrangement) return null

  const bars = resolveSignatures(arrangement.bars, song.timeSignature)
  const tab = renderTab(bars, song.timeSignature, {
    columnsPerBeat: song.id === 'angel' ? 4 : 2,
    barsPerLine: song.id === 'angel' ? 1 : 6,
    showCounts: song.id === 'angel',
  })

  const relatedExercises = SONG_EXERCISE_SPECS.filter((spec) => spec.songId === song.id)

  return (
    <>
      <div className="card">
        <div className="row-between wrap" style={{ marginBottom: 10 }}>
          <div>
            <h2 style={{ margin: 0 }}>{song.title}</h2>
            <p className="muted small" style={{ margin: 0 }}>
              {song.artist}
            </p>
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            <Pill>{song.keyCenter}</Pill>
            <Pill>
              {song.timeSignature[0]}/{song.timeSignature[1]}
            </Pill>
            <Pill>{song.targetBpm} bpm</Pill>
          </div>
        </div>

        <div className="row wrap" style={{ gap: 8, marginBottom: 14 }}>
          {song.arrangements.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              className={candidate.id === arrangementId ? 'btn btn-primary btn-sm' : 'btn btn-sm'}
              onClick={() => setArrangementId(candidate.id)}
            >
              {candidate.name}
            </button>
          ))}
        </div>

        <p className="small muted">{arrangement.description}</p>
        <div className="row" style={{ gap: 6, margin: '10px 0 12px' }}>
          {(['screen', 'print'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={layout === mode ? 'btn btn-primary btn-sm' : 'btn btn-sm'}
              aria-pressed={layout === mode}
              onClick={() => setLayout(mode)}
            >
              {mode === 'screen' ? 'On screen' : 'Printable'}
            </button>
          ))}
        </div>
        {layout === 'screen' ? (
          <TabChart bars={bars} timeSignature={song.timeSignature} />
        ) : (
          <pre tabIndex={0} aria-label={`${song.title} tab, fixed-width for printing`}>
            {tab}
          </pre>
        )}
      </div>

      <div className="card">
        <h3>Practise it</h3>
        {relatedExercises.length === 0 && (
          <p className="muted small">No drills are built from this song yet.</p>
        )}
        <ul className="clean">
          {relatedExercises.map((spec) => {
            const id = exerciseId(spec)
            return (
              <li key={id}>
                <button
                  type="button"
                  className="list-item"
                  onClick={() => onNavigate('practice', { exerciseId: id })}
                >
                  <span className="stack" style={{ gap: 2 }}>
                    <span>{spec.title}</span>
                    <span className="tiny faint">{spec.instructions}</span>
                  </span>
                  <Stars value={(exercises[id]?.bestStars ?? 0) as 0 | 1 | 2 | 3} label={false} />
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="card">
        <h3>How it should sound</h3>
        <ul className="clean small muted">
          {song.performanceNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h3>Where these notes came from</h3>
        <p className="small muted">{song.provenance}</p>
      </div>
    </>
  )
}
