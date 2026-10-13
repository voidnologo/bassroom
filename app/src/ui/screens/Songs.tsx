import { useState } from 'react'
import { SONGS } from '../../content/songs'
import { resolveSignatures } from '../../content/authoring'
import { SONG_EXERCISE_SPECS } from '../../content/songExercises'
import { renderTab } from '../../music/tab'
import type { SongChart } from '../../music/types'
import { useProgressStore } from '../../state/progressStore'
import { Pill, Stars } from '../components/Indicators'

/** The two target songs: their tab, their arrangements, and where they came from. */
export function Songs({
  onNavigate,
}: {
  onNavigate: (screen: string, exerciseId?: string) => void
}) {
  const [openSongId, setOpenSongId] = useState(SONGS[0].id)

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
              onClick={() => setOpenSongId(song.id)}
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

function SongDetail({
  song,
  onNavigate,
}: {
  song: SongChart
  onNavigate: (screen: string, exerciseId?: string) => void
}) {
  const exercises = useProgressStore((store) => store.snapshot.exercises)
  const [arrangementId, setArrangementId] = useState(song.arrangements[0].id)
  const arrangement = song.arrangements.find((candidate) => candidate.id === arrangementId)!

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
        <pre>{tab}</pre>
      </div>

      <div className="card">
        <h3>Practise it</h3>
        <ul className="clean">
          {relatedExercises.map((spec) => {
            const id = ['song', spec.songId, spec.arrangementId, spec.sectionId]
              .filter(Boolean)
              .join('-')
            return (
              <li key={id}>
                <button
                  type="button"
                  className="list-item"
                  onClick={() => onNavigate('practice', id)}
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
