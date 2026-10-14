/**
 * Where the app is, and how it got there.
 *
 * A screen is not enough on its own: practising a song arrangement is reached
 * from that song's page, and going back has to land on the song that was open
 * rather than on whichever one the list defaults to.
 */

export type ScreenId = 'today' | 'practice' | 'path' | 'songs' | 'setup' | 'settings'

export interface Place {
  screen: ScreenId
  exerciseId?: string
  songId?: string
}

export type Navigate = (screen: ScreenId, options?: Omit<Place, 'screen'>) => void

export const SCREEN_TITLES: Record<ScreenId, string> = {
  today: 'Today',
  practice: 'Practice',
  path: 'The path',
  songs: 'Songs',
  setup: 'Setup',
  settings: 'Settings',
}

/** True when two places are the same destination, so going there again is not a step. */
export function samePlace(a: Place, b: Place): boolean {
  return a.screen === b.screen && a.exerciseId === b.exerciseId && a.songId === b.songId
}
