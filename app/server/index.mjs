#!/usr/bin/env node
/**
 * The coach server.
 *
 * Two jobs, and deliberately nothing else:
 *
 *   1. Hold the Anthropic API key. A key in anything the browser downloads is a
 *      published key, so every model call is proxied through here.
 *   2. Append every take to a JSONL file on disk. The browser's own storage is
 *      per-origin, easy to lose, and invisible to anything outside the tab. The
 *      practice history is the material a better coach will be built from, so
 *      it lives somewhere a person can back up, read, and feed to a model.
 *
 * Zero dependencies on purpose: this has to still start in a year.
 */

import { createServer } from 'node:http'
import { appendFile, mkdir, readFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = resolve(process.env.BASSROOM_DATA_DIR ?? join(HERE, '..', '..', 'data'))
const SESSIONS_DIR = join(DATA_DIR, 'sessions')

const PORT = Number(process.env.BASSROOM_COACH_PORT ?? 8787)
const HOST = process.env.BASSROOM_COACH_HOST ?? '127.0.0.1'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? ''
// Opus is the most capable model available and gives the best feedback. A take
// review is one short call, but if the cost matters, BASSROOM_COACH_MODEL set
// to claude-sonnet-5-5 or claude-haiku-5-5 works with the same prompt.
const MODEL = process.env.BASSROOM_COACH_MODEL ?? 'claude-opus-5-5'
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'
const MAX_BODY_BYTES = 2_000_000

// ---------------------------------------------------------------------------
// HTTP plumbing
// ---------------------------------------------------------------------------

function sendJson(response, status, body) {
  const payload = JSON.stringify(body)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  })
  response.end(payload)
}

async function readJsonBody(request) {
  const chunks = []
  let total = 0
  for await (const chunk of request) {
    total += chunk.length
    if (total > MAX_BODY_BYTES) throw new Error('Request body too large')
    chunks.push(chunk)
  }
  if (total === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

function handleStatus(response) {
  sendJson(response, 200, {
    ready: ANTHROPIC_API_KEY !== '',
    model: ANTHROPIC_API_KEY === '' ? null : MODEL,
    dataDir: SESSIONS_DIR,
  })
}

/**
 * Ask the model to review one take.
 *
 * The browser sends the prompt it was built with, so the prompt stays versioned
 * in the app's source rather than drifting between the two halves.
 */
async function handleReview(request, response) {
  if (ANTHROPIC_API_KEY === '') {
    sendJson(response, 503, { error: 'No ANTHROPIC_API_KEY configured' })
    return
  }

  const payload = await readJsonBody(request)
  if (typeof payload.system !== 'string' || payload.telemetry === undefined) {
    sendJson(response, 400, { error: 'Expected { system, telemetry, recentTakes }' })
    return
  }

  const upstream = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: payload.system,
      messages: [
        {
          role: 'user',
          content: JSON.stringify({
            take: payload.telemetry,
            recentTakes: payload.recentTakes ?? [],
          }),
        },
      ],
    }),
  })

  if (!upstream.ok) {
    const detail = await upstream.text()
    console.error(`Anthropic API ${upstream.status}: ${detail.slice(0, 400)}`)
    sendJson(response, 502, { error: `Model request failed (${upstream.status})` })
    return
  }

  const body = await upstream.json()
  const text = (body.content ?? [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')

  try {
    sendJson(response, 200, JSON.parse(extractJson(text)))
  } catch {
    console.error('Model did not return usable JSON:', text.slice(0, 400))
    sendJson(response, 502, { error: 'Model response was not valid JSON' })
  }
}

/**
 * Models sometimes wrap JSON in a fenced block or a sentence. Take the outermost
 * braces rather than failing on an otherwise good answer.
 */
export function extractJson(text) {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('No JSON object found')
  return text.slice(start, end + 1)
}

/** One file per day, one take per line: greppable, appendable, and diffable. */
export function sessionFileFor(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `takes-${year}-${month}-${day}.jsonl`
}

async function handleRecordTake(request, response) {
  const payload = await readJsonBody(request)
  if (payload.schemaVersion === undefined) {
    sendJson(response, 400, { error: 'Telemetry must carry a schemaVersion' })
    return
  }

  await mkdir(SESSIONS_DIR, { recursive: true })
  const file = join(SESSIONS_DIR, sessionFileFor(new Date()))
  await appendFile(file, `${JSON.stringify(payload)}\n`, 'utf8')
  sendJson(response, 201, { recorded: true, file })
}

async function handleListTakes(response) {
  if (!existsSync(SESSIONS_DIR)) {
    sendJson(response, 200, { files: [], takeCount: 0 })
    return
  }
  const names = (await readdir(SESSIONS_DIR)).filter((name) => name.endsWith('.jsonl')).sort()
  const counts = await Promise.all(names.map((name) => countLines(join(SESSIONS_DIR, name))))
  sendJson(response, 200, {
    files: names.map((name, index) => ({ name, takes: counts[index] })),
    takeCount: counts.reduce((sum, count) => sum + count, 0),
  })
}

async function countLines(path) {
  const text = await readFile(path, 'utf8')
  return text.split('\n').filter((line) => line.trim() !== '').length
}

const ROUTES = [
  {
    method: 'GET',
    path: '/api/coach/status',
    handle: (_request, response) => handleStatus(response),
  },
  { method: 'POST', path: '/api/coach/review', handle: handleReview },
  { method: 'POST', path: '/api/takes', handle: handleRecordTake },
  { method: 'GET', path: '/api/takes', handle: (_request, response) => handleListTakes(response) },
]

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
  const route = ROUTES.find(
    (candidate) => candidate.method === request.method && candidate.path === url.pathname,
  )

  if (!route) {
    sendJson(response, 404, { error: `No route for ${request.method} ${url.pathname}` })
    return
  }

  try {
    await route.handle(request, response)
  } catch (error) {
    console.error(`${request.method} ${url.pathname} failed:`, error)
    if (!response.headersSent) sendJson(response, 500, { error: 'Internal error' })
  }
})

// Importing this file for its helpers must not start a listener.
if (process.argv[1] && process.argv[1].endsWith('index.mjs')) {
  server.listen(PORT, HOST, () => {
    const coach = ANTHROPIC_API_KEY === '' ? 'built-in rules only' : `model ${MODEL}`
    console.log(`Bassroom coach server on http://${HOST}:${PORT} (${coach})`)
    console.log(`Takes are written to ${SESSIONS_DIR}`)
  })
}

export { server }
