import { describe, expect, it } from 'vitest'
import {
  ALL_EXERCISES,
  LESSONS,
  UNITS,
  exerciseById,
  lessonById,
  lessonOrder,
} from '../../src/content/curriculum'
import { FRET_COUNT, STANDARD_TUNING, midiAt } from '../../src/music/fretboard'
import { noteName } from '../../src/music/notes'
import type { Exercise, Lesson } from '../../src/music/types'

const exerciseCases = ALL_EXERCISES.map((item) => ({ name: item.id, item }))
const lessonCases = LESSONS.map((item) => ({ name: item.id, item }))

describe('the exercise catalogue', () => {
  it('gives every exercise a unique id', () => {
    const ids = ALL_EXERCISES.map((item) => item.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('finds an exercise by id', () => {
    expect(exerciseById('song-angel-full')?.title).toContain('Angel')
  })

  it('returns nothing for an unknown exercise id', () => {
    expect(exerciseById('nope')).toBeUndefined()
  })

  it('covers both target songs', () => {
    const ids = ALL_EXERCISES.map((item) => item.id)
    expect(ids.some((id) => id.includes('angel'))).toBe(true)
    expect(ids.some((id) => id.includes('this-is-the-christ'))).toBe(true)
  })
})

describe.each(exerciseCases)('exercise $name', ({ item }: { item: Exercise }) => {
  it('says what to do', () => {
    expect(item.instructions.length).toBeGreaterThan(20)
  })

  it('declares the skills it trains', () => {
    expect(item.skills.length).toBeGreaterThan(0)
  })

  it('asks for at least one note', () => {
    expect(item.notes.length).toBeGreaterThan(0)
  })

  it('can be practised slower than its target tempo', () => {
    expect(item.floorBpm).toBeLessThanOrEqual(item.targetBpm)
    expect(item.floorBpm).toBeGreaterThanOrEqual(30)
  })

  it('sets a tempo a beginner can reach', () => {
    expect(item.targetBpm).toBeLessThanOrEqual(160)
  })

  it('plays every note on a 4-string in standard tuning', () => {
    for (const note of item.notes) {
      expect(note.midi).toBeGreaterThanOrEqual(STANDARD_TUNING[0])
      expect(note.midi).toBeLessThanOrEqual(STANDARD_TUNING[3] + FRET_COUNT)
    }
  })

  it('keeps written pitch and written position in agreement', () => {
    for (const note of item.notes) {
      if (!note.position) continue
      expect(noteName(midiAt(note.position))).toBe(noteName(note.midi))
    }
  })

  it('lists its notes in playing order', () => {
    const starts = item.notes.map((note) => note.startBeat)
    expect(starts).toEqual([...starts].sort((a, b) => a - b))
  })

  it('never asks for two notes at the same instant', () => {
    const starts = item.notes.map((note) => note.startBeat)
    expect(new Set(starts).size).toBe(starts.length)
  })

  it('gives every note a positive length', () => {
    for (const note of item.notes) expect(note.durationBeats).toBeGreaterThan(0)
  })

  it('counts the learner in', () => {
    expect(item.countInBars).toBeGreaterThanOrEqual(1)
  })
})

describe.each(lessonCases)('lesson $name', ({ item }: { item: Lesson }) => {
  it('explains itself before asking for anything', () => {
    expect(item.briefing.length).toBeGreaterThan(0)
  })

  it('summarises what it is for', () => {
    expect(item.summary.length).toBeGreaterThan(20)
  })

  it('references only exercises that exist', () => {
    for (const id of item.exerciseIds) expect(exerciseById(id)).toBeDefined()
  })

  it('requires only lessons that exist', () => {
    for (const id of item.requires) expect(lessonById(id)).toBeDefined()
  })

  it('estimates a session length that fits a sitting', () => {
    expect(item.estimatedMinutes).toBeGreaterThan(0)
    expect(item.estimatedMinutes).toBeLessThanOrEqual(60)
  })
})

describe('the lesson graph', () => {
  const order = lessonOrder()

  it('places every lesson in exactly one unit', () => {
    expect(order.length).toBe(LESSONS.length)
    expect(new Set(order).size).toBe(order.length)
  })

  it('lists only lessons that exist', () => {
    for (const id of order) expect(lessonById(id)).toBeDefined()
  })

  it('introduces a lesson only after everything it requires', () => {
    for (const lesson of LESSONS) {
      for (const required of lesson.requires) {
        expect(order.indexOf(required)).toBeLessThan(order.indexOf(lesson.id))
      }
    }
  })

  it('has no cycles in its prerequisites', () => {
    // Guaranteed by the ordering check above, but asserted directly so the
    // failure says "cycle" rather than "ordering" if the order ever changes.
    const visit = (id: string, seen: Set<string>): void => {
      if (seen.has(id)) throw new Error(`Prerequisite cycle at "${id}"`)
      for (const next of lessonById(id)!.requires) visit(next, new Set([...seen, id]))
    }
    expect(() => LESSONS.forEach((lesson) => visit(lesson.id, new Set()))).not.toThrow()
  })

  it('starts with a lesson that requires nothing', () => {
    expect(lessonById(order[0])!.requires).toEqual([])
  })

  it('uses every exercise in the catalogue in some lesson', () => {
    const used = new Set(LESSONS.flatMap((lesson) => lesson.exerciseIds))
    const orphans = ALL_EXERCISES.filter((item) => !used.has(item.id)).map((item) => item.id)
    expect(orphans).toEqual([])
  })

  it('reaches both target songs', () => {
    const repertoire = UNITS.find((unit) => unit.id === 'repertoire')!
    expect(repertoire.lessonIds).toContain('angel-riff')
    expect(repertoire.lessonIds).toContain('hymn-full')
  })

  it('can be completed in a few hours of focused practice', () => {
    const total = LESSONS.reduce((sum, lesson) => sum + lesson.estimatedMinutes, 0)
    expect(total).toBeGreaterThan(120)
    expect(total).toBeLessThan(600)
  })
})

describe('units', () => {
  it('gives every unit a unique id', () => {
    const ids = UNITS.map((unit) => unit.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('describes what each unit is for', () => {
    for (const unit of UNITS) expect(unit.description.length).toBeGreaterThan(20)
  })

  it('puts at least one lesson in each unit', () => {
    for (const unit of UNITS) expect(unit.lessonIds.length).toBeGreaterThan(0)
  })
})
