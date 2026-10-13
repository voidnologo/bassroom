#!/usr/bin/env node
/**
 * Mechanical pre-merge gates.
 *
 * The script does the deterministic half of a review: it finds the changed
 * files and reports every violation it can detect without judgment, in a stable
 * order, so each run starts from the same list. Deciding whether a `triage`
 * finding is a real defect is the reviewer's job, not this script's.
 *
 * Rule IDs refer to .claude/rules/.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const REPO_ROOT = resolve(new URL('../../../..', import.meta.url).pathname)
const APP_DIR = join(REPO_ROOT, 'app')

/** @typedef {{path: string, text: string, lines: string[]}} SourceFile */
/** @typedef {{gate: string, kind: 'fix'|'triage', rule: string, path: string, line: number, message: string}} Finding */

const FIX = 'fix'
const TRIAGE = 'triage'

// ---------------------------------------------------------------------------
// Line-level helpers
// ---------------------------------------------------------------------------

/** True for a line that is entirely a comment, so patterns in prose are ignored. */
function isComment(line) {
  const trimmed = line.trim()
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')
}

function under(file, ...segments) {
  return segments.some((segment) => file.path.includes(segment))
}

/**
 * Walk a file's lines, yielding only code lines, with a flag for whether the
 * line sits inside a constructor body. Allocation is allowed there and not in
 * the per-sample methods that run on the audio thread.
 */
