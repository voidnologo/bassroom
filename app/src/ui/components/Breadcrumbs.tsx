import type { Place } from '../navigation'

/**
 * The trail that was actually walked, not a fixed hierarchy.
 *
 * Practice is reached from the path and from a song's page, and the way back
 * differs, so the trail is the navigation history rather than a parent chain
 * worked out from the screen alone.
 */
export function Breadcrumbs({
  trail,
  labelFor,
  onGo,
}: {
  trail: Place[]
  labelFor: (place: Place) => string
  onGo: (index: number) => void
}): JSX.Element | null {
  if (trail.length < 2) return null
  const previous = trail.length - 2

  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      <button type="button" className="btn btn-sm crumb-back" onClick={() => onGo(previous)}>
        <span aria-hidden="true">←</span> Back to {labelFor(trail[previous])}
      </button>
      <ol>
        {trail.map((place, index) => (
          <li key={`${place.screen}-${place.songId ?? place.exerciseId ?? index}`}>
            {index === trail.length - 1 ? (
              <span aria-current="page">{labelFor(place)}</span>
            ) : (
              <button type="button" className="crumb-link" onClick={() => onGo(index)}>
                {labelFor(place)}
              </button>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
