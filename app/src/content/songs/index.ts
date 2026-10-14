import type { SongChart } from '../../music/types'
import { angel } from './angel'
import { thisIsTheChrist } from './thisIsTheChrist'

/**
 * Angel first because it is the easier of the two: the whole part is two
 * notes, so all of its difficulty is rhythm and none of it is fingering. The
 * Songs screen opens on whichever is first here.
 */
export const SONGS: SongChart[] = [angel, thisIsTheChrist]

export function songById(id: string): SongChart | undefined {
  return SONGS.find((song) => song.id === id)
}

export { angel, thisIsTheChrist }
