/**
 * Writes the tab blocks in `tabs/*.md` from the song charts.
 *
 * Everything between a `<!-- generated:tab ... -->` marker and its closing
 * marker is replaced. Run with `npm run tabs`; `npm run tabs:check` fails when
 * a file is stale, which is what stops a tab and the app disagreeing.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveSignatures } from '../src/content/authoring'
import { renderTab } from '../src/music/tab'
import { SONGS } from '../src/content/songs'
import type { SongChart } from '../src/music/types'

const TABS_DIR = join(process.cwd(), '..', 'tabs')

interface MarkerArgs {
  song: string
  arrangement: string
  from?: number
  to?: number
  columns?: number
  perLine?: number
  counts?: boolean
}

const MARKER = /<!-- generated:tab ([^>]*)-->([\s\S]*?)<!-- \/generated:tab -->/g

function parseArgs(raw: string): MarkerArgs {
  const args: Record<string, string> = {}
  for (const [, key, value] of raw.matchAll(/(\w+)=([^\s]+)/g)) args[key] = value
  if (!args.song || !args.arrangement) {
    throw new Error(`generated:tab needs song= and arrangement=, got: ${raw}`)
  }
  return {
    song: args.song,
    arrangement: args.arrangement,
    from: args.from ? Number(args.from) : undefined,
    to: args.to ? Number(args.to) : undefined,
    columns: args.columns ? Number(args.columns) : undefined,
    perLine: args.perLine ? Number(args.perLine) : undefined,
    counts: args.counts === 'true',
  }
}

function block(args: MarkerArgs): string {
  const song = SONGS.find((candidate: SongChart) => candidate.id === args.song)
  if (!song) throw new Error(`No song with id "${args.song}"`)
  const arrangement = song.arrangements.find((candidate) => candidate.id === args.arrangement)
  if (!arrangement) throw new Error(`No arrangement "${args.arrangement}" in "${args.song}"`)

  const selected = resolveSignatures(arrangement.bars, song.timeSignature).filter(
    (bar) => bar.index >= (args.from ?? -Infinity) && bar.index <= (args.to ?? Infinity),
  )
  const tab = renderTab(selected, song.timeSignature, {
    columnsPerBeat: args.columns,
    barsPerLine: args.perLine,
    showCounts: args.counts,
  })
  return `\n\`\`\`\n${tab}\n\`\`\`\n`
}

function render(source: string): string {
  return source.replace(MARKER, (_match, raw: string) => {
    const args = parseArgs(raw)
    return `<!-- generated:tab ${raw}-->${block(args)}<!-- /generated:tab -->`
  })
}

function main(): void {
  const check = process.argv.includes('--check')
  let stale = 0
  for (const name of ['this-is-the-christ.md', 'angel.md']) {
    const path = join(TABS_DIR, name)
    const current = readFileSync(path, 'utf8')
    const updated = render(current)
    if (current === updated) continue
    stale++
    if (check) {
      console.error(`stale: tabs/${name}`)
    } else {
      writeFileSync(path, updated)
      console.log(`wrote: tabs/${name}`)
    }
  }
  if (check && stale > 0) {
    console.error('Run `npm run tabs` to regenerate.')
    process.exit(1)
  }
  if (!check) console.log(stale === 0 ? 'All tabs already current.' : 'Done.')
}

main()
