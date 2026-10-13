import type { SongChart } from '../../music/types'
import { angel } from './angel'
import { thisIsTheChrist } from './thisIsTheChrist'

export const SONGS: SongChart[] = [thisIsTheChrist, angel]

export function songById(id: string): SongChart | undefined {
  return SONGS.find((song) => song.id === id)
}

export { angel, thisIsTheChrist }