function* codeLines(file) {
  let constructorDepth = null
  let depth = 0
  for (const [index, line] of file.lines.entries()) {
    const opens = (line.match(/\{/g) ?? []).length
    const closes = (line.match(/\}/g) ?? []).length
    const startsConstructor = /\bconstructor\s*\(/.test(line)

    if (!isComment(line)) {
      yield { line, number: index + 1, inConstructor: constructorDepth !== null }
    }

    depth += opens - closes
    if (startsConstructor && constructorDepth === null) constructorDepth = depth - 1
    if (constructorDepth !== null && depth <= constructorDepth) constructorDepth = null
  }
}

function finding(gate, kind, rule, file, number, message) {
  return { gate, kind, rule, path: file.path, line: number, message }
}

// ---------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------

const ALLOCATION_PATTERN =
  /\bnew (?:Float32Array|Float64Array|Array|Map|Set|Uint8Array|Int16Array)\b|\.(?:map|filter|slice|concat|sort|flatMap)\(/

/** AU1: nothing on the audio thread may allocate outside its constructor. */
export function scanAudioAllocations(files) {
  const found = []
  for (const file of files.filter((f) => under(f, 'src/audio/dsp/', 'src/audio/worklet/'))) {
    if (file.path.endsWith('.d.ts')) continue
    for (const { line, number, inConstructor } of codeLines(file)) {
      if (inConstructor || !ALLOCATION_PATTERN.test(line)) continue
      found.push(
        finding('audio-alloc', TRIAGE, 'AU1', file, number,
          'allocation outside a constructor on the audio thread; preallocate and reuse'),
      )
    }
  }
  return found
}

const WEB_AUDIO_PATTERN = /\b(?:AudioContext|AudioWorkletNode|AudioNode|window|document|navigator)\b/

/** AU2: DSP stays testable in plain Node. */
export function scanDspWebAudio(files) {
  const found = []
  for (const file of files.filter((f) => under(f, 'src/audio/dsp/'))) {
    for (const { line, number } of codeLines(file)) {
      if (!WEB_AUDIO_PATTERN.test(line)) continue
      found.push(
        finding('dsp-purity', FIX, 'AU2', file, number,
          'DSP must not reference Web Audio or the DOM'),
      )
    }
  }
  return found
}

// Named explicitly rather than matched as `.createSomething(`, which also
// catches document.createElement and every other unrelated factory.
const AUDIO_NODE_FACTORIES = [
  'createGain',
  'createOscillator',
  'createBiquadFilter',
  'createAnalyser',
  'createMediaStreamSource',
  'createScriptProcessor',
  'createDynamicsCompressor',
  'createBufferSource',
  'createDelay',
  'createConvolver',
  'createStereoPanner',
  'createWaveShaper',
].join('|')

const UI_AUDIO_PATTERN = new RegExp(`new (?:AudioContext|AudioWorkletNode)|\\.(?:${AUDIO_NODE_FACTORIES})\\(`)

/** RC4: components ask the audio layer for a context; they never build one. */
export function scanUiAudio(files) {
  const found = []
  for (const file of files.filter((f) => under(f, 'src/ui/'))) {
    for (const { line, number } of codeLines(file)) {
      if (!UI_AUDIO_PATTERN.test(line)) continue
      found.push(
        finding('ui-audio', FIX, 'RC4', file, number,
          'components must not create audio nodes; request them from src/audio/'),
      )
    }
  }
  return found
}

/** MC1: a bare MIDI integer cannot be proofread. */
export function scanBareMidi(files) {
  const found = []
  for (const file of files.filter((f) => under(f, 'src/content/'))) {
    for (const { line, number } of codeLines(file)) {
      if (!/\bmidi:\s*\d+/.test(line)) continue
      found.push(
        finding('bare-midi', FIX, 'MC1', file, number,
          "write pitches as parseNote('C2'), not as a MIDI number"),
      )
    }
  }
  return found
}

/** MC3: a transcription without a stated source cannot be corrected later. */
export function scanProvenance(files) {
  return files
    .filter((file) => under(file, 'src/content/songs/') && !file.path.endsWith('index.ts'))
    .filter((file) => !/provenance:/.test(file.text))
    .map((file) => finding('provenance', FIX, 'MC3', file, 1, 'song chart has no provenance field'))
}

/** TS4: a focused or skipped test is green while asserting nothing. */
export function scanFocusedTests(files) {
  const found = []
  for (const file of files.filter((f) => under(f, 'test/'))) {
    for (const { line, number } of codeLines(file)) {
      if (!/\b(?:describe|it|test)\.(?:only|skip)\b|\bx(?:it|describe)\(/.test(line)) continue
      found.push(
        finding('test-focus', FIX, 'TS4', file, number, 'remove .only / .skip before committing'),
      )
    }
  }
  return found
}

/** TS8: an unseeded random makes a failure unreproducible. */
export function scanTestRandomness(files) {
  const found = []
  for (const file of files.filter((f) => under(f, 'test/'))) {
    for (const { line, number } of codeLines(file)) {
      if (!/Math\.random\(/.test(line)) continue
      found.push(finding('test-random', FIX, 'TS8', file, number, 'seed the randomness'))
    }
  }
  return found
}

/** TY1: `any` turns the checker off where it is needed most. */
export function scanAnyTypes(files) {
  const found = []
  for (const file of files.filter((f) => under(f, 'src/', 'server/'))) {
    if (file.path.endsWith('.d.ts')) continue
    for (const { line, number } of codeLines(file)) {
      if (!/\bas any\b|:\s*any\b|<any>/.test(line)) continue
      found.push(finding('any-type', FIX, 'TY1', file, number, 'replace any with unknown and narrow'))
    }
  }
  return found
}

const SECRET_PATTERN = /(?:api[_-]?key|secret|token|ANTHROPIC_API_KEY)\s*[:=]\s*['"][^'"]{8,}/i

/** CO3: a key in anything the browser loads is a published key. */
export function scanClientSecrets(files) {
  const found = []
  for (const file of files.filter((f) => under(f, 'src/'))) {
    for (const { line, number } of codeLines(file)) {
      if (!SECRET_PATTERN.test(line)) continue
      found.push(
        finding('client-secret', FIX, 'CO3', file, number,
          'a literal credential in browser code; move the call to server/'),
      )
    }
  }
  return found
}

/** TY9: a log line is invisible to the person using the app. */
export function scanConsoleLogs(files) {
  const found = []
  for (const file of files.filter((f) => under(f, 'src/'))) {
    for (const { line, number } of codeLines(file)) {
      if (!/console\.log\(/.test(line)) continue
      found.push(finding('console-log', FIX, 'TY9', file, number, 'remove console.log from src/'))
    }
  }
  return found
}

const PITCH_MATH_PATTERN = /Math\.pow\(2,|2\s*\*\*\s*\(|440\b/

/** TY7: pitch arithmetic exists once, in src/music/notes.ts. */
export function scanPitchMathReinvention(files) {
  const found = []
  const exempt = ['src/music/notes.ts', 'test/']
  for (const file of files.filter((f) => under(f, 'src/') && !exempt.some((e) => f.path.includes(e)))) {
    for (const { line, number } of codeLines(file)) {
      if (!PITCH_MATH_PATTERN.test(line)) continue
      found.push(
        finding('pitch-math', TRIAGE, 'TY7', file, number,
          'looks like hand-rolled pitch arithmetic; src/music/notes.ts already has it'),
      )
    }
  }
  return found
}

export const GATES = [
  scanAudioAllocations,
  scanDspWebAudio,
  scanUiAudio,
  scanBareMidi,
  scanProvenance,
  scanFocusedTests,
  scanTestRandomness,
  scanAnyTypes,
  scanClientSecrets,
  scanConsoleLogs,
  scanPitchMathReinvention,
]

/** Run every static gate and return findings ordered for a stable report. */
export function runGates(files) {
  return GATES.flatMap((gate) => gate(files)).sort(
    (a, b) => a.path.localeCompare(b.path) || a.line - b.line,
  )
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function git(args) {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim()
}

/**
 * `git diff HEAD` sees only uncommitted work and returns nothing on a branch
 * that is ready for review, so the diff is taken against the merge base.
 */
function changedPaths(base) {
  const mergeBase = base ?? safeMergeBase()
  const tracked = mergeBase ? git(['diff', '--name-only', '--diff-filter=d', mergeBase]) : ''
  const untracked = git(['ls-files', '--others', '--exclude-standard'])
  return [...new Set([...tracked.split('\n'), ...untracked.split('\n')])].filter(Boolean)
}

function safeMergeBase() {
  try {
    return git(['merge-base', 'origin/main', 'HEAD'])
  } catch {
    return null
  }
}

function loadFiles(paths) {
  return paths
    .filter((path) => /\.(ts|tsx|mjs)$/.test(path))
    .map((path) => join(REPO_ROOT, path))
    .filter(existsSync)
    .map((absolute) => {
      const text = readFileSync(absolute, 'utf8')
      return { path: relative(REPO_ROOT, absolute), text, lines: text.split('\n') }
    })
}

function report(findings) {
  if (findings.length === 0) {
    console.log('No static findings.')
    return
  }
  for (const kind of [FIX, TRIAGE]) {
    const group = findings.filter((f) => f.kind === kind)
    if (group.length === 0) continue
    console.log(`\n${kind.toUpperCase()} (${group.length})`)
    for (const f of group) console.log(`  ${f.path}:${f.line}  [${f.rule} ${f.gate}] ${f.message}`)
  }
}

function main() {
  const args = process.argv.slice(2)
  const baseIndex = args.indexOf('--base')
  const base = baseIndex === -1 ? null : args[baseIndex + 1]
  const paths = args.includes('--all') ? allSourcePaths() : changedPaths(base)
  const files = loadFiles(paths)
  const findings = runGates(files)

  if (args.includes('--json')) {
    console.log(JSON.stringify({ fileCount: files.length, findings }, null, 2))
  } else {
    console.log(`Scanned ${files.length} changed source file(s).`)
    report(findings)
  }

  process.exit(findings.some((f) => f.kind === FIX) ? 1 : 0)
}

function allSourcePaths() {
  return git(['ls-files', 'app/src', 'app/test', 'app/server']).split('\n').filter(Boolean)
}

if (process.argv[1] && process.argv[1].endsWith('gates.mjs')) main()
