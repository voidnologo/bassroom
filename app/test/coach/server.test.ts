import { describe, expect, it } from 'vitest'
import {
  describeBadDiagnostics,
  diagnosticsFileFor,
  extractJson,
  sessionFileFor,
  // @ts-expect-error - the coach server is plain ESM with no type declarations
} from '../../server/index.mjs'

const parse = extractJson as (text: string) => string
const fileFor = sessionFileFor as (date: Date) => string
const diagnosticsFile = diagnosticsFileFor as (date: Date) => string
const describeBad = describeBadDiagnostics as (payload: unknown) => string | null

describe('extractJson', () => {
  it('returns a bare JSON object unchanged', () => {
    expect(JSON.parse(parse('{"a":1}'))).toEqual({ a: 1 })
  })

  it('pulls JSON out of a fenced code block', () => {
    expect(JSON.parse(parse('```json\n{"a":1}\n```'))).toEqual({ a: 1 })
  })

  it('pulls JSON out of a sentence wrapped around it', () => {
    // Models sometimes explain themselves first; an otherwise good answer
    // should not be thrown away over that.
    expect(JSON.parse(parse('Here is the review:\n{"a":1}\nHope that helps.'))).toEqual({ a: 1 })
  })

  it('keeps nested objects intact', () => {
    expect(JSON.parse(parse('x {"a":{"b":[1,2]}} y'))).toEqual({ a: { b: [1, 2] } })
  })

  it('throws when there is no object at all', () => {
    expect(() => parse('no json here')).toThrow(/No JSON object/)
  })

  it('throws when the braces are the wrong way round', () => {
    expect(() => parse('} {')).toThrow(/No JSON object/)
  })
})

describe('sessionFileFor', () => {
  it('names one file per local day', () => {
    expect(fileFor(new Date('2026-03-02T19:00:00'))).toBe('takes-2026-03-02.jsonl')
  })

  it('pads single-digit months and days', () => {
    expect(fileFor(new Date('2026-01-05T10:00:00'))).toBe('takes-2026-01-05.jsonl')
  })

  it('sorts chronologically as a plain string', () => {
    const names = [
      fileFor(new Date('2026-03-02T10:00:00')),
      fileFor(new Date('2026-01-05T10:00:00')),
      fileFor(new Date('2026-12-31T10:00:00')),
    ]
    expect([...names].sort()).toEqual([names[1], names[0], names[2]])
  })
})

describe('diagnosticsFileFor', () => {
  it('sits beside the take log for the same day', () => {
    const day = new Date('2026-10-13T19:00:00')
    expect(diagnosticsFile(day)).toBe('diagnostics-2026-10-13.jsonl')
    expect(fileFor(day)).toBe('takes-2026-10-13.jsonl')
  })
})

describe('describeBadDiagnostics', () => {
  const valid = {
    schemaVersion: 1,
    kind: 'take',
    recordedAt: '2026-10-13T19:00:00.000Z',
    frames: [],
    onsets: [],
  }

  it('accepts a well-formed record', () => {
    expect(describeBad(valid)).toBeNull()
  })

  it.each([
    ['an array', []],
    ['a string', 'take'],
    ['null', null],
  ])('rejects %s as a body', (_name, payload) => {
    expect(describeBad(payload)).toBe('Expected a diagnostics object')
  })

  it('names the field when the kind is one nobody defined', () => {
    expect(describeBad({ ...valid, kind: 'warmup' })).toContain('kind must be')
  })

  it('rejects a timestamp that does not parse, rather than storing it', () => {
    expect(describeBad({ ...valid, recordedAt: 'yesterday' })).toContain('recordedAt must be')
  })

  it('rejects frames that are not an array, which would break every reader', () => {
    expect(describeBad({ ...valid, frames: 42 })).toBe('frames must be an array')
  })

  it('rejects a record with no schema version, because it cannot be read later', () => {
    expect(describeBad({ ...valid, schemaVersion: 0 })).toContain('schemaVersion')
  })
})
